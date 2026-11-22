// ==========================================================
// LegalSetu — request and list phone calls
// ----------------------------------------------------------
// POST  "Call me": LegalSetu phones the number the signed-in user gives.
// GET   the user's call history, with timings.
//
// LegalSetu always calls the user, never the reverse, so every call
// begins with an explicit, consented request from an authenticated
// account. Because a call costs money and rings a real phone, the
// limits here are deliberately tight: Indian mobiles only, one call at
// a time, and a daily cap per account AND per number (so one person
// cannot use an account to repeatedly ring somebody else).
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging/logger";
import { isSupportedLanguage } from "@/lib/i18n/languages";
import { hashPhone, maskPhone, normalizeIndianMobile } from "@/lib/calls/phone";
import { callSecret, signCallToken } from "@/lib/calls/token";
import {
  TwilioError,
  bridgeHttpUrl,
  bridgeStreamUrl,
  buildStreamTwiml,
  createCall,
  explainTwilioError,
  mapCallStatus,
  twilioConfig,
} from "@/lib/calls/twilio";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_PER_USER_PER_DAY = 5;
const MAX_PER_NUMBER_PER_DAY = 3;
const ACTIVE = ["REQUESTED", "RINGING", "IN_PROGRESS"];

const schema = z.object({
  phone: z.string().min(5).max(30),
  language: z.string().min(2).max(10).default("hi"),
  mode: z.enum(["case", "quick"]).default("case"),
  /** The caller has agreed to be called and to the conversation being saved. */
  consent: z.literal(true, { message: "You must agree to receive the call." }),
});

/** Why calls are unavailable, or null when everything needed is configured. */
function unavailableReason(): string | null {
  if (!twilioConfig()) return "Phone calls are not set up on this server (Twilio credentials are missing).";
  if (!bridgeStreamUrl()) return "Phone calls are not set up on this server (the voice bridge address is missing).";
  return null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  const userId = (session.user as any).id as string;

  const unavailable = unavailableReason();
  if (unavailable) return apiError("CALLS_UNAVAILABLE", unavailable, 503);

  // Cheap spam protection first; the tight per-hour call limit comes AFTER
  // validation so that mistyped numbers do not use up a person's calls.
  const general = await checkRateLimit(userId, "apiDefault");
  if (!general.success) return apiError("RATE_LIMITED", "Too many requests. Please slow down.", 429);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request.", 422);
  }
  const { language, mode } = parsed.data;
  if (!isSupportedLanguage(language)) return apiError("UNSUPPORTED_LANGUAGE", "That language is not supported.", 422);

  const phone = normalizeIndianMobile(parsed.data.phone);
  if (!phone.ok) return apiError("INVALID_PHONE", phone.reason, 422);

  const limit = await checkRateLimit(userId, "callRequest");
  if (!limit.success) return apiError("RATE_LIMITED", "Too many call requests. Please try again later.", 429);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const phoneHash = hashPhone(phone.e164, callSecret());

  const [active, today, forNumber] = await Promise.all([
    prisma.callSession.findFirst({
      where: { userId, status: { in: ACTIVE }, requestedAt: { gt: new Date(Date.now() - 15 * 60 * 1000) } },
      select: { id: true },
    }),
    prisma.callSession.count({ where: { userId, requestedAt: { gt: since } } }),
    prisma.callSession.count({ where: { phoneHash, requestedAt: { gt: since } } }),
  ]);
  if (active) return apiError("CALL_IN_PROGRESS", "You already have a call in progress.", 409);
  if (today >= MAX_PER_USER_PER_DAY) {
    return apiError("DAILY_LIMIT", `You can request up to ${MAX_PER_USER_PER_DAY} calls a day. Please try tomorrow.`, 429);
  }
  if (forNumber >= MAX_PER_NUMBER_PER_DAY) {
    return apiError("NUMBER_LIMIT", "That number has already been called several times today. Please try tomorrow.", 429);
  }

  // The transcript lives in a normal conversation, created now so every
  // spoken turn is saved as it happens and survives a dropped call.
  const conversation = await prisma.conversation.create({
    data: { userId, title: "📞 Phone call (connecting…)" },
    select: { id: true },
  });
  const call = await prisma.callSession.create({
    data: { userId, conversationId: conversation.id, phoneMasked: maskPhone(phone.e164), phoneHash, language, mode },
    select: { id: true },
  });

  const token = signCallToken({
    cid: call.id,
    uid: userId,
    conv: conversation.id,
    lang: language,
    mode,
    exp: Math.floor(Date.now() / 1000) + 30 * 60,
  });

  // Prepare the spoken phrases while the phone rings, so the greeting plays at once.
  const bridge = bridgeHttpUrl();
  if (bridge) void fetch(`${bridge}/warm?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(5000) }).catch(() => {});

  try {
    const placed = await createCall(twilioConfig()!, {
      to: phone.e164,
      twiml: buildStreamTwiml(bridgeStreamUrl()!, token),
    });
    await prisma.callSession.update({
      where: { id: call.id },
      data: { callSid: placed.sid, status: mapCallStatus(placed.status) },
    });
    logger.info("Call requested", { callId: call.id, userId, language, mode });
    return apiSuccess({ id: call.id, status: mapCallStatus(placed.status) }, 201);
  } catch (err) {
    const reason = err instanceof TwilioError ? explainTwilioError(err) : "The phone service is not reachable right now.";
    logger.error("Call could not be placed", {
      callId: call.id,
      code: err instanceof TwilioError ? err.code : null,
      errorType: String(err).slice(0, 160),
    });
    await prisma.callSession.update({ where: { id: call.id }, data: { status: "FAILED", failureReason: reason, endedAt: new Date() } });
    return apiError("CALL_FAILED", reason, 502);
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  const userId = (session.user as any).id as string;

  const calls = await prisma.callSession.findMany({
    where: { userId },
    orderBy: { requestedAt: "desc" },
    take: 30,
    select: {
      id: true,
      conversationId: true,
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
    },
  });
  return apiSuccess({ calls, available: unavailableReason() === null, unavailableReason: unavailableReason() });
}
