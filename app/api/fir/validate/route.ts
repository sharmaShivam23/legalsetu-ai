import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { computeCompleteness } from "@/lib/fir/completeness";
import type { FIRWizardData } from "@/lib/fir/types";

const schema = z.object({ firDraftId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = session.user.id;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid request.", 422);

  const draft = await prisma.fIRDraft.findFirst({
    where: { id: parsed.data.firDraftId, userId },
  });

  if (!draft) return apiError("NOT_FOUND", "FIR draft not found.", 404);

  // FIXED: Reconstruct formData dynamically from the database columns
  const formData: any = {
    incidentType: draft.incidentType || undefined,
    incidentDateTime: draft.incidentDate?.toISOString() || undefined,
    location: draft.location || undefined,
    peopleInvolved: draft.peopleInvolved || undefined,
    description: draft.description || undefined,
    evidence: draft.evidence || undefined,
    witnesses: draft.witnesses || undefined,
    additionalDetails: draft.additionalDetails || undefined,
  };

  const { score: completenessScore, missingFields, breakdown } = computeCompleteness(formData);

  const inconsistencies: string[] = [];
  if (formData.incidentDateTime && new Date(formData.incidentDateTime).getTime() > Date.now()) {
    inconsistencies.push("Incident date is in the future.");
  }
  if (
    formData.discoveryDateTime &&
    formData.incidentDateTime &&
    new Date(formData.discoveryDateTime).getTime() < new Date(formData.incidentDateTime).getTime()
  ) {
    inconsistencies.push("Discovery date is earlier than the incident date.");
  }

  const validation = await prisma.fIRValidation.upsert({
    where: { firDraftId: draft.id },
    update: { missingFields, inconsistencies, completenessScore },
    create: {
      firDraftId: draft.id,
      missingFields,
      inconsistencies,
      completenessScore,
    },
  });

  return apiSuccess({
    validation,
    breakdown,
    label: "Draft / Assistance Document",
  });
}