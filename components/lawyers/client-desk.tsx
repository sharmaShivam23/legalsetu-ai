"use client";

import { readApi } from "./api";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlarmClock, CalendarClock, ChevronRight, Inbox, MessagesSquare, ShieldAlert, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { label } from "@/lib/lawyers/constants";
import type { SerializedConsultation } from "@/lib/lawyers/consultations";
import { formatDate } from "@/lib/rights-clock/dates";
import { StatusPill } from "./ui";

interface Deadline {
  consultationId: string;
  consultationStatus: string;
  client: string;
  caseTitle: string;
  personName: string;
  label: string;
  date: string;
  daysUntil: number;
  certainty: string;
  urgent: boolean;
}

interface Desk {
  profile: { id: string; status: string; listed: boolean; acceptingClients: boolean; verificationExpired: boolean } | null;
  consultations: SerializedConsultation[];
  deadlines: Deadline[];
  actNow: { consultationId: string; client: string; personName: string; text: string }[];
}

function Stat({ icon: Icon, value, text, tone }: { icon: typeof Inbox; value: number; text: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-borderCustom bg-card p-4">
      <Icon className={cn("h-5 w-5", tone ?? "text-brandBlue")} aria-hidden />
      <p className="mt-2 text-2xl font-bold text-textPrimary">{value}</p>
      <p className="text-xs text-textSecondary">{text}</p>
    </div>
  );
}

export function ClientDesk() {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    (async () => {
      const [p, c, d] = await Promise.all([
        fetch("/api/lawyer/profile").then(readApi),
        fetch("/api/consultations").then(readApi),
        fetch("/api/advocate/deadlines").then(readApi),
      ]);
      setDesk({
        profile: p.success ? p.data.profile : null,
        consultations: c.success ? c.data.asLawyer : [],
        deadlines: d.success ? d.data.deadlines : [],
        actNow: d.success ? d.data.actNow : [],
      });
    })().catch(() => setDesk({ profile: null, consultations: [], deadlines: [], actNow: [] }));
  }, []);

  async function toggleAvailability() {
    if (!desk?.profile) return;
    setToggling(true);
    const next = !desk.profile.acceptingClients;
    const r = await fetch("/api/lawyer/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceptingClients: next }),
    });
    setToggling(false);
    if (r.ok) setDesk((d) => (d && d.profile ? { ...d, profile: { ...d.profile, acceptingClients: next } } : d));
  }

  if (!desk) return <div className="h-64 animate-pulse rounded-2xl border border-borderCustom bg-card" aria-busy="true" />;

  if (!desk.profile || !desk.profile.listed) {
    return (
      <div className="rounded-2xl border border-borderCustom bg-card p-8 text-center">
        <UserCheck className="mx-auto h-8 w-8 text-brandBlue" aria-hidden />
        <p className="mt-3 text-sm font-semibold text-textPrimary">
          {!desk.profile
            ? "Set up your advocate profile to start receiving requests"
            : desk.profile.status === "SUBMITTED"
              ? "Your profile is under verification"
              : "Your profile is not listed yet"}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-textSecondary">Citizens can find you only after our team verifies your Bar Council enrolment.</p>
        <Link href="/dashboard/advocate/profile" className="mt-4 inline-flex rounded-xl bg-brandBlue px-4 py-2 text-sm font-semibold text-white">
          Open advocate profile
        </Link>
      </div>
    );
  }

  const pending = desk.consultations.filter((c) => c.status === "PENDING");
  const active = desk.consultations.filter((c) => c.status === "ACCEPTED");
  const weekDeadlines = desk.deadlines.filter((d) => d.daysUntil <= 7);
  const unread = desk.consultations.reduce((n, c) => n + c.unread, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borderCustom bg-card p-4">
        <div>
          <p className="text-sm font-semibold text-textPrimary">{desk.profile.acceptingClients ? "You are taking new requests" : "You are not taking new requests"}</p>
          <p className="text-xs text-textSecondary">Turn this off when you are busy — existing clients can still message you.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={desk.profile.acceptingClients}
          aria-label="Taking new requests"
          disabled={toggling}
          onClick={toggleAvailability}
          className={cn(
            "relative h-7 w-12 rounded-full transition-colors disabled:opacity-50",
            desk.profile.acceptingClients ? "bg-emerald-600" : "bg-slate-400"
          )}
        >
          <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white transition-all", desk.profile.acceptingClients ? "left-6" : "left-1")} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Inbox} value={pending.length} text="New requests" tone="text-amber-600" />
        <Stat icon={MessagesSquare} value={active.length} text="Active clients" />
        <Stat icon={AlarmClock} value={weekDeadlines.length} text="Deadlines this week" tone="text-rose-600" />
        <Stat icon={MessagesSquare} value={unread} text="Unread messages" />
      </div>

      {desk.actNow.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-rose-500/50 bg-rose-500/5 p-4" role="alert" aria-label="Act today">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
            <ShieldAlert className="h-4 w-4" aria-hidden /> Act today
          </p>
          {desk.actNow.map((a, i) => (
            <Link key={i} href={`/dashboard/consultations/${a.consultationId}`} className="block text-sm text-textPrimary hover:underline">
              <strong>{a.personName}</strong> (client {a.client}): {a.text}
            </Link>
          ))}
        </section>
      )}

      <section className="rounded-2xl border border-borderCustom bg-card p-5" aria-label="Client deadlines">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-textSecondary">
          <CalendarClock className="h-4 w-4 text-brandBlue" aria-hidden /> Client custody deadlines (Rights Clock)
        </h2>
        <p className="mt-1 text-xs text-textSecondary">From cases your clients have shared with you. Next 120 days.</p>
        {desk.deadlines.length === 0 ? (
          <p className="mt-4 text-sm text-textSecondary">No upcoming deadlines in shared cases.</p>
        ) : (
          <ul className="mt-3 divide-y divide-borderCustom">
            {desk.deadlines.map((d, i) => (
              <li key={i}>
                <Link href={`/dashboard/consultations/${d.consultationId}`} className="flex items-center gap-3 py-3 hover:bg-canvas">
                  <div className={cn("w-16 shrink-0 text-center", d.urgent ? "text-rose-600 dark:text-rose-400" : "text-textPrimary")}>
                    <p className="text-lg font-bold leading-none">{d.daysUntil === 0 ? "Today" : d.daysUntil}</p>
                    {d.daysUntil > 0 && <p className="text-[10px] uppercase">day{d.daysUntil === 1 ? "" : "s"}</p>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-textPrimary">
                      {d.personName} — {d.label}
                    </p>
                    <p className="truncate text-xs text-textSecondary">
                      {formatDate(d.date)} · client {d.client} · {d.caseTitle}
                      {d.certainty === "CONTESTED" && " · contested in law"}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-textSecondary" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-borderCustom bg-card p-5" aria-label="New requests">
        <h2 className="text-xs font-bold uppercase tracking-wider text-textSecondary">New requests</h2>
        {pending.length === 0 ? (
          <p className="mt-3 text-sm text-textSecondary">No new requests.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {pending.map((c) => (
              <li key={c.id}>
                <Link href={`/dashboard/consultations/${c.id}`} className="flex items-center gap-3 rounded-xl border border-borderCustom p-3 hover:border-brandBlue/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-textPrimary">{c.client.name}</p>
                      <StatusPill status={c.status} />
                      {c.urgency === "URGENT" && <span className="text-[11px] font-bold text-rose-600">URGENT</span>}
                      {c.shares.some((s) => s.active) && <span className="text-[11px] font-semibold text-brandBlue">Case file shared</span>}
                    </div>
                    <p className="truncate text-xs text-textSecondary">
                      {label.practiceArea(c.category)} · {label.language(c.language)} · {c.summary}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-textSecondary" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/dashboard/consultations" className="mt-3 inline-block text-xs font-semibold text-brandBlue">
          All consultations →
        </Link>
      </section>
    </div>
  );
}
