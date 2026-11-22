// ==========================================================
// LegalSetu — one call: live status, and hang up
// ----------------------------------------------------------
// GET     the call's state. While it is still in flight this also asks
//         Twilio, so the page shows "ringing" -> "on call" -> "ended"
//         without needing a publicly reachable webhook.
// DELETE  end the call now.
// ==========================================================

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { logger } from "@/lib/logging/logger";
import { TERMINAL_STATUSES, fetchCall, hangupCall, mapCallStatus, twilioConfig, type CallStatus } from "@/lib/calls/twilio";

export const runtime = "nodejs";
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

const SELECT = {
  id: true,
  conversationId: true,
  callSid: true,
  phoneMasked: true,
  language: true,
  mode: true,
  status: true,
  failureReason: true,
  requestedAt: true,
  answeredAt: true,
  endedAt: true,
  durationSec: true,
  turnCount: true,
  metrics: true,
} as const;

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  const userId = (session.user as any).id as string;
  const { id } = await params;

  let call = await prisma.callSession.findFirst({ where: { id, userId }, select: SELECT });
  if (!call) return apiError("NOT_FOUND", "Call not found.", 404);

  const cfg = twilioConfig();
  if (cfg && call.callSid && !TERMINAL_STATUSES.includes(call.status as CallStatus)) {
    try {
      const live = await fetchCall(cfg, call.callSid);
      const status = mapCallStatus(live.status);
      // The bridge reports IN_PROGRESS itself; never step backwards from it.
      const keep = call.status === "IN_PROGRESS" && status === "RINGING";
      if (!keep && status !== call.status) {
        const ended = TERMINAL_STATUSES.includes(status);
        call = await prisma.callSession.update({
          where: { id },
          data: {
            status,
            ...(ended ? { endedAt: call.endedAt ?? new Date(), durationSec: call.durationSec ?? live.duration ?? 0 } : {}),
            ...(status === "NO_ANSWER" ? { failureReason: "The call was not answered." } : {}),
            ...(status === "BUSY" ? { failureReason: "The line was busy." } : {}),
            ...(status === "FAILED" && !call.failureReason ? { failureReason: "The call could not be connected." } : {}),
          },
          select: SELECT,
        });
      }
    } catch (err) {
      logger.warn("Could not refresh call status", { callId: id, errorType: String(err).slice(0, 120) });
    }
  }

  const { callSid: _omit, ...safe } = call;
  return apiSuccess({ call: safe });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  const userId = (session.user as any).id as string;
  const { id } = await params;

  const call = await prisma.callSession.findFirst({ where: { id, userId }, select: { id: true, callSid: true, status: true } });
  if (!call) return apiError("NOT_FOUND", "Call not found.", 404);
  if (TERMINAL_STATUSES.includes(call.status as CallStatus)) return apiSuccess({ ended: true });

  const cfg = twilioConfig();
  try {
    if (cfg && call.callSid) await hangupCall(cfg, call.callSid);
    await prisma.callSession.update({
      where: { id },
      data: { status: call.status === "IN_PROGRESS" ? "COMPLETED" : "CANCELED", endedAt: new Date() },
    });
    return apiSuccess({ ended: true });
  } catch (err) {
    logger.error("Hang-up failed", { callId: id, errorType: String(err).slice(0, 140) });
    return apiError("HANGUP_FAILED", "Could not end the call.", 502);
  }
}
