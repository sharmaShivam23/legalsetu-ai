// ==========================================================
// GET /api/advocate/deadlines — every upcoming custody deadline across
// the advocate's clients, from Rights Clock trackers in cases shared
// on open consultations. One list, so a legal-aid lawyer with many
// undertrial clients never misses a default-bail date.
// ==========================================================

import { prisma } from "@/lib/db/prisma";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { daysBetween, todayInIndia } from "@/lib/rights-clock/dates";
import { computeForTracker } from "@/lib/rights-clock/service";
import { clientDisplayName } from "@/lib/lawyers/consultations";
import { requireUser } from "@/lib/lawyers/http";

const HORIZON_DAYS = 120;
const ACTIONABLE = /^(DEFAULT_BAIL_\d+|S479_ONE_THIRD|S479_ONE_HALF|MAX_SENTENCE)$/;

export async function GET() {
  const g = await requireUser("apiDefault");
  if (g.error) return g.error;
  const profile = await prisma.lawyerProfile.findUnique({ where: { userId: g.user.id }, select: { id: true } });
  if (!profile) return apiError("NO_PROFILE", "Only advocates have a deadlines view.", 403);

  const requests = await prisma.consultationRequest.findMany({
    where: { lawyerProfileId: profile.id, status: { in: ["PENDING", "ACCEPTED"] } },
    include: {
      citizen: { select: { name: true } },
      shares: {
        where: { revokedAt: null },
        include: { case: { include: { custodyTrackers: { where: { inCustody: true } } } } },
      },
    },
  });

  const today = todayInIndia();
  const items: {
    consultationId: string;
    consultationStatus: string;
    client: string;
    caseId: string;
    caseTitle: string;
    personName: string;
    key: string;
    label: string;
    date: string;
    daysUntil: number;
    certainty: string;
    urgent: boolean;
  }[] = [];
  const actNow: { consultationId: string; client: string; personName: string; text: string }[] = [];

  for (const r of requests) {
    for (const s of r.shares) {
      for (const t of s.case.custodyTrackers) {
        const result = computeForTracker(t, today);
        if (result.nextAction?.urgent && result.nextAction.due === today) {
          actNow.push({ consultationId: r.id, client: clientDisplayName(r.citizen.name), personName: t.personName, text: result.nextAction.text });
        }
        for (const m of result.milestones) {
          if (!ACTIONABLE.test(m.key) || m.certainty === "REFERENCE") continue;
          const d = daysBetween(today, m.date);
          if (d < 0 || d > HORIZON_DAYS) continue;
          items.push({
            consultationId: r.id,
            consultationStatus: r.status,
            client: clientDisplayName(r.citizen.name),
            caseId: s.case.id,
            caseTitle: s.case.title,
            personName: t.personName,
            key: m.key,
            label: m.label,
            date: m.date,
            daysUntil: d,
            certainty: m.certainty,
            urgent: d <= 7,
          });
        }
      }
    }
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return apiSuccess({ today, actNow, deadlines: items });
}
