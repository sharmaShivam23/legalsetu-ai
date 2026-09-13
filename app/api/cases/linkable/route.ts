// ==========================================================
// LegalSetu — items not yet attached to any case
// ----------------------------------------------------------
// Feeds the "link existing" picker on a case's detail page.
// ==========================================================

import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { prisma } from "@/lib/db/prisma";

const RECENT_LIMIT = 25;

export async function GET() {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const [conversations, documents, firDrafts] = await Promise.all([
    prisma.conversation.findMany({
      where: { userId, caseId: null },
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      select: { id: true, title: true, updatedAt: true },
    }),
    prisma.document.findMany({
      where: { userId, caseId: null },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: { id: true, title: true, fileType: true, createdAt: true },
    }),
    prisma.fIRDraft.findMany({
      where: { userId, caseId: null },
      orderBy: { updatedAt: "desc" },
      take: RECENT_LIMIT,
      select: { id: true, incidentType: true, status: true, updatedAt: true },
    }),
  ]);

  return apiSuccess({ conversations, documents, firDrafts });
}
