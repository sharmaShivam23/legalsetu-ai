// ==========================================================
// LegalSetu — call lifecycle events from the voice bridge
// ----------------------------------------------------------
// The bridge reports three things: the call connected, each turn's
// timings, and the call ended. Authenticated by the call's own signed
// token — never a browser session — and able to touch only that one
// CallSession.
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { callTokenFromHeaders, verifyCallToken } from "@/lib/calls/token";
import { logger } from "@/lib/logging/logger";

export const runtime = "nodejs";

const turnMetric = z.object({
  n: z.number().int().min(1).max(500),
  firstAudioMs: z.number().nullable(),
  sttMs: z.number(),
  llmFirstTokenMs: z.number().nullable(),
  ttsFirstMs: z.number().nullable(),
  sttProvider: z.string().max(32),
  ttsProvider: z.string().max(32).nullable(),
  kind: z.string().max(16).nullable(),
  fillerPlayed: z.boolean(),
  interrupted: z.boolean(),
});

const schema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("started") }),
  z.object({ event: z.literal("turn"), metric: turnMetric }),
  z.object({ event: z.literal("ended"), durationSec: z.number().min(0).max(7200), reason: z.string().max(40) }),
]);

type Metric = z.infer<typeof turnMetric>;

function summarise(turns: Metric[]) {
  const audio = turns.map((t) => t.firstAudioMs).filter((v): v is number => v != null).sort((a, b) => a - b);
  const pick = (q: number) => (audio.length ? audio[Math.min(audio.length - 1, Math.floor(q * audio.length))] : null);
  return {
    turns: audio.length,
    avgFirstAudioMs: audio.length ? Math.round(audio.reduce((a, b) => a + b, 0) / audio.length) : null,
    p50FirstAudioMs: pick(0.5),
    p90FirstAudioMs: pick(0.9),
  };
}

export async function POST(req: NextRequest) {
  const payload = verifyCallToken(callTokenFromHeaders(req.headers));
  if (!payload) return apiError("UNAUTHORIZED", "Invalid call token.", 401);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid event.", 422);
  const body = parsed.data;

  const call = await prisma.callSession.findFirst({
    where: { id: payload.cid, userId: payload.uid },
    select: { id: true, status: true, metrics: true, answeredAt: true, requestedAt: true },
  });
  if (!call) return apiError("NOT_FOUND", "Unknown call.", 404);

  try {
    if (body.event === "started") {
      // A call that has already ended (Twilio reported it failed, say) must not
      // be revived by a late event from the bridge.
      if (["FAILED", "BUSY", "NO_ANSWER", "CANCELED", "COMPLETED"].includes(call.status)) {
        return apiSuccess({ ok: true, ignored: true });
      }
      await prisma.callSession.update({
        where: { id: call.id },
        data: { status: "IN_PROGRESS", answeredAt: call.answeredAt ?? new Date() },
      });
    } else if (body.event === "turn") {
      const prior = ((call.metrics as { turns?: Metric[] } | null)?.turns ?? []).filter((t) => t.n !== body.metric.n);
      const turns = [...prior, body.metric].sort((a, b) => a.n - b.n);
      await prisma.callSession.update({
        where: { id: call.id },
        data: { turnCount: turns.length, metrics: { turns, summary: summarise(turns) } },
      });
    } else {
      const turns = ((call.metrics as { turns?: Metric[] } | null)?.turns ?? []) as Metric[];
      const endedAt = new Date();
      await prisma.callSession.update({
        where: { id: call.id },
        data: {
          // Never overwrite a more specific failure Twilio already reported.
          status: ["FAILED", "BUSY", "NO_ANSWER", "CANCELED"].includes(call.status) ? call.status : "COMPLETED",
          endedAt,
          durationSec: Math.round(body.durationSec),
          metrics: { turns, summary: summarise(turns), endReason: body.reason },
        },
      });
      // The conversation was created before the call rang with a
      // placeholder title; give it one a person can find in History.
      const when = (call.answeredAt ?? call.requestedAt).toLocaleString("en-IN", {
        day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata",
      });
      await prisma.conversation
        .updateMany({ where: { id: payload.conv, userId: payload.uid }, data: { title: `📞 Phone call · ${when}` } })
        .catch(() => {});
    }
    return apiSuccess({ ok: true });
  } catch (err) {
    logger.error("Call event failed", { callId: call.id, event: body.event, errorType: String(err).slice(0, 160) });
    return apiError("EVENT_FAILED", "Could not record that event.", 500);
  }
}
