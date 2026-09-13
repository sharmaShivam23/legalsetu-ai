// ==========================================================
// LegalSetu — verified legal-aid directory
// ----------------------------------------------------------
// Public and unauthenticated on purpose: someone deciding
// whether to trust this app with a real problem should be able
// to see this list before creating an account.
// ==========================================================

import { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/utils/api-response";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category");

  const resources = await prisma.legalAidResource
    .findMany({
      where: category ? { category } : undefined,
      orderBy: [{ priority: "asc" }, { name: "asc" }],
    })
    .catch(() => []);

  return apiSuccess({ resources });
}
