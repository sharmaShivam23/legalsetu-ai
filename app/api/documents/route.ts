import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { validateUploadedFile, sanitizeFilename } from "@/lib/security/sanitize";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getStorageProvider } from "@/lib/storage/storage";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

export async function GET() {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const documents = await prisma.document
    .findMany({ where: { userId }, orderBy: { updatedAt: "desc" } })
    .catch(() => []);

  return apiSuccess({ documents });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const rateLimit = await checkRateLimit(userId, "documentUpload");
  if (!rateLimit.success) return apiError("RATE_LIMITED", "Upload limit reached.", 429);

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  if (!file) return apiError("VALIDATION_ERROR", "No file provided.", 422);

  const validation = validateUploadedFile({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  if (!validation.valid) {
    return apiError("INVALID_FILE", validation.error ?? "File rejected.", 422);
  }

  const safeName = sanitizeFilename(file.name);
  const storage = getStorageProvider();
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `${userId}/${Date.now()}-${safeName}`;
  const storageKey = await storage.upload(key, buffer, file.type);

  const fileTypeMap: Record<string, "PDF" | "DOCX" | "TXT" | "IMAGE"> = {
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "text/plain": "TXT",
    "image/jpeg": "IMAGE",
    "image/png": "IMAGE",
  };

  try {
    const document = await prisma.document.create({
      data: {
        userId,
        title: safeName,
        fileType: fileTypeMap[file.type] ?? "TXT",
        storageKey,
        sizeBytes: file.size,
        status: "UPLOADED",
      },
    });

    logger.info("Document uploaded", { userId, documentId: document.id });
    return apiSuccess({ document }, 201);
  } catch (err) {
    logger.error("Document upload failed", { userId, errorType: String(err) });
    return apiError("UPLOAD_FAILED", "Could not save document.", 500);
  }
}
