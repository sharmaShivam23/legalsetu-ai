// ==========================================================
// LegalSetu — consultations: loading and serialising (server)
// ==========================================================

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { availableActions, type Party } from "./consultation-rules";
import { photoUrl } from "./server";
import type { SessionUser } from "./server";
import { isDemoOperator } from "./demo-operator";

export const consultationInclude = {
  lawyer: true,
  citizen: { select: { id: true, name: true } },
  shares: { include: { case: { select: { id: true, title: true } } }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.ConsultationRequestInclude;

export type LoadedConsultation = Prisma.ConsultationRequestGetPayload<{ include: typeof consultationInclude }>;

/**
 * The request and the caller's side of it — or null when the caller is
 * not a party. Every consultation route goes through here, so a guessed
 * id can never expose someone else's conversation.
 */
export async function loadForParty(
  id: string,
  user: SessionUser
): Promise<{ request: LoadedConsultation; party: Party } | null> {
  const request = await prisma.consultationRequest
    .findUnique({ where: { id }, include: consultationInclude })
    .catch(() => null);
  if (!request) return null;
  if (request.citizenId === user.id) return { request, party: "CITIZEN" };
  if (request.lawyer.userId === user.id) return { request, party: "LAWYER" };
  // A demo advocate has no real owner: demo operators answer for them.
  if (request.lawyer.isDemo && isDemoOperator(user)) return { request, party: "LAWYER" };
  return null;
}

/** First name + initial: enough for the advocate to address the client, no more. */
export function clientDisplayName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "LegalSetu user";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function serializeConsultation(r: LoadedConsultation, party: Party, unread = 0, lastMessageAt: Date | null = null) {
  return {
    id: r.id,
    status: r.status,
    party,
    actions: availableActions(r.status, party),
    category: r.category,
    language: r.language,
    urgency: r.urgency,
    summary: r.summary,
    declineReason: r.declineReason,
    createdAt: r.createdAt,
    respondedAt: r.respondedAt,
    closedAt: r.closedAt,
    lastMessageAt,
    unread,
    client: { name: clientDisplayName(r.citizen.name) },
    lawyer: {
      id: r.lawyer.id,
      fullName: r.lawyer.fullName,
      photoUrl: photoUrl(r.lawyer),
      enrolmentNumber: r.lawyer.enrolmentNumber,
      city: r.lawyer.city,
      isDemo: r.lawyer.isDemo,
    },
    shares: r.shares.map((s) => ({
      id: s.id,
      caseId: s.caseId,
      caseTitle: s.case.title,
      createdAt: s.createdAt,
      revokedAt: s.revokedAt,
      active: s.revokedAt === null,
    })),
  };
}

export type SerializedConsultation = ReturnType<typeof serializeConsultation>;

/** Unread counts and latest message time per request, for the viewer. */
export async function messageStats(requestIds: string[], viewerId: string) {
  if (requestIds.length === 0) return new Map<string, { unread: number; last: Date | null }>();
  const [unread, last] = await Promise.all([
    prisma.consultationMessage.groupBy({
      by: ["requestId"],
      where: { requestId: { in: requestIds }, senderId: { not: viewerId }, readAt: null },
      _count: { _all: true },
    }),
    prisma.consultationMessage.groupBy({
      by: ["requestId"],
      where: { requestId: { in: requestIds } },
      _max: { createdAt: true },
    }),
  ]);
  const map = new Map<string, { unread: number; last: Date | null }>();
  for (const id of requestIds) map.set(id, { unread: 0, last: null });
  for (const u of unread) map.get(u.requestId)!.unread = u._count._all;
  for (const l of last) map.get(l.requestId)!.last = l._max.createdAt;
  return map;
}
