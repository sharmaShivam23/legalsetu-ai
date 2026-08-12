import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

const REQUIRED_FIELDS: Array<{ key: string; label: string }> = [
  { key: "incidentType", label: "Incident type" },
  { key: "incidentDate", label: "Date/time of incident" },
  { key: "location", label: "Location" },
  { key: "description", label: "Description of what happened" },
];

const schema = z.object({ firDraftId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid request.", 422);

  const draft = await prisma.fIRDraft.findFirst({
    where: { id: parsed.data.firDraftId, userId }, // user isolation enforced
  });

  if (!draft) return apiError("NOT_FOUND", "FIR draft not found.", 404);

  const missingFields = REQUIRED_FIELDS.filter(
    (f) => !(draft as any)[f.key]
  ).map((f) => f.label);

  const inconsistencies: string[] = [];
  if (
    draft.incidentDate &&
    draft.incidentDate.getTime() > Date.now()
  ) {
    inconsistencies.push("Incident date is in the future.");
  }

  const totalFields = REQUIRED_FIELDS.length;
  const completenessScore = Math.round(
    ((totalFields - missingFields.length) / totalFields) * 100
  );

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

  return apiSuccess({ validation, label: "Draft / Assistance Document" });
}
