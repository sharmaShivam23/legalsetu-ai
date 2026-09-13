// ==========================================================
// LegalSetu — One conversation: load, rename, delete
// ----------------------------------------------------------
// Ownership is enforced on every operation by including
// `userId` in the WHERE clause, so a guessed id from another
// account returns 404 rather than someone else's legal thread.
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { logger } from "@/lib/logging/logger";

export const runtime = "nodejs";

const renameSchema = z.object({
  title: z.string().min(1).max(200),
});

type Params = { params: Promise<{ id: string }> };

/** Returns the conversation only if this user owns it. */
async function assertOwned(id: string, userId: string): Promise<boolean> {
  const found = await prisma.conversation.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  return Boolean(found);
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  }
  const userId = (session.user as any).id as string;
  const { id } = await params;

  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            content: true,
            language: true,
            evidenceLevel: true,
            mode: true,
            kind: true,
            createdAt: true,
            citations: {
              select: {
                id: true,
                section: true,
                snippet: true,
                legalSource: {
                  select: {
                    id: true,
                    title: true,
                    actName: true,
                    jurisdiction: true,
                    officialUrl: true,
                    verificationStatus: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      return apiError("NOT_FOUND", "Conversation not found.", 404);
    }

    return apiSuccess({ conversation });
  } catch (err) {
    logger.error("Conversation load failed", { userId, errorType: String(err) });
    return apiError("LOAD_FAILED", "Could not open that conversation.", 500);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  }
  const userId = (session.user as any).id as string;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Title must be 1-200 characters.", 422);
  }

  try {
    if (!(await assertOwned(id, userId))) {
      return apiError("NOT_FOUND", "Conversation not found.", 404);
    }

    const conversation = await prisma.conversation.update({
      where: { id },
      data: { title: parsed.data.title.trim() },
      select: { id: true, title: true, updatedAt: true },
    });

    return apiSuccess({ conversation });
  } catch (err) {
    logger.error("Conversation rename failed", {
      userId,
      errorType: String(err),
    });
    return apiError("RENAME_FAILED", "Could not rename that conversation.", 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  }
  const userId = (session.user as any).id as string;
  const { id } = await params;

  try {
    if (!(await assertOwned(id, userId))) {
      return apiError("NOT_FOUND", "Conversation not found.", 404);
    }

    // Messages and their citations cascade away with the conversation.
    await prisma.conversation.delete({ where: { id } });

    logger.info("Conversation deleted", { userId, conversationId: id });
    return apiSuccess({ deleted: true, id });
  } catch (err) {
    logger.error("Conversation delete failed", {
      userId,
      errorType: String(err),
    });
    return apiError("DELETE_FAILED", "Could not delete that conversation.", 500);
  }
}
