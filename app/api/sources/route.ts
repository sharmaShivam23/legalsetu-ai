import { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/utils/api-response";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
  const jurisdiction = req.nextUrl.searchParams.get("jurisdiction") ?? undefined;

  const sources = await prisma.legalSource
    .findMany({
      where: {
        verificationStatus: "VERIFIED",
        ...(jurisdiction ? { jurisdiction } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    })
    .catch(() => []);

  return apiSuccess({ sources });
}
