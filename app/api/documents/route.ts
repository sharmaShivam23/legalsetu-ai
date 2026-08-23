// app/api/documents/route.ts

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getStorageProvider } from "@/lib/storage/storage";
import { sanitizeFilename, validateUploadedFile } from "@/lib/security/sanitize";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createDocumentSchema } from "@/lib/validation/schemas";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

export const runtime = "nodejs";

// Helper function to map standard MIME types to your Prisma DocumentType enum
function getFileType(mimeType: string) {
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("image")) return "IMAGE";
  if (mimeType.includes("word") || mimeType.includes("docx") || mimeType.includes("document")) return "DOCX";
  return "TXT";
}

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

    // FIXED: Maps data to your current Prisma `Document` model schema
    const doc = await prisma.document.create({
      data: {
        userId: session.user.id,
        title: safeName,                     // Replaces fileName
        sizeBytes: file.size,                // Replaces fileSizeKb
        storageKey: storagePath,             // Replaces storagePath
        fileType: getFileType(file.type),    // Replaces category logic
        status: "UPLOADED",                  // Replaces analysisStatus
        extractedText: parsed.data.ocrText,
        // Optional: Storing the old extra fields in the JSON summary just in case the UI needs them
        summary: JSON.stringify({ 
          ocrConfidence: parsed.data.ocrConfidence, 
          originalCategory: parsed.data.category 
        }),
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

  // FIXED: Fetching from prisma.document
  const docs = await prisma.document.findMany({
    where: { userId: session.user.id }, 
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileType: true,
      title: true,
      sizeBytes: true,
      status: true,
      createdAt: true,
    },
  });

  // FIXED: Mapping back to the frontend's expected properties
  return apiSuccess({
    documents: docs.map((d) => ({
      id: d.id,
      category: d.fileType,
      fileName: d.title,
      fileSizeKb: Math.round(d.sizeBytes / 1024),
      analysisStatus: d.status,
      createdAt: d.createdAt,
    })),
  });
}