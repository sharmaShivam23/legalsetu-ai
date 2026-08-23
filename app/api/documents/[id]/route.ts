// app/api/documents/[id]/route.ts
//
// Resolves your open issue: "confirming whether GET /api/documents/[id]
// exists as a single-document endpoint (blocks the detail page flow)".

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { DOCUMENT_CATEGORY_FROM_DB } from "@/lib/validation/schemas";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return apiError("unauthorized", "You must be signed in.", 401);
  }

  const { id } = await params;

  const doc = await prisma.legalDocument.findFirst({
    // findFirst + userId filter (not findUnique by id alone) so a user
    // can never fetch another user's document by guessing an id.
    where: { id, userId: session.user.id },
  });

  if (!doc) {
    return apiError("not_found", "Document not found.", 404);
  }

  return apiSuccess({
    id: doc.id,
    fileName: doc.fileName,
    fileSizeKb: doc.fileSizeKb,
    category: DOCUMENT_CATEGORY_FROM_DB[doc.category],
    ocrText: doc.ocrText,
    ocrConfidenceNote: doc.ocrConfidenceNote,
    analysis: doc.analysisStatus === "PENDING" ? null : doc.analysisJson,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return apiError("unauthorized", "You must be signed in.", 401);
  }

  const { id } = await params;

  const doc = await prisma.legalDocument.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!doc) {
    return apiError("not_found", "Document not found.", 404);
  }

  await prisma.legalDocument.delete({ where: { id: doc.id } });
  return apiSuccess({ deleted: true });
}