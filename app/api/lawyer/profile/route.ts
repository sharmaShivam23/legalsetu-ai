// ==========================================================
// GET /api/lawyer/profile — the signed-in advocate's own profile
// PUT /api/lawyer/profile — create or update it
//
// Creating a profile makes the account a LAWYER account. Changing an
// identity field (name, Bar Council, enrolment) on a profile that is
// submitted or verified sends it back for review, so a verified badge
// can never be carried over to a different identity.
// ==========================================================

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { logger } from "@/lib/logging/logger";
import { lawyerProfileSchema, IDENTITY_FIELDS } from "@/lib/lawyers/validation";
import { audit, ownerView } from "@/lib/lawyers/server";
import { firstIssue, readJson, requireUser } from "@/lib/lawyers/http";

export async function GET() {
  const g = await requireUser();
  if (g.error) return g.error;
  const profile = await prisma.lawyerProfile.findUnique({
    where: { userId: g.user.id },
    include: { documents: { orderBy: { createdAt: "asc" } } },
  });
  return apiSuccess({ role: g.user.role, profile: profile ? ownerView(profile, profile.documents) : null });
}

/** PATCH { acceptingClients } — the Client Desk availability switch. */
export async function PATCH(req: NextRequest) {
  const g = await requireUser("apiDefault");
  if (g.error) return g.error;
  const body = (await readJson(req)) as { acceptingClients?: unknown } | null;
  if (typeof body?.acceptingClients !== "boolean") {
    return apiError("VALIDATION_ERROR", "acceptingClients must be true or false.", 422);
  }
  const { count } = await prisma.lawyerProfile.updateMany({
    where: { userId: g.user.id },
    data: { acceptingClients: body.acceptingClients },
  });
  if (count === 0) return apiError("NO_PROFILE", "No advocate profile.", 404);
  return apiSuccess({ acceptingClients: body.acceptingClients });
}

export async function PUT(req: NextRequest) {
  const g = await requireUser("apiDefault");
  if (g.error) return g.error;
  const user = g.user;
  if (user.role === "ADMIN" || user.role === "RESEARCHER") {
    return apiError("FORBIDDEN", "Staff accounts cannot hold an advocate profile. Register a separate account.", 403);
  }

  const parsed = lawyerProfileSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("VALIDATION_ERROR", firstIssue(parsed.error), 422);
  const d = parsed.data;

  const existing = await prisma.lawyerProfile.findUnique({ where: { userId: user.id } });
  if (existing?.status === "SUSPENDED") {
    return apiError("SUSPENDED", "This profile is suspended. Contact LegalSetu support.", 403);
  }

  const identityChanged =
    !!existing && IDENTITY_FIELDS.some((f) => String(existing[f]) !== String(d[f]));
  const backToReview = identityChanged && (existing.status === "VERIFIED" || existing.status === "SUBMITTED");

  try {
    const profile = await prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.lawyerProfile.update({
            where: { id: existing.id },
            data: {
              ...d,
              ...(backToReview
                ? { status: "SUBMITTED", submittedAt: new Date(), verifiedAt: null, reviewedAt: null, reviewedById: null }
                : {}),
            },
            include: { documents: true },
          })
        : await tx.lawyerProfile.create({ data: { ...d, userId: user.id }, include: { documents: true } });
      if (user.role !== "LAWYER") await tx.user.update({ where: { id: user.id }, data: { role: "LAWYER" } });
      return saved;
    });

    if (backToReview) await audit(user.id, "LAWYER_IDENTITY_CHANGED", { profileId: profile.id });
    logger.info(existing ? "Lawyer profile updated" : "Lawyer profile created", { userId: user.id, profileId: profile.id });
    return apiSuccess({ profile: ownerView(profile, profile.documents), sentBackForReview: backToReview }, existing ? 200 : 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError(
        "ENROLMENT_IN_USE",
        "This enrolment number is already registered on LegalSetu. If it is yours, contact support — one enrolment can have only one account.",
        409
      );
    }
    logger.error("Lawyer profile save failed", { userId: user.id, errorType: String(err).slice(0, 200) });
    return apiError("SAVE_FAILED", "Could not save the profile. Please try again.", 500);
  }
}
