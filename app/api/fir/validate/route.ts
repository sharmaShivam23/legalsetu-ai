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
    where: { id: parsed.data.firDraftId, userId }, // user isolation enforced
  });

  if (!draft) return apiError("NOT_FOUND", "FIR draft not found.", 404);

  const formData = (draft.formData as FIRWizardData | null) ?? {};

  // Weighted scoring per FIR_Feature_Implementation_Phases.md § Phase 2.1:
  // Date/Time 15%, Location 15%, Accused 10%, Loss/Injury 15%,
  // Narrative >100 words 35%, Witnesses/Evidence 10%.
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