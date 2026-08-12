import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { caseSchema } from "@/lib/validation/schemas";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const cases = await prisma.case
    .findMany({ where: { userId }, orderBy: { updatedAt: "desc" } })
    .catch(() => []);

  return apiSuccess({ cases });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => null);
  const parsed = caseSchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid case data.", 422);

  const created = await prisma.case.create({
    data: { userId, ...parsed.data },
  });

  return apiSuccess({ case: created }, 201);
}
