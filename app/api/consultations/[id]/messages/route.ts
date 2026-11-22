// ==========================================================
// GET  /api/consultations/:id/messages?after=<ISO time>
// POST /api/consultations/:id/messages  { body }
//
// In-app messaging between the two parties only. Sending is allowed
// while the consultation is ACCEPTED; history stays readable after.
// Reading marks the other party's messages as read.
// ==========================================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { messageSchema } from "@/lib/lawyers/validation";
import { canMessage } from "@/lib/lawyers/consultation-rules";
import { loadForParty } from "@/lib/lawyers/consultations";
import { firstIssue, readJson, requireUser } from "@/lib/lawyers/http";

type Params = { params: Promise<{ id: string }> };
const PAGE = 200;

const view = (m: { id: string; senderId: string; body: string; createdAt: Date; readAt: Date | null }, me: string) => ({
  id: m.id,
  body: m.body,
  createdAt: m.createdAt,
  mine: m.senderId === me,
  read: m.readAt !== null,
});

export async function GET(req: NextRequest, { params }: Params) {
  const g = await requireUser();
  if (g.error) return g.error;
  const { id } = await params;
  const found = await loadForParty(id, g.user);
  if (!found) return apiError("NOT_FOUND", "Consultation not found.", 404);

  const afterRaw = req.nextUrl.searchParams.get("after");
  const after = afterRaw ? new Date(afterRaw) : null;
  if (after && Number.isNaN(after.getTime())) return apiError("VALIDATION_ERROR", "Invalid 'after' time.", 422);

  const messages = await prisma.consultationMessage.findMany({
    where: { requestId: id, ...(after ? { createdAt: { gt: after } } : {}) },
    orderBy: { createdAt: "asc" },
    take: PAGE,
  });
  await prisma.consultationMessage.updateMany({
    where: { requestId: id, senderId: { not: g.user.id }, readAt: null },
    data: { readAt: new Date() },
  });
  return apiSuccess({
    status: found.request.status,
    canSend: canMessage(found.request.status),
    messages: messages.map((m) => view(m, g.user.id)),
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const g = await requireUser("consultationMessage");
  if (g.error) return g.error;
  const { id } = await params;
  const found = await loadForParty(id, g.user);
  if (!found) return apiError("NOT_FOUND", "Consultation not found.", 404);
  if (!canMessage(found.request.status)) {
    return apiError(
      "NOT_OPEN",
      found.request.status === "PENDING"
        ? "Messaging opens once the advocate accepts the request."
        : "This consultation has ended. Messages can no longer be sent.",
      409
    );
  }

  const parsed = messageSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("VALIDATION_ERROR", firstIssue(parsed.error), 422);

  const [message] = await prisma.$transaction([
    prisma.consultationMessage.create({ data: { requestId: id, senderId: g.user.id, body: parsed.data.body } }),
    // Keeps the consultation lists ordered by latest activity.
    prisma.consultationRequest.update({ where: { id }, data: { updatedAt: new Date() } }),
  ]);
  return apiSuccess({ message: view(message, g.user.id) }, 201);
}
