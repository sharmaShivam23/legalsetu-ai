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

  const [user, conversations, cases, firDrafts, documents, savedSources, memories, referrals, custodyTrackers] = await Promise.all([
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
    prisma.custodyTracker.findMany({ where: { userId } }),
  ]);

  // Verified Lawyer Connect. Internal storage keys are left out — they are
  // not the user's data, only where it is kept.
  const [lawyerProfile, location, consultations] = await Promise.all([
    prisma.lawyerProfile.findUnique({
      where: { userId },
      include: { documents: { select: { type: true, contentType: true, sizeBytes: true, createdAt: true } } },
    }),
    prisma.userLocation.findUnique({ where: { userId } }),
    prisma.consultationRequest.findMany({
      where: { OR: [{ citizenId: userId }, { lawyer: { userId } }] },
      include: {
        messages: { select: { senderId: true, body: true, createdAt: true }, orderBy: { createdAt: "asc" } },
        shares: { select: { caseId: true, createdAt: true, revokedAt: true } },
      },
    }),
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
    custodyTrackers,
    // undefined is dropped by JSON.stringify
    lawyerProfile: lawyerProfile ? { ...lawyerProfile, photoKey: undefined } : null,
    location,
    consultations,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="legalsetu-data-export.json"`,
    },
  });
}
