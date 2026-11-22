// ==========================================================
// GET /api/lawyer/documents/:docId — serve a verification document
// Only to the advocate who uploaded it, or an admin. Everyone else
// gets 404 (not 403), so document ids reveal nothing.
// ==========================================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiError } from "@/lib/utils/api-response";
import { getStorageProvider } from "@/lib/storage/storage";
import { audit } from "@/lib/lawyers/server";
import { privateFileHeaders, requireUser } from "@/lib/lawyers/http";
import { EXTENSION, type SniffedType } from "@/lib/lawyers/files";

export const runtime = "nodejs";
type Params = { params: Promise<{ docId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const g = await requireUser("apiDefault");
  if (g.error) return g.error;
  const { docId } = await params;

  const doc = await prisma.lawyerDocument.findUnique({
    where: { id: docId },
    include: { profile: { select: { userId: true, id: true } } },
  }).catch(() => null);
  const isOwner = doc?.profile.userId === g.user.id;
  const isAdmin = g.user.role === "ADMIN";
  if (!doc || (!isOwner && !isAdmin)) return apiError("NOT_FOUND", "Document not found.", 404);

  const data = await getStorageProvider().read(doc.storageKey);
  if (!data) return apiError("NOT_FOUND", "The file is missing from storage. Please upload it again.", 404);
  if (isAdmin && !isOwner) await audit(g.user.id, "LAWYER_DOCUMENT_VIEWED", { profileId: doc.profile.id, type: doc.type });

  const ext = EXTENSION[doc.contentType as SniffedType] ?? "bin";
  return new Response(new Uint8Array(data), {
    headers: privateFileHeaders(doc.contentType, `${doc.type.toLowerCase()}.${ext}`),
  });
}
