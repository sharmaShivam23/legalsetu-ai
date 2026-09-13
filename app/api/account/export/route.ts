// ==========================================================
// LegalSetu — export my data
// ----------------------------------------------------------
// A legal-assistance app holds unusually sensitive data, so a
// user should be able to walk away with all of it, not just
// delete it. Returns one JSON file with every record scoped to
// this user — nothing another user's row could ever leak into.
// ==========================================================

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { apiError } from "@/lib/utils/api-response";

export async function GET() {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const [user, conversations, cases, firDrafts, documents, savedSources, memories, referrals] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, createdAt: true },
    }),
    prisma.conversation.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        createdAt: true,
        messages: { select: { role: true, content: true, mode: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.case.findMany({ where: { userId } }),
    prisma.fIRDraft.findMany({ where: { userId } }),
    prisma.document.findMany({ where: { userId }, select: { id: true, title: true, createdAt: true } }),
    prisma.savedSource.findMany({ where: { userId } }),
    prisma.userMemory.findMany({ where: { userId }, select: { content: true, category: true, createdAt: true } }),
    prisma.lawyerReferral.findMany({ where: { userId } }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    account: user,
    conversations,
    cases,
    firDrafts,
    documents,
    savedSources,
    memories,
    referrals,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="legalsetu-data-export.json"`,
    },
  });
}
