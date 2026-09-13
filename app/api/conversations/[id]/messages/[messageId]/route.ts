// ==========================================================
// LegalSetu — Delete a message, or truncate from it onward
// ----------------------------------------------------------
// Two jobs:
//   DELETE .../messages/:id             -> remove just that message
//   DELETE .../messages/:id?andAfter=1  -> remove it and everything
//                                          after it in the thread
//
// The second form is what "edit this message" and "regenerate"
// rely on: the thread is rewound to the chosen point, then the
// new turn is streamed in fresh. Without it, editing would
// leave the old answer stranded below the new one.
// ==========================================================

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { logger } from "@/lib/logging/logger";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; messageId: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  }
  const userId = (session.user as any).id as string;
  const { id, messageId } = await params;

  const andAfter = req.nextUrl.searchParams.get("andAfter") === "1";

  try {
    // Ownership: the message must belong to a conversation owned by
    // this user. Checked in one query so a foreign id cannot be probed.
    const message = await prisma.message.findFirst({
      where: { id: messageId, conversation: { id, userId } },
      select: { id: true, createdAt: true },
    });

    if (!message) {
      return apiError("NOT_FOUND", "Message not found.", 404);
    }

    if (!andAfter) {
      await prisma.message.delete({ where: { id: messageId } });
      return apiSuccess({ deleted: 1, mode: "single" });
    }

    // Remove this message and every later one in the same thread.
    const result = await prisma.message.deleteMany({
      where: {
        conversationId: id,
        createdAt: { gte: message.createdAt },
      },
    });

    logger.info("Thread truncated", {
      userId,
      conversationId: id,
      removed: result.count,
    });

    return apiSuccess({ deleted: result.count, mode: "truncate" });
  } catch (err) {
    logger.error("Message delete failed", { userId, errorType: String(err) });
    return apiError("DELETE_FAILED", "Could not delete that message.", 500);
  }
}
