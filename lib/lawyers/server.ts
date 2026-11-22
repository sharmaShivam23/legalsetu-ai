// ==========================================================
// LegalSetu — Verified Lawyer Connect: server helpers
// ==========================================================

import { after } from "next/server";
import { emailLink } from "@/lib/email/links";
import type { LawyerDocument, LawyerProfile, Prisma, Role } from "@prisma/client";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { sendEmail } from "@/lib/email/mailer";
import { buildNotificationEmail } from "@/lib/email/templates";
import { DOCUMENT_TYPE_KEYS, VERIFICATION_VALID_DAYS, label } from "./constants";
import { boundingBox, distanceKm } from "./geo";
import type { SearchParams } from "./validation";

const DAY_MS = 86_400_000;

// ---------- Who is asking ----------

export interface SessionUser {
  id: string;
  role: Role;
  name: string | null;
  email: string;
}

/**
 * The signed-in user, with the role read from the DATABASE — not from
 * the session token, which keeps whatever role the user had when they
 * signed in. Approval powers must never rest on a stale token.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) return null;
  return prisma.user.findUnique({ where: { id }, select: { id: true, role: true, name: true, email: true } });
}

// ---------- Listing rules ----------

export function verificationExpiresOn(p: Pick<LawyerProfile, "verifiedAt">): Date | null {
  return p.verifiedAt ? new Date(p.verifiedAt.getTime() + VERIFICATION_VALID_DAYS * DAY_MS) : null;
}

/** Shown in the directory only when verified within the last year. */
export function isListable(p: Pick<LawyerProfile, "status" | "verifiedAt">, now = new Date()): boolean {
  const exp = verificationExpiresOn(p);
  return p.status === "VERIFIED" && exp !== null && exp > now;
}

export function listableWhere(now = new Date()): Prisma.LawyerProfileWhereInput {
  return { status: "VERIFIED", verifiedAt: { gt: new Date(now.getTime() - VERIFICATION_VALID_DAYS * DAY_MS) } };
}

// ---------- Serialisers (explicit whitelists) ----------

export const photoUrl = (p: Pick<LawyerProfile, "id" | "photoKey" | "updatedAt">) =>
  p.photoKey ? `/api/lawyers/${p.id}/photo?v=${p.updatedAt.getTime()}` : null;

/**
 * The public card. Only Rule 36 "permitted details": no phone, no
 * email, no documents, no ratings. Built field by field so a new column
 * can never leak into the directory by accident.
 */
export function publicCard(p: LawyerProfile, distance?: number, now = new Date()) {
  return {
    id: p.id,
    fullName: p.fullName,
    photoUrl: photoUrl(p),
    barCouncil: p.barCouncil,
    barCouncilName: label.barCouncil(p.barCouncil),
    enrolmentNumber: p.enrolmentNumber,
    enrolmentYear: p.enrolmentYear,
    yearsOfPractice: Math.max(0, now.getFullYear() - p.enrolmentYear),
    practiceAreas: p.practiceAreas,
    courts: p.courts,
    languages: p.languages,
    bio: p.bio,
    officeAddress: p.officeAddress,
    city: p.city,
    pincode: p.pincode,
    latitude: p.latitude,
    longitude: p.longitude,
    legalAidPanel: p.legalAidPanel,
    proBono: p.proBono,
    acceptingClients: p.acceptingClients,
    isDemo: p.isDemo,
    distanceKm: distance === undefined ? null : Math.round(distance * 10) / 10,
  };
}

export type PublicLawyerCard = ReturnType<typeof publicCard>;

const REQUIRED_PROFILE_FIELDS: (keyof LawyerProfile)[] = [
  "fullName",
  "barCouncil",
  "enrolmentNumber",
  "officeAddress",
  "city",
  "pincode",
];

/** What still stands between this profile and review. */
export function missingForSubmission(p: LawyerProfile, docs: Pick<LawyerDocument, "type">[]): string[] {
  const missing: string[] = [];
  for (const f of REQUIRED_PROFILE_FIELDS) if (!p[f]) missing.push(`profile: ${String(f)}`);
  if (!p.practiceAreas.length) missing.push("profile: practiceAreas");
  if (!p.courts.length) missing.push("profile: courts");
  if (!p.languages.length) missing.push("profile: languages");
  if (!p.photoKey) missing.push("photo");
  const have = new Set(docs.map((d) => d.type));
  for (const t of DOCUMENT_TYPE_KEYS) if (!have.has(t)) missing.push(`document: ${t}`);
  return missing;
}

/** The advocate's own view of their profile and its review state. */
export function ownerView(p: LawyerProfile, docs: LawyerDocument[], now = new Date()) {
  const expires = verificationExpiresOn(p);
  return {
    ...publicCard(p, undefined, now),
    gender: p.gender,
    aibeNumber: p.aibeNumber,
    status: p.status,
    listed: isListable(p, now),
    submittedAt: p.submittedAt,
    verifiedAt: p.verifiedAt,
    verificationExpiresOn: expires,
    verificationExpired: p.status === "VERIFIED" && expires !== null && expires <= now,
    rejectionReason: p.rejectionReason,
    documents: docs.map((d) => ({ id: d.id, type: d.type, contentType: d.contentType, sizeBytes: d.sizeBytes, uploadedAt: d.createdAt })),
    missing: missingForSubmission(p, docs),
  };
}

// ---------- Search ----------

export const PAGE_SIZE = 20;
/** Rows pulled from the bounding box before the exact distance check. */
const CANDIDATE_LIMIT = 500;
/**
 * "All distances" reads every listed advocate that matches the filters
 * and orders them in memory. Fine for thousands of advocates; beyond
 * that, move the distance ordering into SQL (PostGIS / earthdistance).
 */
const ALL_LIMIT = 5000;

export interface SearchInput extends SearchParams {
  /** Search origin. Without one, results are listed alphabetically. */
  lat?: number;
  lng?: number;
  /** Omitted = all distances. */
  radiusKm?: number;
}

export async function searchLawyers(params: SearchInput, now = new Date()) {
  const hasOrigin = params.lat !== undefined && params.lng !== undefined;
  const box = hasOrigin && params.radiusKm ? boundingBox(params.lat!, params.lng!, params.radiusKm) : null;
  const where: Prisma.LawyerProfileWhereInput = {
    ...listableWhere(now),
    ...(box
      ? { latitude: { gte: box.minLat, lte: box.maxLat }, longitude: { gte: box.minLng, lte: box.maxLng } }
      : {}),
    ...(params.area ? { practiceAreas: { has: params.area } } : {}),
    ...(params.language ? { languages: { has: params.language } } : {}),
    ...(params.court ? { courts: { has: params.court } } : {}),
    ...(params.gender ? { gender: params.gender } : {}),
    ...(params.legalAid ? { OR: [{ legalAidPanel: true }, { proBono: true }] } : {}),
    ...(params.available ? { acceptingClients: true } : {}),
  };
  const candidates = await prisma.lawyerProfile.findMany({ where, take: box ? CANDIDATE_LIMIT : ALL_LIMIT });
  // Neutral ordering (BCI Rule 36): distance only, or name when there is
  // no location to measure from. Ties by id for a stable order.
  const ranked = candidates
    .map((p) => ({ p, d: hasOrigin ? distanceKm(params.lat!, params.lng!, p.latitude, p.longitude) : undefined }))
    .filter((x) => !params.radiusKm || x.d === undefined || x.d <= params.radiusKm)
    .sort((a, b) =>
      a.d !== undefined && b.d !== undefined
        ? a.d - b.d || (a.p.id < b.p.id ? -1 : 1)
        : a.p.fullName.localeCompare(b.p.fullName) || (a.p.id < b.p.id ? -1 : 1)
    );
  const start = (params.page - 1) * PAGE_SIZE;
  return {
    total: ranked.length,
    page: params.page,
    pageSize: PAGE_SIZE,
    lawyers: ranked.slice(start, start + PAGE_SIZE).map((x) => publicCard(x.p, x.d, now)),
  };
}

// ---------- Side effects that must never break a request ----------

export async function audit(userId: string | null, action: string, metadata: Record<string, unknown>) {
  try {
    await prisma.auditLog.create({ data: { userId, action, metadata: metadata as Prisma.InputJsonValue } });
  } catch (err) {
    logger.warn("Audit log write failed", { action, errorType: String(err).slice(0, 200) });
  }
}

export function appUrl(path: string): string {
  return emailLink(path);
}

type NotifyMail = { name?: string | null; subject: string; heading: string; body: string; ctaLabel: string; ctaPath: string };

/**
 * Sends the email AFTER the response has gone out. A slow SMTP server
 * (Gmail can take 20+ seconds) must never make "Accept" or "Send
 * request" hang. Outside a request scope (scripts, tests) `after` is
 * unavailable, so the send simply runs without being awaited.
 */
export function notifyLater(to: string | null | undefined, mail: NotifyMail): void {
  const task = () => notify(to, mail);
  try {
    after(task);
  } catch {
    void task();
  }
}

export async function notify(
  to: string | null | undefined,
  mail: { name?: string | null; subject: string; heading: string; body: string; ctaLabel: string; ctaPath: string }
) {
  if (!to) return;
  try {
    const built = buildNotificationEmail({
      name: mail.name ?? undefined,
      subject: mail.subject,
      heading: mail.heading,
      body: mail.body,
      ctaLabel: mail.ctaLabel,
      ctaUrl: appUrl(mail.ctaPath),
    });
    await sendEmail({ to, ...built });
  } catch (err) {
    logger.warn("Notification email failed", { errorType: String(err).slice(0, 200) });
  }
}
