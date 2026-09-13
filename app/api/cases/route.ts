import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { caseSchema } from "@/lib/validation/schemas";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

/**
 * A "case" is what ties everything else in LegalSetu together: the
 * chats about a matter, the documents uploaded for it, and any FIR
 * draft prepared for it. Without counts and a status filter this list
 * is just a table of titles, so both are computed here rather than
 * left for the client to guess at.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const status = req.nextUrl.searchParams.get("status");
  const query = req.nextUrl.searchParams.get("q")?.trim();

  const cases = await prisma.case
    .findMany({
      where: {
        userId,
        ...(status ? { status: status as any } : {}),
        ...(query ? { title: { contains: query, mode: "insensitive" } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        summary: true,
        status: true,
        jurisdiction: true,
        nextAction: true,
        nextActionDue: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { conversations: true, documents: true, firDrafts: true },
        },
      },
    })
    .catch((err) => {
      logger.warn("Case list failed", { userId, errorType: String(err).slice(0, 200) });
      return [];
    });

  return apiSuccess({
    cases: cases.map((c) => ({
      id: c.id,
      title: c.title,
      summary: c.summary,
      status: c.status,
      jurisdiction: c.jurisdiction,
      nextAction: c.nextAction,
      nextActionDue: c.nextActionDue,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      conversationCount: c._count.conversations,
      documentCount: c._count.documents,
      firDraftCount: c._count.firDrafts,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => null);
  const parsed = caseSchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid case data.", 422);

  try {
    const created = await prisma.case.create({
      data: { userId, ...parsed.data },
    });
    logger.info("Case created", { userId, caseId: created.id });
    return apiSuccess({ case: created }, 201);
  } catch (err) {
    logger.error("Case creation failed", { userId, errorType: String(err).slice(0, 200) });
    return apiError("CREATE_FAILED", "Could not create the case. Please try again.", 500);
  }
}
