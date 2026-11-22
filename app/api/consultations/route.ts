// ==========================================================
// GET  /api/consultations — the caller's consultations, both as a
//                            client and (for advocates) as the lawyer
// POST /api/consultations — request a consultation with an advocate,
//                            optionally sharing one case (consent)
// ==========================================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { logger } from "@/lib/logging/logger";
import { MAX_PENDING_REQUESTS, label } from "@/lib/lawyers/constants";
import { consultationCreateSchema } from "@/lib/lawyers/validation";
import { audit, isListable, notifyLater } from "@/lib/lawyers/server";
import { consultationInclude, messageStats, serializeConsultation } from "@/lib/lawyers/consultations";
import { firstIssue, readJson, requireUser } from "@/lib/lawyers/http";

export async function GET() {
  const g = await requireUser();
  if (g.error) return g.error;
  const user = g.user;

  const [asClient, asLawyer] = await Promise.all([
    prisma.consultationRequest.findMany({
      where: { citizenId: user.id },
      include: consultationInclude,
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.consultationRequest.findMany({
      where: { lawyer: { userId: user.id } },
      include: consultationInclude,
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);
  const stats = await messageStats([...asClient, ...asLawyer].map((r) => r.id), user.id);
  const ser = (r: (typeof asClient)[number], party: "CITIZEN" | "LAWYER") => {
    const s = stats.get(r.id)!;
    return serializeConsultation(r, party, s.unread, s.last);
  };
  return apiSuccess({
    asClient: asClient.map((r) => ser(r, "CITIZEN")),
    asLawyer: asLawyer.map((r) => ser(r, "LAWYER")),
  });
}

export async function POST(req: NextRequest) {
  const g = await requireUser("consultationCreate");
  if (g.error) return g.error;
  const user = g.user;

  const parsed = consultationCreateSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("VALIDATION_ERROR", firstIssue(parsed.error), 422);
  const d = parsed.data;

  const lawyer = await prisma.lawyerProfile.findUnique({
    where: { id: d.lawyerId },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!lawyer || !isListable(lawyer)) return apiError("NOT_FOUND", "Advocate not found.", 404);
  if (lawyer.userId === user.id) return apiError("INVALID", "You cannot request a consultation with yourself.", 422);
  if (!lawyer.acceptingClients) return apiError("NOT_ACCEPTING", "This advocate is not taking new requests right now.", 409);

  const [openWithLawyer, pending] = await Promise.all([
    prisma.consultationRequest.findFirst({
      where: { citizenId: user.id, lawyerProfileId: lawyer.id, status: { in: ["PENDING", "ACCEPTED"] } },
      select: { id: true },
    }),
    prisma.consultationRequest.count({ where: { citizenId: user.id, status: "PENDING" } }),
  ]);
  if (openWithLawyer) {
    return apiError("ALREADY_OPEN", "You already have an open request with this advocate.", 409);
  }
  if (pending >= MAX_PENDING_REQUESTS) {
    return apiError(
      "TOO_MANY_PENDING",
      `You can have at most ${MAX_PENDING_REQUESTS} requests waiting for a reply. Cancel one, or wait for a response.`,
      409
    );
  }
  if (d.caseId) {
    const owned = await prisma.case.findFirst({ where: { id: d.caseId, userId: user.id }, select: { id: true } });
    if (!owned) return apiError("NOT_FOUND", "Case not found.", 404);
  }

  const created = await prisma.consultationRequest.create({
    data: {
      citizenId: user.id,
      lawyerProfileId: lawyer.id,
      category: d.category,
      language: d.language,
      urgency: d.urgency,
      summary: d.summary,
      ...(d.caseId ? { shares: { create: { caseId: d.caseId } } } : {}),
    },
    include: consultationInclude,
  });

  await audit(user.id, "CONSULTATION_REQUESTED", { requestId: created.id, lawyerProfileId: lawyer.id, sharedCase: Boolean(d.caseId) });
  logger.info("Consultation requested", { userId: user.id, requestId: created.id });
  notifyLater(lawyer.user.email, {
    name: lawyer.user.name,
    subject: d.urgency === "URGENT" ? "Urgent consultation request on LegalSetu" : "New consultation request on LegalSetu",
    heading: d.urgency === "URGENT" ? "An urgent consultation request is waiting" : "You have a new consultation request",
    body: `A LegalSetu user has asked for help with a ${label.practiceArea(d.category).toLowerCase()} matter${
      d.caseId ? " and shared their case file with you" : ""
    }. Open your requests to read it and accept or decline.`,
    ctaLabel: "Open my requests",
    ctaPath: `/dashboard/consultations/${created.id}`,
  });

  return apiSuccess({ consultation: serializeConsultation(created, "CITIZEN") }, 201);
}
