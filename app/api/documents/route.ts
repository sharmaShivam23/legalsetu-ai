// app/api/documents/route.ts
//
// POST — accepts multipart FormData (file, category, ocrText, ocrConfidence),
//        validates + stores the file via lib/storage/storage.ts, creates the
//        LegalDocument row, returns { id }.
// GET  — lists the current user's documents.

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getStorageProvider } from "@/lib/storage/storage";
import { sanitizeFilename, validateUploadedFile } from "@/lib/security/sanitize";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  createDocumentSchema,
  DOCUMENT_CATEGORY_TO_DB,
  DOCUMENT_CATEGORY_FROM_DB,
} from "@/lib/validation/schemas";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return apiError("unauthorized", "You must be signed in.", 401);
  }

  const rl = await checkRateLimit(session.user.id, "documentUpload");
  if (!rl.success) {
    return apiError("rate_limited", "Too many uploads. Please try again later.", 429);
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const category = formData.get("category");
    const ocrText = formData.get("ocrText");
    const ocrConfidence = formData.get("ocrConfidence");

    if (!(file instanceof Blob)) {
      return apiError("no_file", "No file was uploaded.", 400);
    }

    const parsed = createDocumentSchema.safeParse({ category, ocrText, ocrConfidence });
    if (!parsed.success) {
      return apiError("invalid_request", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    }

    const originalName = (file as File).name ?? "upload";

    // Use your existing MIME/extension/size validator rather than
    // duplicating the checks here.
    const validation = validateUploadedFile({
      name: originalName,
      type: file.type,
      size: file.size,
    });
    if (!validation.valid) {
      return apiError("invalid_file", validation.error ?? "File not allowed.", 400);
    }

    const safeName = sanitizeFilename(originalName);
    const buffer = Buffer.from(await file.arrayBuffer());

    const storage = getStorageProvider();
    const key = `legal-documents/${session.user.id}/${Date.now()}-${safeName}`;
    const storagePath = await storage.upload(key, buffer, file.type);

    const doc = await prisma.legalDocument.create({
      data: {
        userId: session.user.id,
        category: DOCUMENT_CATEGORY_TO_DB[parsed.data.category],
        fileName: safeName,
        fileSizeKb: Math.round(file.size / 1024),
        storagePath,
        ocrText: parsed.data.ocrText,
        ocrConfidence: parsed.data.ocrConfidence,
        ocrConfidenceNote: buildConfidenceNote(parsed.data.ocrConfidence),
        analysisStatus: "PENDING",
      },
    });

    return apiSuccess({ id: doc.id });
  } catch (err) {
    return apiError(
      "upload_failed",
      err instanceof Error ? err.message : "Upload failed.",
      500
    );
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return apiError("unauthorized", "You must be signed in.", 401);
  }

  const docs = await prisma.legalDocument.findMany({
    where: { userId: session.user.id }, // per-user isolation at the query layer
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      category: true,
      fileName: true,
      fileSizeKb: true,
      analysisStatus: true,
      createdAt: true,
    },
  });

  return apiSuccess({
    documents: docs.map((d: (typeof docs)[number]) => ({
      ...d,
      category: DOCUMENT_CATEGORY_FROM_DB[d.category],
    })),
  });
}

function buildConfidenceNote(confidence: number): string {
  if (confidence === 0) return "No readable text was extracted.";
  if (confidence < 55) return "OCR confidence is low — please review the extracted text carefully.";
  if (confidence < 75) return "OCR confidence is moderate. Some words may be misread.";
  return "OCR confidence is good.";
}