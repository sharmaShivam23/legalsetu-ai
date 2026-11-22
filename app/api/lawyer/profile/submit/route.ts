// ==========================================================
// POST /api/lawyer/profile/submit — send the profile for admin review
// Allowed from DRAFT or REJECTED, or to renew an expired verification.
// ==========================================================

import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { logger } from "@/lib/logging/logger";
import { audit, missingForSubmission, notifyLater, ownerView, verificationExpiresOn } from "@/lib/lawyers/server";
import { requireUser } from "@/lib/lawyers/http";

export async function POST() {
  const g = await requireUser("apiDefault");
  if (g.error) return g.error;

  const profile = await prisma.lawyerProfile.findUnique({ where: { userId: g.user.id }, include: { documents: true } });
  if (!profile) return apiError("NO_PROFILE", "Save your profile details first.", 409);

  const expires = verificationExpiresOn(profile);
  const renewing = profile.status === "VERIFIED" && expires !== null && expires <= new Date();
  if (!(profile.status === "DRAFT" || profile.status === "REJECTED" || renewing)) {
    const why: Record<string, string> = {
      SUBMITTED: "Your profile is already under review.",
      VERIFIED: "Your profile is already verified.",
      SUSPENDED: "This profile is suspended. Contact LegalSetu support.",
    };
    return apiError("INVALID_STATE", why[profile.status] ?? "This profile cannot be submitted now.", 409);
  }

  const missing = missingForSubmission(profile, profile.documents);
  if (missing.length) {
    return apiError("INCOMPLETE", `Complete these first: ${missing.join(", ")}.`, 422);
  }

  const updated = await prisma.lawyerProfile.update({
    where: { id: profile.id },
    data: { status: "SUBMITTED", submittedAt: new Date(), rejectionReason: null },
    include: { documents: true },
  });
  await audit(g.user.id, "LAWYER_SUBMITTED", { profileId: profile.id, renewing });
  logger.info("Lawyer profile submitted for review", { userId: g.user.id, profileId: profile.id });

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true, name: true }, take: 10 });
  for (const a of admins) {
    notifyLater(a.email, {
      name: a.name,
      subject: "Advocate profile waiting for verification",
      heading: "A new advocate profile needs review",
      body: "An advocate has submitted their Bar Council documents for verification. Review them in the admin panel.",
      ctaLabel: "Open the review queue",
      ctaPath: "/dashboard/admin/lawyers",
    });
  }

  return apiSuccess({ profile: ownerView(updated, updated.documents) });
}
