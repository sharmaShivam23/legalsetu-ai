// ==========================================================
// GET /api/consultations/:id/cases/:caseId — the advocate's read-only
// view of a case the client shared on this consultation.
//
// Access requires ALL of: the caller is this consultation's advocate,
// the consultation is still open, and the share has not been revoked.
// Private chat conversations are never included. Every view is logged.
// ==========================================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { lawyerCanReadShares } from "@/lib/lawyers/consultation-rules";
import { audit } from "@/lib/lawyers/server";
import { loadForParty } from "@/lib/lawyers/consultations";
import { requireUser } from "@/lib/lawyers/http";
import { serializeTracker } from "@/lib/rights-clock/service";

type Params = { params: Promise<{ id: string; caseId: string }> };

const TEXT_LIMIT = 4000;

export async function GET(_req: NextRequest, { params }: Params) {
  const g = await requireUser("apiDefault");
  if (g.error) return g.error;
  const { id, caseId } = await params;

  const found = await loadForParty(id, g.user);
  const share = found?.request.shares.find((s) => s.caseId === caseId && s.revokedAt === null);
  const allowed = found && (found.party === "CITIZEN" || lawyerCanReadShares(found.request.status));
  if (!found || !share || !allowed) return apiError("NOT_FOUND", "Shared case not found.", 404);

  const c = await prisma.case.findFirst({
    where: { id: caseId, userId: found.request.citizenId },
    include: {
      custodyTrackers: { orderBy: { createdAt: "asc" } },
      firDrafts: { orderBy: { updatedAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!c) return apiError("NOT_FOUND", "Shared case not found.", 404);

  if (found.party === "LAWYER") await audit(g.user.id, "CASE_SHARE_VIEWED", { requestId: id, caseId });

  return apiSuccess({
    case: {
      id: c.id,
      title: c.title,
      summary: c.summary,
      status: c.status,
      jurisdiction: c.jurisdiction,
      nextAction: c.nextAction,
      nextActionDue: c.nextActionDue,
      createdAt: c.createdAt,
    },
    trackers: c.custodyTrackers.map((t) => {
      const s = serializeTracker(t);
      // The advocate needs the facts and the computation, not account settings.
      return { id: s.id, personName: s.personName, relationship: s.relationship, firNumber: s.firNumber, policeStation: s.policeStation, courtName: s.courtName, prisonName: s.prisonName, input: s.input, result: s.result };
    }),
    firDrafts: c.firDrafts.map((f) => ({
      id: f.id,
      status: f.status,
      incidentType: f.incidentType,
      incidentDate: f.incidentDate,
      location: f.location,
      draftText: f.draftText ? f.draftText.slice(0, TEXT_LIMIT * 3) : null,
      updatedAt: f.updatedAt,
    })),
    documents: c.documents.map((d) => ({
      id: d.id,
      title: d.title,
      fileType: d.fileType,
      createdAt: d.createdAt,
      extractedText: d.extractedText ? d.extractedText.slice(0, TEXT_LIMIT) : null,
      truncated: (d.extractedText?.length ?? 0) > TEXT_LIMIT,
    })),
    sharedAt: share.createdAt,
  });
}
