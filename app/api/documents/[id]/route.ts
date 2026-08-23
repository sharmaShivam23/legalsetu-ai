// app/api/documents/[id]/route.ts

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return apiError("unauthorized", "You must be signed in.", 401);
  }

  const { id } = await params;

  // FIXED: Changed to prisma.document
  const doc = await prisma.document.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!doc) {
    return apiError("not_found", "Document not found.", 404);
  }

  // FIXED: Mapped to your schema's actual fields (title, sizeBytes, extractedText, summary)
  let analysis = null;
  if (doc.summary && (doc.status === "READY" || doc.status === "FAILED")) {
    try {
      analysis = JSON.parse(doc.summary);
    } catch (e) {
      console.error("Could not parse document summary JSON");
    }
  }

  return apiSuccess({
    id: doc.id,
    fileName: doc.title, 
    fileSizeKb: Math.round(doc.sizeBytes / 1024),
    category: doc.fileType,
    ocrText: doc.extractedText || "",
    analysisStatus: doc.status,
    analysis: analysis,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return apiError("unauthorized", "You must be signed in.", 401);
  }

  const { id } = await params;

  // FIXED: Changed to prisma.document
  const doc = await prisma.document.findFirst({
    where: { id, userId: session.user.id },
  });
  
  if (!doc) {
    return apiError("not_found", "Document not found.", 404);
  }

  await prisma.document.delete({ where: { id: doc.id } });
  return apiSuccess({ deleted: true });
}