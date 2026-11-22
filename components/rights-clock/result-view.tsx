"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Gavel,
  Info,
  Phone,
  Scale,
  ShieldAlert,
  TimerReset,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { daysBetween, formatDate } from "@/lib/rights-clock/dates";
import type {
  DefaultBailStatus,
  Milestone,
  RightsClockResult,
  Section479Status,
} from "@/lib/rights-clock/engine";

type Tone = "urgent" | "good" | "contested" | "upcoming" | "muted";

const TONE: Record<Tone, { card: string; icon: string; badge: string }> = {
  urgent: {
    card: "border-rose-500/40 bg-rose-500/5",
    icon: "text-rose-600 dark:text-rose-400",
    badge: "bg-rose-600 text-white",
  },
  good: {
    card: "border-emerald-500/40 bg-emerald-500/5",
    icon: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-600 text-white",
  },
  contested: {
    card: "border-amber-500/40 bg-amber-500/5",
    icon: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-500 text-white",
  },
  upcoming: {
    card: "border-brandBlue/30 bg-brandBlue/5",
    icon: "text-brandBlue",
    badge: "bg-brandBlue text-white",
  },
  muted: {
    card: "border-borderCustom bg-card",
    icon: "text-textSecondary",
    badge: "bg-canvas text-textSecondary border border-borderCustom",
  },
};

const DB_TONE: Record<DefaultBailStatus, { tone: Tone; badge: string }> = {
  AVAILABLE_NOW: { tone: "good", badge: "Apply now" },
  ARGUABLE_NOW: { tone: "contested", badge: "Can be argued now" },
  UPCOMING: { tone: "upcoming", badge: "Upcoming" },
  CONTESTED: { tone: "contested", badge: "Contested" },
  CHARGESHEET_LATE: { tone: "contested", badge: "Check with lawyer" },
  CHARGESHEET_IN_TIME: { tone: "muted", badge: "Not available" },
  NOT_COMPUTABLE: { tone: "muted", badge: "Cannot calculate" },
  NOT_IN_CUSTODY: { tone: "muted", badge: "Not applicable" },
};

const S479_TONE: Record<Section479Status, { tone: Tone; badge: string }> = {
  MAXIMUM_EXCEEDED: { tone: "urgent", badge: "Illegal detention" },
  ELIGIBLE_NOW: { tone: "good", badge: "Eligible now" },
  UPCOMING: { tone: "upcoming", badge: "Upcoming" },
  BARRED_MULTIPLE: { tone: "contested", badge: "Likely barred" },
  EXCLUDED_DEATH_OR_LIFE: { tone: "muted", badge: "Not available" },
  NOT_IMPRISONABLE: { tone: "urgent", badge: "Check custody" },
  NOT_COMPUTABLE: { tone: "muted", badge: "Cannot calculate" },
  NOT_IN_CUSTODY: { tone: "muted", badge: "Not applicable" },
};

function relative(date: string, today: string): string {
  const d = daysBetween(today, date);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

function Expandable({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 text-xs font-semibold text-textSecondary hover:text-textPrimary"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        {label}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function RightCard({
  title,
  icon: Icon,
  tone,
  badge,
  headline,
  explanation,
  children,
}: {
  title: string;
  icon: typeof Gavel;
  tone: Tone;
  badge: string;
  headline: string;
  explanation: string[];
  children?: React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <section className={cn("rounded-2xl border p-5", t.card)} aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4.5 w-4.5 shrink-0", t.icon)} aria-hidden />
          <h3 className="text-xs font-bold uppercase tracking-wider text-textSecondary">{title}</h3>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold", t.badge)}>{badge}</span>
      </div>
      <p className="mt-3 text-[15px] font-semibold leading-snug text-textPrimary">{headline}</p>
      {children}
      {explanation.length > 0 && (
        <Expandable label="How this was worked out">
          <ul className="space-y-1.5 text-xs leading-relaxed text-textSecondary">
            {explanation.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-textSecondary/60" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Expandable>
      )}
    </section>
  );
}

function DateChip({ label, date, today, note }: { label: string; date: string; today: string; note?: string }) {
  const passed = date <= today;
  return (
    <div className="rounded-xl border border-borderCustom bg-card px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-textSecondary">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-textPrimary">{formatDate(date)}</p>
      <p className={cn("text-[11px]", passed ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-textSecondary")}>
        {relative(date, today)}
        {note ? ` · ${note}` : ""}
      </p>
    </div>
  );
}

const CERTAINTY_STYLE: Record<Milestone["certainty"], string> = {
  CERTAIN: "bg-brandBlue",
  CONTESTED: "bg-amber-500",
  CONDITIONAL: "bg-sky-400",
  REFERENCE: "bg-slate-400",
};

function Timeline({ milestones, today }: { milestones: Milestone[]; today: string }) {
  if (milestones.length === 0) return null;
  const todayIndex = milestones.findIndex((m) => m.date > today);
  return (
    <section className="rounded-2xl border border-borderCustom bg-card p-5" aria-label="Timeline">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4.5 w-4.5 text-brandBlue" aria-hidden />
        <h3 className="text-xs font-bold uppercase tracking-wider text-textSecondary">Timeline</h3>
      </div>
      <ol className="relative mt-4 space-y-0 border-l-2 border-borderCustom pl-5">
        {milestones.map((m, i) => (
          <li key={`${m.key}-${m.date}`} className="relative pb-4 last:pb-0">
            {i === todayIndex && (
              <div className="-ml-[27px] mb-3 flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-rose-500 ring-4 ring-rose-500/20" />
                <span className="text-[11px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                  Today · {formatDate(today)}
                </span>
              </div>
            )}
            <span
              className={cn(
                "absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-card",
                m.passed ? "bg-textSecondary/50" : CERTAINTY_STYLE[m.certainty]
              )}
              aria-hidden
            />
            <p className={cn("text-sm font-semibold", m.passed ? "text-textSecondary" : "text-textPrimary")}>{m.label}</p>
            <p className="text-xs text-textSecondary">
              {formatDate(m.date)} · {relative(m.date, today)}
              {m.certainty === "CONTESTED" && " · contested in law"}
              {m.certainty === "CONDITIONAL" && " · depends on details"}
              {m.certainty === "REFERENCE" && " · for reference only"}
            </p>
          </li>
        ))}
        {todayIndex === -1 && (
          <li className="relative">
            <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-rose-500 ring-4 ring-rose-500/20" aria-hidden />
            <p className="text-[11px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">Today · {formatDate(today)}</p>
          </li>
        )}
      </ol>
    </section>
  );
}

export function RightsClockResultView({
  result,
  compact = false,
  narrow = false,
}: {
  result: RightsClockResult;
  compact?: boolean;
  /** Rendered inside a half-width column: always stack the two cards. */
  narrow?: boolean;
}) {
  const today = result.computedOn;

  if (result.inputErrors.length) {
    return (
      <div className="rounded-2xl border border-borderCustom bg-card p-5" role="status">
        <p className="text-sm font-semibold text-textPrimary">A few details are needed first</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-textSecondary">
          {result.inputErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    );
  }

  const db = result.defaultBail;
  const s = result.section479;
  const dbTone = DB_TONE[db.status];
  const sTone = S479_TONE[s.status];
  const next = result.nextAction;

  return (
    <div className="space-y-4">
      {next && (
        <div
          className={cn(
            "flex items-start gap-3 rounded-2xl border p-4",
            next.urgent ? "border-rose-500/50 bg-rose-500/10" : "border-brandBlue/30 bg-brandBlue/5"
          )}
          role={next.urgent ? "alert" : "status"}
        >
          {next.urgent ? (
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
          ) : (
            <TimerReset className="mt-0.5 h-5 w-5 shrink-0 text-brandBlue" aria-hidden />
          )}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-textSecondary">
              {next.urgent ? "Do this now" : "Next step"}
            </p>
            <p className="mt-0.5 text-[15px] font-semibold leading-snug text-textPrimary">{next.text}</p>
            {next.due && next.due !== today && (
              <p className="mt-0.5 text-xs text-textSecondary">
                By {formatDate(next.due)} ({relative(next.due, today)})
              </p>
            )}
          </div>
        </div>
      )}

      <div className={cn("grid gap-4", !narrow && "lg:grid-cols-2")}>
        <RightCard
          title="Default bail · BNSS §187(3)"
          icon={Gavel}
          tone={dbTone.tone}
          badge={dbTone.badge}
          headline={db.headline}
          explanation={db.explanation}
        >
          {db.periods.length > 0 && db.status !== "NOT_COMPUTABLE" && (
            <div className={cn("mt-3 grid gap-2", db.periods.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
              {db.periods.map((p) => (
                <DateChip
                  key={p.days}
                  label={`${p.days}-day period${db.periods.length > 1 ? (p.days === 60 ? " (arguable)" : " (certain)") : ""}`}
                  date={p.rightArisesOn}
                  today={today}
                />
              ))}
            </div>
          )}
          {db.clockStartEstimated && db.status !== "NOT_COMPUTABLE" && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Remand date estimated. Add it from the remand order for exact dates.
            </p>
          )}
        </RightCard>

        <RightCard
          title="Release after part-serving · BNSS §479"
          icon={Scale}
          tone={sTone.tone}
          badge={sTone.badge}
          headline={s.headline}
          explanation={s.explanation}
        >
          {(s.oneThirdOn || s.oneHalfOn) && (
            <div className={cn("mt-3 grid gap-2", s.applicableFraction === null ? "grid-cols-2" : "grid-cols-1")}>
              {s.oneThirdOn && s.applicableFraction !== "ONE_HALF" && (
                <DateChip label="One-third served" date={s.oneThirdOn} today={today} note="first-time offender" />
              )}
              {s.oneHalfOn && s.applicableFraction !== "ONE_THIRD" && (
                <DateChip label="One-half served" date={s.oneHalfOn} today={today} />
              )}
              {s.absoluteLimitOn && (
                <div className="col-span-2">
                  <DateChip label="Maximum sentence served" date={s.absoluteLimitOn} today={today} note="detention illegal after this" />
                </div>
              )}
            </div>
          )}
          {s.daysDetained > 0 && s.status !== "NOT_IN_CUSTODY" && (
            <p className="mt-2 text-xs text-textSecondary">
              In custody for <span className="font-semibold text-textPrimary">{s.daysDetained} days</span> so far.
            </p>
          )}
        </RightCard>
      </div>

      {result.warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4" role="note">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Check these</p>
          </div>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-textPrimary">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-2xl border border-borderCustom bg-card p-5" aria-label="Sections charged">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4.5 w-4.5 text-brandBlue" aria-hidden />
          <h3 className="text-xs font-bold uppercase tracking-wider text-textSecondary">Sections charged — read from the BNS text</h3>
        </div>
        <ul className="mt-3 divide-y divide-borderCustom">
          {result.offences.map((o) => (
            <li key={o.input} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-textPrimary">
                  {o.citation}
                  {o.title && <span className="font-normal text-textSecondary"> — {o.title}</span>}
                </p>
                {o.periodClass !== "UNKNOWN" && !o.ignored && (
                  <span className="text-[11px] font-semibold text-textSecondary">
                    {o.periodClass === "SIXTY" ? "60-day" : o.periodClass === "NINETY" ? "90-day" : "60 or 90-day (disputed)"}
                  </span>
                )}
              </div>
              {o.punishmentSummary && <p className="mt-0.5 text-sm text-textPrimary">{o.punishmentSummary}</p>}
              {o.problem && (
                <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-rose-700 dark:text-rose-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {o.problem}
                </p>
              )}
              {o.note && <p className="mt-1 text-xs text-textSecondary">{o.note}</p>}
              {o.punishment?.excerpt && (
                <blockquote className="mt-2 border-l-2 border-brandBlue/40 pl-3 text-xs italic leading-relaxed text-textSecondary">
                  “…{o.punishment.excerpt}”
                </blockquote>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Timeline milestones={result.milestones} today={today} />

      {!compact && (
        <>
          <section className="rounded-2xl border border-borderCustom bg-card p-5" aria-label="Rights on arrest">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <h3 className="text-xs font-bold uppercase tracking-wider text-textSecondary">Rights every arrested person has</h3>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {result.arrestRights.map((r) => (
                <div key={r.title} className="rounded-xl border border-borderCustom bg-canvas p-3">
                  <p className="text-sm font-semibold text-textPrimary">{r.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-textSecondary">{r.body}</p>
                  <p className="mt-1.5 text-[11px] font-semibold text-brandBlue">{r.citation}</p>
                </div>
              ))}
            </div>
            <a
              href="tel:15100"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              <Phone className="h-4 w-4" aria-hidden />
              Free legal aid — call 15100
            </a>
          </section>

          <section className="rounded-2xl border border-borderCustom bg-card p-5" aria-label="Legal basis">
            <h3 className="text-xs font-bold uppercase tracking-wider text-textSecondary">Legal basis</h3>
            <ul className="mt-3 space-y-2.5">
              {result.authorities.map((a) => (
                <li key={a.citation} className="text-xs leading-relaxed">
                  <p className="font-semibold text-textPrimary">{a.citation}</p>
                  <p className="text-textSecondary">{a.holding}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-borderCustom pt-3 text-[11px] leading-relaxed text-textSecondary">
              Punishments are read directly from the {result.dataSource.act} text ({result.dataSource.source}, fingerprint{" "}
              {result.dataSource.sourceHash.slice(0, 8)}). No AI model is used to calculate any date.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
