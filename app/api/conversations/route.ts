// ==========================================================
// LegalSetu — Conversations: list + create
// ----------------------------------------------------------
// Every query filters by the signed-in user's id at the Prisma
// layer, not just in the UI. A legal conversation can contain
// deeply personal details, so one user must never be able to
// read or touch another's threads.
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging/logger";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  }
  const userId = (session.user as any).id as string;

  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50,
    100
  );

  try {
    const [conversations, modeGroups, totalMessages] = await Promise.all([
      prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { messages: true } },
          // Newest message doubles as the list preview and gives the
          // conversation's mode for filtering, without a second round trip.
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true, role: true, mode: true },
          },
        },
      }),
      // Mode breakdown across every message this user has ever sent,
      // not just the page loaded — the stats header should reflect the
      // whole account, and this is cheap since it's grouped in the DB.
      prisma.message.groupBy({
        by: ["mode"],
        where: { conversation: { userId } },
        _count: { _all: true },
      }),
      prisma.message.count({ where: { conversation: { userId } } }),
    ]);

    const modeBreakdown: Record<string, number> = {};
    for (const g of modeGroups) {
      modeBreakdown[g.mode ?? "quick"] = (modeBreakdown[g.mode ?? "quick"] ?? 0) + g._count._all;
    }

    return apiSuccess({
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messageCount: c._count.messages,
        preview: c.messages[0]?.content.slice(0, 120) ?? "",
        mode: c.messages[0]?.mode ?? "quick",
      })),
      stats: {
        totalConversations: await prisma.conversation.count({ where: { userId } }),
        totalMessages,
        modeBreakdown,
      },
    });
  } catch (err) {
    logger.error("Conversation list failed", { userId, errorType: String(err) });
    return apiError("LIST_FAILED", "Could not load your conversations.", 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  }
  const userId = (session.user as any).id as string;

  const rateLimit = await checkRateLimit(userId, "apiDefault");
  if (!rateLimit.success) {
    return apiError("RATE_LIMITED", "Too many requests.", 429);
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid conversation.", 422);
  }

  try {
    const conversation = await prisma.conversation.create({
      data: { userId, title: parsed.data.title ?? "New conversation" },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    return apiSuccess({ conversation }, 201);
  } catch (err) {
    logger.error("Conversation create failed", {
      userId,
      errorType: String(err),
    });
    return apiError("CREATE_FAILED", "Could not start a new chat.", 500);
  }
}
