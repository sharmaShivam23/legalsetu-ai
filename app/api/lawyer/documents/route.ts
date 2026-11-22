// ==========================================================
// POST /api/lawyer/documents — upload a verification document
// multipart: type=<LawyerDocumentType>, file=<pdf|image ≤ 5 MB>
// Re-uploading a type replaces the earlier file.
// ==========================================================

import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { logger } from "@/lib/logging/logger";
import { getStorageProvider } from "@/lib/storage/storage";
import { DOCUMENT_TYPES } from "@/lib/lawyers/constants";
import { checkUpload, EXTENSION } from "@/lib/lawyers/files";
import { documentTypeSchema } from "@/lib/lawyers/validation";
import { readUpload, requireUser } from "@/lib/lawyers/http";

export const runtime = "nodejs";
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const g = await requireUser("lawyerUpload");
  if (g.error) return g.error;

  const profile = await prisma.lawyerProfile.findUnique({ where: { userId: g.user.id } });
  if (!profile) return apiError("NO_PROFILE", "Save your profile details first.", 409);
  if (profile.status === "SUSPENDED") return apiError("SUSPENDED", "This profile is suspended.", 403);

  const upload = await readUpload(req, MAX_BYTES);
  if ("error" in upload) return upload.error;
  const type = documentTypeSchema.safeParse(upload.fields.get("type"));
  if (!type.success) return apiError("VALIDATION_ERROR", "Unknown document type.", 422);

  const rules = DOCUMENT_TYPES.find((t) => t.key === type.data)!;
  const checked = checkUpload(upload.file, { maxBytes: MAX_BYTES, imagesOnly: rules.imagesOnly });
  if (!checked.ok) return apiError("INVALID_FILE", checked.message, 422);

  const storage = getStorageProvider();
  const key = `lawyers/${profile.id}/docs/${type.data.toLowerCase()}-${randomBytes(8).toString("hex")}.${EXTENSION[checked.type]}`;
  try {
    await storage.upload(key, checked.data, checked.type);
    const previous = await prisma.lawyerDocument.findUnique({
      where: { profileId_type: { profileId: profile.id, type: type.data } },
    });
    const doc = await prisma.lawyerDocument.upsert({
      where: { profileId_type: { profileId: profile.id, type: type.data } },
      create: { profileId: profile.id, type: type.data, storageKey: key, contentType: checked.type, sizeBytes: checked.data.length },
      update: { storageKey: key, contentType: checked.type, sizeBytes: checked.data.length, createdAt: new Date() },
    });
    if (previous) await storage.delete(previous.storageKey).catch(() => undefined);
    logger.info("Lawyer document uploaded", { userId: g.user.id, type: type.data });
    return apiSuccess({
      document: { id: doc.id, type: doc.type, contentType: doc.contentType, sizeBytes: doc.sizeBytes, uploadedAt: doc.createdAt },
    });
  } catch (err) {
    await storage.delete(key).catch(() => undefined);
    logger.error("Lawyer document upload failed", { userId: g.user.id, errorType: String(err).slice(0, 200) });
    return apiError("UPLOAD_FAILED", "Could not save the document. Please try again.", 500);
  }
}
