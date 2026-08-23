import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { firWizardSaveSchema } from "@/lib/validation/fir-wizard-schema";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { summarizeWizardData } from "@/lib/fir/summarize";

// FIXED: Helper to map database strings back into the frontend's expected object
function getFormDataFromDraft(draft: any) {
  return {
    incidentType: draft.incidentType || undefined,
    incidentDateTime: draft.incidentDate?.toISOString() || undefined,
    location: draft.location || undefined,
    peopleInvolved: draft.peopleInvolved || undefined,
    description: draft.description || undefined,
    evidence: draft.evidence || undefined,
    witnesses: draft.witnesses || undefined,
    additionalDetails: draft.additionalDetails || undefined,
  };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = session.user.id;

  const rateLimit = await checkRateLimit(userId, "firGeneration");
  if (!rateLimit.success) {
    return apiError("RATE_LIMITED", "Too many FIR draft requests.", 429);
  }

  const body = await req.json().catch(() => null);
  const parsed = firWizardSaveSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid FIR details.", 422);
  }

  const summary = summarizeWizardData(parsed.data.formData);

  try {
    // FIXED: Removed the invalid `formData` column injection.
    // The `...summary` spread maps your data to the actual database columns.
    const draft = await prisma.fIRDraft.create({
      data: {
        userId,
        caseId: parsed.data.caseId,
        status: "DRAFT",
        ...summary,
      },
    });

    logger.info("FIR draft created", { userId, firDraftId: draft.id });
    
    // FIXED: Attach the incoming formData locally so the frontend immediately has it on success
    return apiSuccess({ 
      draft: { ...draft, formData: parsed.data.formData }, 
      label: "Draft / Assistance Document" 
    });
  } catch (err) {
    logger.error("FIR draft creation failed", { userId, errorType: String(err) });
    return apiError("FIR_CREATE_FAILED", "Could not create FIR draft.", 500);
  }
}

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = session.user.id;

  const drafts = await prisma.fIRDraft
    .findMany({ where: { userId }, orderBy: { updatedAt: "desc" } })
    .catch(() => []);

  // FIXED: Attach the dynamically built formData to each draft in the list
  const draftsWithFormData = drafts.map(draft => ({
    ...draft,
    formData: getFormDataFromDraft(draft)
  }));

  return apiSuccess({ drafts: draftsWithFormData });
}