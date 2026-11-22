"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronRight, ExternalLink, FileText, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { DOCUMENT_TYPES, label } from "@/lib/lawyers/constants";
import { Avatar, Chip, DemoBadge, StatusPill } from "./ui";

const STATUSES = ["SUBMITTED", "VERIFIED", "REJECTED", "SUSPENDED", "DRAFT"] as const;

interface QueueItem {
  id: string;
  fullName: string;
  email: string;
  barCouncil: string;
  enrolmentNumber: string;
  city: string;
  status: string;
  submittedAt: string | null;
  documentCount: number;
  isDemo: boolean;
}

export function AdminLawyerQueue() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("SUBMITTED");
  const [data, setData] = useState<{ profiles: QueueItem[]; counts: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    fetch(`/api/admin/lawyers?status=${status}`)
      .then((r) => r.json())
      .then((j) => (j.success ? setData(j.data) : setError(j.error?.message ?? "Could not load.")))
      .catch(() => setError("Could not reach the server."));
  }, [status]);

  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold",
              status === s ? "border-brandBlue bg-brandBlue text-white" : "border-borderCustom bg-card text-textSecondary"
            )}
          >
            {s === "SUBMITTED" ? "Waiting for review" : s.charAt(0) + s.slice(1).toLowerCase()}
            {data?.counts[s] ? <span className="ml-1 opacity-75">{data.counts[s]}</span> : null}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}
      {!data ? (
        <div className="h-32 animate-pulse rounded-2xl border border-borderCustom bg-card" />
      ) : data.profiles.length === 0 ? (
        <p className="rounded-2xl border border-borderCustom bg-card p-8 text-center text-sm text-textSecondary">Nothing here.</p>
      ) : (
        <ul className="space-y-2">
          {data.profiles.map((p) => (
            <li key={p.id}>
              <Link href={`/dashboard/admin/lawyers/${p.id}`} className="flex items-center gap-3 rounded-2xl border border-borderCustom bg-card p-4 hover:border-brandBlue/50">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-textPrimary">{p.fullName}</p>
                    <StatusPill status={p.status} />
                    {p.isDemo && <DemoBadge />}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-textSecondary">
                    {p.enrolmentNumber} · {p.barCouncil} · {p.city} · {p.email} · {p.documentCount}/4 documents
                    {p.submittedAt && ` · submitted ${new Date(p.submittedAt).toLocaleDateString("en-IN")}`}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-textSecondary" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Detail {
  profile: {
    id: string;
    fullName: string;
    photoUrl: string | null;
    gender: string | null;
    barCouncilName: string;
    enrolmentNumber: string;
    enrolmentYear: number;
    aibeNumber: string | null;
    practiceAreas: string[];
    courts: string[];
    languages: string[];
    bio: string | null;
    officeAddress: string;
    city: string;
    pincode: string;
    status: string;
    isDemo: boolean;
    rejectionReason: string | null;
    submittedAt: string | null;
    verifiedAt: string | null;
    reviewedBy: string | null;
    documents: { id: string; type: string; contentType: string; sizeBytes: number; uploadedAt: string; url: string }[];
  };
  account: { email: string; name: string | null; emailVerified: boolean; createdAt: string };
  checks: { check: string; ok: boolean; detail: string }[];
  history: { action: string; by: string | null; at: string; metadata: { reason?: string | null } | null }[];
}

export function AdminLawyerReview({ id }: { id: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/admin/lawyers/${id}`)
      .then((r) => r.json())
      .then((j) => (j.success ? setD(j.data) : setError(j.error?.message ?? "Could not load.")))
      .catch(() => setError("Could not reach the server."));
  }, [id]);
  useEffect(load, [load]);

  async function decide(decision: "APPROVE" | "REJECT" | "SUSPEND" | "REINSTATE") {
    if (decision !== "APPROVE" && decision !== "REINSTATE" && !reason.trim()) {
      return setError("Write a reason first — the advocate will see it.");
    }
    if (!window.confirm(`${decision.charAt(0) + decision.slice(1).toLowerCase()} this advocate?`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/lawyers/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason: reason.trim() || null }),
      });
      const j = await r.json();
      if (!j.success) return setError(j.error?.message ?? "Could not save the decision.");
      setDone(`Saved: now ${j.data.status.toLowerCase()}.`);
      setReason("");
      load();
    } finally {
      setBusy(false);
    }
  }

  if (error && !d) return <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>;
  if (!d) return <div className="h-64 animate-pulse rounded-2xl border border-borderCustom bg-card" />;
  const p = d.profile;
  const docsByType = new Map(p.documents.map((x) => [x.type, x]));

  return (
    <div className="space-y-5">
      <Link href="/dashboard/admin/lawyers" className="inline-flex items-center gap-1 text-xs font-semibold text-textSecondary hover:text-textPrimary">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Verification queue
      </Link>

      <section className="flex flex-wrap items-start gap-4 rounded-2xl border border-borderCustom bg-card p-5">
        <Avatar name={p.fullName} photoUrl={p.photoUrl} size={88} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-textPrimary">{p.fullName}</h1>
            <StatusPill status={p.status} />
            {p.isDemo && <DemoBadge />}
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {[
              ["Bar Council", p.barCouncilName],
              ["Enrolment", `${p.enrolmentNumber} (${p.enrolmentYear})`],
              ["AIBE", p.aibeNumber ?? "—"],
              ["Account", `${d.account.email}${d.account.emailVerified ? " ✓" : " (unverified)"}`],
              ["Office", `${p.officeAddress}, ${p.city} ${p.pincode}`],
              ["Submitted", p.submittedAt ? new Date(p.submittedAt).toLocaleString("en-IN") : "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-24 shrink-0 text-textSecondary">{k}</dt>
                <dd className="min-w-0 break-words font-medium text-textPrimary">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap gap-1">
            {p.practiceAreas.map((a) => (
              <Chip key={a}>{label.practiceArea(a)}</Chip>
            ))}
            {p.languages.map((l) => (
              <Chip key={l}>{label.language(l)}</Chip>
            ))}
          </div>
          {p.bio && <p className="mt-3 text-sm text-textPrimary">“{p.bio}”</p>}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-borderCustom bg-card p-5" aria-label="Automatic checks">
          <h2 className="text-xs font-bold uppercase tracking-wider text-textSecondary">Automatic checks</h2>
          <ul className="mt-3 space-y-2">
            {d.checks.map((c) => (
              <li key={c.check} className="flex gap-2 text-sm">
                {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Passed" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-label="Failed" />}
                <span>
                  <span className="font-semibold text-textPrimary">{c.check}</span>
                  <span className="block text-xs text-textSecondary">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-borderCustom pt-3 text-xs leading-relaxed text-textSecondary">
            Before approving: compare the name and enrolment number on the certificate with the profile; check the selfie matches the ID
            and the profile photo; where the State Bar Council publishes its roll online, look the enrolment number up there.
          </p>
        </section>

        <section className="rounded-2xl border border-borderCustom bg-card p-5" aria-label="Decision">
          <h2 className="text-xs font-bold uppercase tracking-wider text-textSecondary">Decision</h2>
          {done && <p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">{done}</p>}
          {error && <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-400">{error}</p>}
          <label className="mt-3 block text-xs font-semibold text-textSecondary">
            Reason (required to reject or suspend — the advocate sees it)
            <textarea
              className="mt-1 w-full rounded-xl border border-borderCustom bg-card px-3 py-2 text-sm text-textPrimary outline-none focus:border-brandBlue"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. The enrolment certificate is not readable — please upload a clearer scan."
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {p.status === "SUBMITTED" && (
              <>
                <button type="button" disabled={busy} onClick={() => decide("APPROVE")} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
                </button>
                <button type="button" disabled={busy} onClick={() => decide("REJECT")} className="rounded-xl border border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50 dark:text-rose-400">
                  Reject
                </button>
              </>
            )}
            {(p.status === "VERIFIED" || p.status === "SUBMITTED") && (
              <button type="button" disabled={busy} onClick={() => decide("SUSPEND")} className="rounded-xl border border-borderCustom px-4 py-2 text-sm font-semibold text-textPrimary disabled:opacity-50">
                Suspend
              </button>
            )}
            {p.status === "SUSPENDED" && (
              <button type="button" disabled={busy} onClick={() => decide("REINSTATE")} className="rounded-xl border border-borderCustom px-4 py-2 text-sm font-semibold text-textPrimary disabled:opacity-50">
                Reinstate for review
              </button>
            )}
          </div>
          {p.rejectionReason && <p className="mt-3 text-xs text-textSecondary">Last note: {p.rejectionReason}</p>}
        </section>
      </div>

      <section className="rounded-2xl border border-borderCustom bg-card p-5" aria-label="Documents">
        <h2 className="text-xs font-bold uppercase tracking-wider text-textSecondary">Documents</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {DOCUMENT_TYPES.map((t) => {
            const doc = docsByType.get(t.key);
            return (
              <div key={t.key} className="rounded-xl border border-borderCustom p-3">
                <p className="text-sm font-semibold text-textPrimary">{t.label}</p>
                {!doc ? (
                  <p className="mt-2 text-xs text-rose-700 dark:text-rose-400">Not uploaded</p>
                ) : doc.contentType === "application/pdf" ? (
                  <a href={doc.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brandBlue">
                    <FileText className="h-4 w-4" aria-hidden /> Open PDF <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ) : (
                  <a href={doc.url} target="_blank" rel="noreferrer" className="mt-2 block">
                    <img src={doc.url} alt={t.label} className="max-h-72 w-full rounded-lg bg-canvas object-contain" />
                  </a>
                )}
                {doc && <p className="mt-1 text-[11px] text-textSecondary">Uploaded {new Date(doc.uploadedAt).toLocaleString("en-IN")} · {Math.max(1, Math.round(doc.sizeBytes / 1024))} KB</p>}
              </div>
            );
          })}
        </div>
      </section>

      {d.history.length > 0 && (
        <section className="rounded-2xl border border-borderCustom bg-card p-5" aria-label="History">
          <h2 className="text-xs font-bold uppercase tracking-wider text-textSecondary">History</h2>
          <ul className="mt-3 space-y-1.5 text-xs text-textSecondary">
            {d.history.map((h, i) => (
              <li key={i}>
                <span className="font-semibold text-textPrimary">{h.action.replace(/_/g, " ").toLowerCase()}</span> · {h.by ?? "system"} ·{" "}
                {new Date(h.at).toLocaleString("en-IN")}
                {h.metadata?.reason ? ` — “${h.metadata.reason}”` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
