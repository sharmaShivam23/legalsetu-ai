// ==========================================================
// POST /api/lawyer/profile/photo — upload the profile photo
// (image only, ≤ 2 MB, metadata stripped — see lib/lawyers/files.ts)
// ==========================================================

import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { logger } from "@/lib/logging/logger";
import { getStorageProvider } from "@/lib/storage/storage";
import { checkUpload, EXTENSION } from "@/lib/lawyers/files";
import { photoUrl } from "@/lib/lawyers/server";
import { readUpload, requireUser } from "@/lib/lawyers/http";

export const runtime = "nodejs";
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const g = await requireUser("lawyerUpload");
  if (g.error) return g.error;

  const profile = await prisma.lawyerProfile.findUnique({ where: { userId: g.user.id } });
  if (!profile) return apiError("NO_PROFILE", "Save your profile details first.", 409);
  if (profile.status === "SUSPENDED") return apiError("SUSPENDED", "This profile is suspended.", 403);

  const upload = await readUpload(req, MAX_BYTES);
  if ("error" in upload) return upload.error;
  const checked = checkUpload(upload.file, { maxBytes: MAX_BYTES, imagesOnly: true });
  if (!checked.ok) return apiError("INVALID_FILE", checked.message, 422);

  const storage = getStorageProvider();
  const key = `lawyers/${profile.id}/photo-${randomBytes(8).toString("hex")}.${EXTENSION[checked.type]}`;
  try {
    await storage.upload(key, checked.data, checked.type);
    const updated = await prisma.lawyerProfile.update({ where: { id: profile.id }, data: { photoKey: key } });
    if (profile.photoKey) await storage.delete(profile.photoKey).catch(() => undefined);
    return apiSuccess({ photoUrl: photoUrl(updated) });
  } catch (err) {
    await storage.delete(key).catch(() => undefined);
    logger.error("Lawyer photo upload failed", { userId: g.user.id, errorType: String(err).slice(0, 200) });
    return apiError("UPLOAD_FAILED", "Could not save the photo. Please try again.", 500);
  }
}
