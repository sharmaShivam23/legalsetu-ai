// ==========================================================
// GET /api/admin/lawyers/:id — everything a reviewer needs:
// profile, account, documents, automatic checks, review history.
// ==========================================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { requireAdmin } from "@/lib/lawyers/http";
import { label } from "@/lib/lawyers/constants";
import { automaticChecks } from "@/lib/lawyers/checks";
import { ownerView } from "@/lib/lawyers/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const g = await requireAdmin();
  if (g.error) return g.error;
  const { id } = await params;

  const p = await prisma.lawyerProfile
    .findUnique({
      where: { id },
      include: {
        documents: { orderBy: { type: "asc" } },
        user: { select: { email: true, name: true, emailVerified: true, createdAt: true } },
        reviewedBy: { select: { name: true, email: true } },
      },
    })
    .catch(() => null);
  if (!p) return apiError("NOT_FOUND", "Profile not found.", 404);

  const [duplicateNameCount, history] = await Promise.all([
    prisma.lawyerProfile.count({
      where: { id: { not: p.id }, status: "VERIFIED", fullName: { equals: p.fullName, mode: "insensitive" } },
    }),
    prisma.auditLog.findMany({
      where: { metadata: { path: ["profileId"], equals: p.id } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { user: { select: { email: true } } },
    }),
  ]);

  return apiSuccess({
    profile: {
      ...ownerView(p, p.documents),
      barCouncilName: label.barCouncil(p.barCouncil),
      documents: p.documents.map((d) => ({
        id: d.id,
        type: d.type,
        contentType: d.contentType,
        sizeBytes: d.sizeBytes,
        uploadedAt: d.createdAt,
        url: `/api/lawyer/documents/${d.id}`,
      })),
      reviewedBy: p.reviewedBy?.email ?? null,
      reviewedAt: p.reviewedAt,
    },
    account: {
      email: p.user.email,
      name: p.user.name,
      emailVerified: Boolean(p.user.emailVerified),
      createdAt: p.user.createdAt,
    },
    checks: automaticChecks(
      { ...p, userEmailVerified: Boolean(p.user.emailVerified), duplicateNameCount },
      p.documents.map((d) => d.type)
    ),
    history: history.map((h) => ({ action: h.action, by: h.user?.email ?? null, at: h.createdAt, metadata: h.metadata })),
  });
}
