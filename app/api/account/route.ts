// ==========================================================
// LegalSetu — account profile, activity summary, and deletion
// ----------------------------------------------------------
// GET returns just enough to render an account center: identity
// plus counts across everything the user has built up here.
// DELETE is a genuine, irreversible account deletion — gated by
// password re-entry for any account that has one, since this
// permanently removes real legal conversations and drafts.
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { logger } from "@/lib/logging/logger";

export async function GET() {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      image: true,
      createdAt: true,
      passwordHash: true,
      _count: {
        select: {
          conversations: true,
          cases: true,
          firDrafts: true,
          documents: true,
          savedSources: true,
          memories: true,
          referrals: true,
        },
      },
    },
  });
  if (!user) return apiError("NOT_FOUND", "Account not found.", 404);

  return apiSuccess({
    name: user.name,
    email: user.email,
    image: user.image,
    createdAt: user.createdAt,
    hasPassword: Boolean(user.passwordHash),
    stats: user._count,
  });
}

const deleteSchema = z.object({
  password: z.string().optional(),
  confirm: z.literal("DELETE"),
});

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Type DELETE to confirm.", 422);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) return apiError("NOT_FOUND", "Account not found.", 404);

  if (user.passwordHash) {
    const valid = parsed.data.password && (await bcrypt.compare(parsed.data.password, user.passwordHash));
    if (!valid) return apiError("INVALID_PASSWORD", "Incorrect password.", 401);
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
    logger.info("Account deleted", { userId });
    return apiSuccess({ deleted: true });
  } catch (err) {
    logger.error("Account deletion failed", { userId, errorType: String(err).slice(0, 200) });
    return apiError("DELETE_FAILED", "Could not delete your account. Please try again.", 500);
  }
}
