// ==========================================================
// LegalSetu — personal saved sources
// ----------------------------------------------------------
// The page was called "Saved Sources" but had no save action
// anywhere in the app — it just listed the entire corpus. This
// is the actual per-user bookmark this page's name promised,
// with the real verified text of the section attached so a
// saved item can be read in place rather than trusted blind.
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

export async function GET() {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const saved = await prisma.savedSource.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      legalSource: {
        select: { id: true, title: true, actName: true, jurisdiction: true, officialUrl: true, verificationStatus: true },
      },
    },
  });

  // Attach the actual verified text for a specific saved section, so
  // the reader never has to take the bookmark's word for what it says.
  const withText = await Promise.all(
    saved.map(async (s) => {
      if (!s.section) return { ...s, sectionText: null };
      const chunk = await prisma.legalSourceChunk.findFirst({
        where: { sourceId: s.legalSourceId, section: s.section },
        select: { text: true },
      });
      return { ...s, sectionText: chunk?.text ?? null };
    })
  );

  return apiSuccess({ saved: withText });
}

const saveSchema = z.object({
  legalSourceId: z.string().uuid(),
  section: z.string().max(20).optional(),
  note: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid request.", 422);

  const source = await prisma.legalSource.findUnique({ where: { id: parsed.data.legalSourceId }, select: { id: true } });
  if (!source) return apiError("NOT_FOUND", "That source could not be found.", 404);

  try {
    // Prisma's compound-unique `where` rejects null for a nullable member
    // even though Postgres itself is fine with it, so a section-less
    // (whole-act) save has to be looked up manually instead of via upsert.
    const existing = await prisma.savedSource.findFirst({
      where: { userId, legalSourceId: parsed.data.legalSourceId, section: parsed.data.section ?? null },
      select: { id: true },
    });

    const saved = existing
      ? await prisma.savedSource.update({ where: { id: existing.id }, data: { note: parsed.data.note } })
      : await prisma.savedSource.create({
          data: {
            userId,
            legalSourceId: parsed.data.legalSourceId,
            section: parsed.data.section,
            note: parsed.data.note,
          },
        });
    return apiSuccess({ saved }, 201);
  } catch (err) {
    logger.error("Save source failed", { userId, errorType: String(err).slice(0, 200) });
    return apiError("SAVE_FAILED", "Could not save that source.", 500);
  }
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid request.", 422);

  const result = await prisma.savedSource.deleteMany({ where: { id: parsed.data.id, userId } });
  if (result.count === 0) return apiError("NOT_FOUND", "Not found.", 404);
  return apiSuccess({ deleted: true });
}
