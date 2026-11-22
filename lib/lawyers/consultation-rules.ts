// ==========================================================
// LegalSetu — consultation state machine (pure, client-safe)
// ----------------------------------------------------------
//   PENDING ──accept (lawyer)──▶ ACCEPTED ──close (either)──▶ CLOSED
//      │ ╰──decline (lawyer)──▶ DECLINED
//      ╰────cancel (citizen)──▶ CANCELLED
//
// Messaging is open only while ACCEPTED. A shared case is readable
// by the lawyer while the request is PENDING (to decide) or ACCEPTED,
// and never after it ends or the share is revoked.
// ==========================================================

export type ConsultationStatusValue = "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "CLOSED";
export type ConsultationAction = "accept" | "decline" | "cancel" | "close";
export type Party = "CITIZEN" | "LAWYER";

const TRANSITIONS: Record<ConsultationAction, { from: ConsultationStatusValue[]; by: Party[]; to: ConsultationStatusValue }> = {
  accept: { from: ["PENDING"], by: ["LAWYER"], to: "ACCEPTED" },
  decline: { from: ["PENDING"], by: ["LAWYER"], to: "DECLINED" },
  cancel: { from: ["PENDING"], by: ["CITIZEN"], to: "CANCELLED" },
  close: { from: ["ACCEPTED"], by: ["CITIZEN", "LAWYER"], to: "CLOSED" },
};

export function nextStatus(
  current: ConsultationStatusValue,
  action: ConsultationAction,
  party: Party
): { ok: true; status: ConsultationStatusValue } | { ok: false; reason: string } {
  const t = TRANSITIONS[action];
  if (!t.by.includes(party)) return { ok: false, reason: `Only the ${t.by.join(" or ").toLowerCase()} can ${action} this request.` };
  if (!t.from.includes(current)) return { ok: false, reason: `This request is ${current.toLowerCase()} and cannot be ${action === "accept" ? "accepted" : `${action}${action.endsWith("e") ? "d" : "ed"}`}.` };
  return { ok: true, status: t.to };
}

export const isOpen = (s: ConsultationStatusValue) => s === "PENDING" || s === "ACCEPTED";
export const canMessage = (s: ConsultationStatusValue) => s === "ACCEPTED";
export const lawyerCanReadShares = (s: ConsultationStatusValue) => s === "PENDING" || s === "ACCEPTED";

export function availableActions(status: ConsultationStatusValue, party: Party): ConsultationAction[] {
  return (Object.keys(TRANSITIONS) as ConsultationAction[]).filter((a) => nextStatus(status, a, party).ok);
}
