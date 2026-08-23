import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { firWizardDataSchema } from "@/lib/validation/fir-wizard-schema";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { summarizeWizardData } from "@/lib/fir/summarize";
import { z } from "zod";

const idParamSchema = z.object({ id: z.string().uuid() });

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = session.user.id;

  const { id } = await params;
  const parsedId = idParamSchema.safeParse({ id });
  if (!parsedId.success) return apiError("VALIDATION_ERROR", "Invalid draft id.", 422);

  const draft = await prisma.fIRDraft.findFirst({
    where: { id, userId }, // user isolation enforced
    include: { validation: true },
  });

  if (!draft) return apiError("NOT_FOUND", "FIR draft not found.", 404);
  return apiSuccess({ draft });
}

/**
 * Incremental save — called as the user moves between wizard steps so
 * progress isn't lost. Merges the incoming partial formData over the
 * existing stored formData rather than replacing it wholesale.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = session.user.id;

  const { id } = await params;
  const parsedId = idParamSchema.safeParse({ id });
  if (!parsedId.success) return apiError("VALIDATION_ERROR", "Invalid draft id.", 422);

  const existing = await prisma.fIRDraft.findFirst({ where: { id, userId } });
  if (!existing) return apiError("NOT_FOUND", "FIR draft not found.", 404);

  const body = await req.json().catch(() => null);
  const parsed = firWizardDataSchema.partial().safeParse(body?.formData ?? body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid FIR details.", 422);

  const mergedFormData = {
    ...((existing.formData as object) ?? {}),
    ...parsed.data,
  };
  const summary = summarizeWizardData(mergedFormData);

  try {
    const draft = await prisma.fIRDraft.update({
      where: { id },
      data: { formData: mergedFormData as any, ...summary },
    });
    return apiSuccess({ draft, label: "Draft / Assistance Document" });
  } catch (err) {
    logger.error("FIR draft update failed", { userId, firDraftId: id, errorType: String(err) });
    return apiError("FIR_UPDATE_FAILED", "Could not update FIR draft.", 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = session.user.id;

  const { id } = await params;
  const parsedId = idParamSchema.safeParse({ id });
  if (!parsedId.success) return apiError("VALIDATION_ERROR", "Invalid draft id.", 422);

  const existing = await prisma.fIRDraft.findFirst({ where: { id, userId } });
  if (!existing) return apiError("NOT_FOUND", "FIR draft not found.", 404);

  await prisma.fIRDraft.delete({ where: { id } });
  return apiSuccess({ deleted: true });
}
