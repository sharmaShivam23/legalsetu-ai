// ==========================================================
// GET /api/admin/lawyers?status=SUBMITTED — the verification queue
// (admins only; role checked against the database)
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { requireAdmin } from "@/lib/lawyers/http";
import { label } from "@/lib/lawyers/constants";

const statusSchema = z.enum(["DRAFT", "SUBMITTED", "VERIFIED", "REJECTED", "SUSPENDED"]).default("SUBMITTED");

export async function GET(req: NextRequest) {
  const g = await requireAdmin();
  if (g.error) return g.error;
  const status = statusSchema.safeParse(req.nextUrl.searchParams.get("status") ?? undefined);
  if (!status.success) return apiError("VALIDATION_ERROR", "Unknown status.", 422);

  const [profiles, counts] = await Promise.all([
    prisma.lawyerProfile.findMany({
      where: { status: status.data },
      // Oldest submission first: a fair queue.
      orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
      take: 200,
      include: { user: { select: { email: true } }, _count: { select: { documents: true } } },
    }),
    prisma.lawyerProfile.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  return apiSuccess({
    status: status.data,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    profiles: profiles.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      email: p.user.email,
      barCouncil: label.barCouncil(p.barCouncil),
      enrolmentNumber: p.enrolmentNumber,
      city: p.city,
      status: p.status,
      submittedAt: p.submittedAt,
      verifiedAt: p.verifiedAt,
      documentCount: p._count.documents,
      isDemo: p.isDemo,
    })),
  });
}
