// ==========================================================
// LegalSetu — memory: view and delete
// ----------------------------------------------------------
// Anything remembered about a person must be visible to that
// person and removable by them. That is a baseline expectation
// for an assistant that remembers, and more so here, where a
// memory can describe someone's assault, debt or eviction.
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging/logger";
import { listMemories, deleteMemory, clearMemories } from "@/lib/memory/memory";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  }
  const userId = (session.user as any).id as string;

  const memories = await listMemories(userId);
  return apiSuccess({ memories });
}

const deleteSchema = z.object({
  /** Omit to clear everything. */
  id: z.string().uuid().optional(),
});

export async function DELETE(req: NextRequest) {
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
  const parsed = deleteSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid request.", 422);
  }

  try {
    if (parsed.data.id) {
      // deleteMemory scopes by userId, so one user cannot delete another's.
      const removed = await deleteMemory(userId, parsed.data.id);
      if (!removed) return apiError("NOT_FOUND", "That memory no longer exists.", 404);
      return apiSuccess({ deleted: 1 });
    }

    const count = await clearMemories(userId);
    logger.info("User cleared all memories", { userId, count });
    return apiSuccess({ deleted: count });
  } catch (err) {
    logger.error("Memory deletion failed", {
      userId,
      errorType: String(err).slice(0, 200),
    });
    return apiError("DELETE_FAILED", "Could not update your memories.", 500);
  }
}
