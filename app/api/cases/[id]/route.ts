import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;
  const { id } = await params;

  // User isolation: only return the case if it belongs to this user.
  const found = await prisma.case.findFirst({ where: { id, userId } });
  if (!found) return apiError("NOT_FOUND", "Case not found.", 404);

  return apiSuccess({ case: found });
}
