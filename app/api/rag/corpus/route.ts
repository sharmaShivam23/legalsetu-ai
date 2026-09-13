// ==========================================================
// LegalSetu — Corpus manifest
// ----------------------------------------------------------
// Exposes exactly which acts the assistant can answer from,
// how many sections of each are indexed, and where each one
// came from.
//
// This exists because "trust me" is not an acceptable answer
// in a legal tool. A user (or a judge evaluating the project)
// can see the library, follow the official link, and confirm
// the assistant is searching real legislation rather than
// recalling it from model weights.
// ==========================================================

import { prisma } from "@/lib/db/prisma";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { logger } from "@/lib/logging/logger";

export const runtime = "nodejs";
// Cheap query, but it is hit on every empty chat screen.
export const revalidate = 60;

export async function GET() {
  try {
    const sources = await prisma.legalSource.findMany({
      where: { verificationStatus: "VERIFIED" },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        actName: true,
        jurisdiction: true,
        officialUrl: true,
        sourceType: true,
        _count: { select: { chunks: true } },
      },
    });

    // Only chunks with an embedding are actually reachable by search,
    // so report that number rather than a flattering total.
    const searchable = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n
         FROM "LegalSourceChunk" c
         JOIN "LegalSource" s ON s.id = c."sourceId"
        WHERE c.embedding IS NOT NULL
          AND s."verificationStatus" = 'VERIFIED'`
    );

    const acts = sources
      // A source with no indexed sections would be misleading to list.
      .filter((s) => s._count.chunks > 0)
      .map((s) => ({
        id: s.id,
        title: s.actName ?? s.title,
        jurisdiction: s.jurisdiction,
        officialUrl: s.officialUrl,
        sectionCount: s._count.chunks,
      }));

    return apiSuccess({
      acts,
      actCount: acts.length,
      totalSections: acts.reduce((n, a) => n + a.sectionCount, 0),
      searchableSections: searchable[0]?.n ?? 0,
      provenance: "India Code — Government of India, Ministry of Law and Justice",
    });
  } catch (err) {
    logger.error("Corpus manifest failed", { errorType: String(err) });
    return apiError("CORPUS_FAILED", "Could not load the source library.", 500);
  }
}
