// ==========================================================
// POST /api/admin/lawyers/:id/review
// { decision: APPROVE | REJECT | SUSPEND | REINSTATE, reason? }
//
//   SUBMITTED → APPROVE → VERIFIED (valid one year)
//   SUBMITTED → REJECT  → REJECTED (advocate sees the reason, may fix and resubmit)
//   VERIFIED / SUBMITTED → SUSPEND → SUSPENDED (hidden; pending requests declined)
//   SUSPENDED → REINSTATE → SUBMITTED (must be reviewed again)
// ==========================================================

import { NextRequest } from "next/server";
import type { LawyerStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { logger } from "@/lib/logging/logger";
import { reviewSchema } from "@/lib/lawyers/validation";
import { audit, missingForSubmission, notifyLater } from "@/lib/lawyers/server";
import { firstIssue, readJson, requireAdmin } from "@/lib/lawyers/http";

type Params = { params: Promise<{ id: string }> };

const RULES: Record<string, { from: LawyerStatus[]; to: LawyerStatus }> = {
  APPROVE: { from: ["SUBMITTED"], to: "VERIFIED" },
  REJECT: { from: ["SUBMITTED"], to: "REJECTED" },
  SUSPEND: { from: ["VERIFIED", "SUBMITTED"], to: "SUSPENDED" },
  REINSTATE: { from: ["SUSPENDED"], to: "SUBMITTED" },
};

export async function POST(req: NextRequest, { params }: Params) {
  const g = await requireAdmin();
  if (g.error) return g.error;
  const { id } = await params;

  const parsed = reviewSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("VALIDATION_ERROR", firstIssue(parsed.error), 422);
  const { decision, reason } = parsed.data;

  const p = await prisma.lawyerProfile
    .findUnique({ where: { id }, include: { documents: true, user: { select: { email: true, name: true } } } })
    .catch(() => null);
  if (!p) return apiError("NOT_FOUND", "Profile not found.", 404);
  if (p.userId === g.user.id) return apiError("FORBIDDEN", "You cannot review your own profile.", 403);

  const rule = RULES[decision];
  if (!rule.from.includes(p.status)) {
    return apiError("INVALID_STATE", `A ${p.status.toLowerCase()} profile cannot be ${decision.toLowerCase()}d.`, 409);
  }
  if (decision === "APPROVE") {
    const missing = missingForSubmission(p, p.documents);
    if (missing.length) return apiError("INCOMPLETE", `Cannot approve — missing: ${missing.join(", ")}.`, 422);
  }

  const now = new Date();
  let applied = false;
  await prisma.$transaction(async (tx) => {
    // Conditional on the status we checked, so two admins acting at once
    // cannot both apply a decision.
    const { count } = await tx.lawyerProfile.updateMany({
      where: { id, status: p.status },
      data: {
        status: rule.to,
        reviewedAt: now,
        reviewedById: g.user.id,
        rejectionReason: decision === "APPROVE" || decision === "REINSTATE" ? null : reason,
        ...(decision === "APPROVE" ? { verifiedAt: now } : {}),
        ...(decision === "REINSTATE" ? { submittedAt: now, verifiedAt: null } : {}),
      },
    });
    if (count === 0) return;
    applied = true;
    if (decision === "SUSPEND") {
      await tx.consultationRequest.updateMany({
        where: { lawyerProfileId: id, status: "PENDING" },
        data: { status: "DECLINED", respondedAt: now, declineReason: "This advocate is currently unavailable on LegalSetu." },
      });
    }
  });
  if (!applied) return apiError("CONFLICT", "Another admin changed this profile just now. Reload it.", 409);
  const after = await prisma.lawyerProfile.findUniqueOrThrow({ where: { id } });

  await audit(g.user.id, `LAWYER_${decision}`, { profileId: id, reason: reason ?? null });
  logger.info("Lawyer profile reviewed", { profileId: id, decision, by: g.user.id });

  const mail: Record<string, { subject: string; heading: string; body: string }> = {
    APPROVE: {
      subject: "Your LegalSetu advocate profile is verified",
      heading: "You're verified",
      body: "Your Bar Council documents have been checked and your profile now appears in the LegalSetu lawyer directory. Verification is valid for one year.",
    },
    REJECT: {
      subject: "Your LegalSetu advocate profile needs changes",
      heading: "We could not verify your profile yet",
      body: `Reason: ${reason}\n\nFix the details or upload clearer documents, then submit again.`,
    },
    SUSPEND: {
      subject: "Your LegalSetu advocate profile is suspended",
      heading: "Your profile has been suspended",
      body: `Reason: ${reason}\n\nYour profile is hidden from the directory. Contact LegalSetu support if you think this is a mistake.`,
    },
    REINSTATE: {
      subject: "Your LegalSetu advocate profile is back under review",
      heading: "Your profile is under review again",
      body: "Your suspension has been lifted and your profile will be reviewed again shortly.",
    },
  };
  notifyLater(p.user.email, { name: p.user.name, ...mail[decision], ctaLabel: "Open my advocate profile", ctaPath: "/dashboard/advocate/profile" });

  return apiSuccess({ status: after.status });
}
