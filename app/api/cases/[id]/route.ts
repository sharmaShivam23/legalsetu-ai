import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;
  const { id } = await params;

  // User isolation: only return the case if it belongs to this user,
  // and every nested list below is scoped to the same case, so a
  // guessed id can never surface another user's chats or documents.
  const found = await prisma.case.findFirst({
    where: { id, userId },
    include: {
      conversations: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          createdAt: true,
          _count: { select: { messages: true } },
        },
      },
      documents: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          fileType: true,
          status: true,
          createdAt: true,
        },
      },
      firDrafts: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          status: true,
          incidentType: true,
          draftVersion: true,
          draftText: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!found) return apiError("NOT_FOUND", "Case not found.", 404);

  const { firDrafts, ...rest } = found;

  return apiSuccess({
    case: {
      ...rest,
      // The client only needs to know a draft exists, never its full
      // text — that stays behind the FIR PDF endpoint's own auth check.
      firDrafts: firDrafts.map((f) => ({
        id: f.id,
        status: f.status,
        incidentType: f.incidentType,
        draftVersion: f.draftVersion,
        hasGeneratedDraft: Boolean(f.draftText),
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      })),
    },
  });
}

const CASE_STATUSES = ["OPEN", "IN_PROGRESS", "ESCALATED", "RESOLVED", "CLOSED"] as const;
const CLOSED_STATUSES = new Set(["RESOLVED", "CLOSED"]);

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(2000).nullable().optional(),
  jurisdiction: z.string().max(100).nullable().optional(),
  status: z.enum(CASE_STATUSES).optional(),
  nextAction: z.string().max(300).nullable().optional(),
  nextActionDue: z.string().datetime().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid changes.", 422);

  const existing = await prisma.case.findFirst({ where: { id, userId }, select: { id: true, status: true } });
  if (!existing) return apiError("NOT_FOUND", "Case not found.", 404);

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.nextActionDue !== undefined) {
    data.nextActionDue = parsed.data.nextActionDue ? new Date(parsed.data.nextActionDue) : null;
  }

  // Track when a case actually closed, and clear that timestamp if it
  // is reopened — the field should mean exactly what it says.
  if (parsed.data.status) {
    const willBeClosed = CLOSED_STATUSES.has(parsed.data.status);
    const wasClosed = CLOSED_STATUSES.has(existing.status);
    if (willBeClosed && !wasClosed) data.closedAt = new Date();
    if (!willBeClosed && wasClosed) data.closedAt = null;
  }

  try {
    const updated = await prisma.case.update({ where: { id }, data });
    return apiSuccess({ case: updated });
  } catch (err) {
    logger.error("Case update failed", { userId, caseId: id, errorType: String(err).slice(0, 200) });
    return apiError("UPDATE_FAILED", "Could not save those changes.", 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;
  const { id } = await params;

  const existing = await prisma.case.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) return apiError("NOT_FOUND", "Case not found.", 404);

  try {
    // Conversations, documents and FIR drafts are NOT deleted — the
    // foreign keys are ON DELETE SET NULL, so they simply become
    // unlinked. Deleting a case folder should never destroy someone's
    // chat history or a document they uploaded.
    await prisma.case.delete({ where: { id } });
    logger.info("Case deleted", { userId, caseId: id });
    return apiSuccess({ deleted: true });
  } catch (err) {
    logger.error("Case deletion failed", { userId, caseId: id, errorType: String(err).slice(0, 200) });
    return apiError("DELETE_FAILED", "Could not delete the case.", 500);
  }
}
