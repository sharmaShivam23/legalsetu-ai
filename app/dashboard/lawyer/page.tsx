"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Phone,
  Globe,
  ShieldCheck,
  Siren,
  Send,
  Clock3,
  CheckCircle2,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { TiltCard } from "@/components/ui/tilt-card";
import { LEGAL_AID_CATEGORIES, REFERRAL_CATEGORIES, categoryMeta } from "@/lib/legal-aid/categories";

interface Resource {
  id: string;
  name: string;
  category: string;
  phone: string | null;
  description: string;
  website: string | null;
  sourceUrl: string;
}

interface Referral {
  id: string;
  category: string;
  notes: string | null;
  status: "SUBMITTED" | "ACKNOWLEDGED" | "CLOSED";
  createdAt: string;
  caseId: string | null;
}

const STATUS_META: Record<Referral["status"], { label: string; icon: typeof Clock3; className: string }> = {
  SUBMITTED: { label: "Submitted", icon: Clock3, className: "text-amber-600 dark:text-amber-400" },
  ACKNOWLEDGED: { label: "Acknowledged", icon: CheckCircle2, className: "text-brandBlue" },
  CLOSED: { label: "Closed", icon: CheckCircle2, className: "text-textSecondary" },
};

export default function LawyerPage() {
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [filter, setFilter] = useState<string>("ALL");
  const [referrals, setReferrals] = useState<Referral[] | null>(null);
  const [category, setCategory] = useState<(typeof REFERRAL_CATEGORIES)[number]["key"]>("GENERAL");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/legal-aid")
      .then((r) => r.json())
      .then((json) => setResources(json?.data?.resources ?? []))
      .catch(() => setResources([]));
    loadReferrals();
  }, []);

  function loadReferrals() {
    fetch("/api/legal-aid/referral")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setReferrals(json?.data?.referrals ?? []))
      .catch(() => setReferrals([]));
  }

  const filtered = useMemo(() => {
    if (!resources) return null;
    if (filter === "ALL") return resources;
    return resources.filter((r) => r.category === filter);
  }, [resources, filter]);

  const emergency = resources?.find((r) => r.category === "EMERGENCY");

  async function submitReferral(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/legal-aid/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, notes: notes.trim() || undefined }),
      });
      if (!res.ok) throw new Error();
      toast.success("Request recorded. You can track its status below.");
      setNotes("");
      loadReferrals();
    } catch {
      toast.error("Could not submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 text-textPrimary sm:px-6 sm:py-12">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-textPrimary">Lawyer / Legal Aid</h1>
        <p className="mt-1 text-sm text-textSecondary">
          Verified government helplines for when a matter needs more than a chatbot — every
          number here links to the official source that publishes it.
        </p>
      </div>

      {emergency && (
        <TiltCard maxTilt={4} className="mt-6 rounded-2xl">
          <a
            href={`tel:${emergency.phone}`}
            className="relative block overflow-hidden rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-600 to-rose-500 p-5 text-white shadow-lg shadow-rose-500/20"
          >
            <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 animate-pulse items-center justify-center rounded-full bg-white/20">
                <Siren className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
                  In immediate danger? Call now
                </p>
                <p className="text-2xl font-bold tracking-tight" data-no-translate>
                  {emergency.phone}
                </p>
              </div>
              <Phone className="ml-auto h-5 w-5 shrink-0 opacity-80" />
            </div>
          </a>
        </TiltCard>
      )}

      <div className="mt-6 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setFilter("ALL")}
          className={
            "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors " +
            (filter === "ALL"
              ? "border-brandBlue bg-brandBlue text-white"
              : "border-borderCustom bg-card text-textSecondary hover:text-textPrimary")
          }
        >
          All
        </button>
        {LEGAL_AID_CATEGORIES.filter((c) => c.key !== "EMERGENCY").map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            className={
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors " +
              (filter === c.key
                ? `${c.solid} border-transparent text-white`
                : "border-borderCustom bg-card text-textSecondary hover:text-textPrimary")
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {filtered === null &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-borderCustom bg-card" />
          ))}

        {filtered
          ?.filter((r) => r.category !== "EMERGENCY")
          .map((r) => {
            const meta = categoryMeta(r.category);
            return (
              <TiltCard key={r.id} maxTilt={6} className="rounded-2xl">
                <div className="flex h-full flex-col rounded-2xl border border-borderCustom bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[15px] font-semibold text-textPrimary">{r.name}</h3>
                    <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${meta.chip}`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1.5 flex-1 text-xs leading-relaxed text-textSecondary">{r.description}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {r.phone && (
                      <a
                        href={`tel:${r.phone}`}
                        className="flex items-center gap-1.5 rounded-lg bg-brandBlue px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                        data-no-translate
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {r.phone}
                      </a>
                    )}
                    {r.website && (
                      <a
                        href={r.website}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 rounded-lg border border-borderCustom px-3 py-1.5 text-xs font-semibold text-textPrimary hover:bg-canvas"
                      >
                        <Globe className="h-3.5 w-3.5" />
                        Website
                      </a>
                    )}
                    <a
                      href={r.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto flex items-center gap-1 text-[11px] font-medium text-textSecondary hover:text-brandBlue"
                      title="This number was verified directly on the government's own site"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Verified source
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </TiltCard>
            );
          })}
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-borderCustom bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-textPrimary">Request guidance</h2>
          <p className="mt-1 text-xs text-textSecondary">
            Not an emergency, but you want a real next step? Record a request here — LegalSetu
            does not connect to a live lawyer network, but this keeps a private note of what you
            asked for and when, so nothing gets lost.
          </p>
          <form onSubmit={submitReferral} className="mt-4 space-y-3">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
              data-no-translate
              className="w-full rounded-lg border border-borderCustom bg-canvas px-3 py-2 text-sm text-textPrimary outline-none focus:border-brandBlue"
            >
              {REFERRAL_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Briefly describe what you need help with (optional)"
              rows={3}
              maxLength={1000}
              className="w-full resize-none rounded-lg border border-borderCustom bg-canvas px-3 py-2 text-sm text-textPrimary outline-none focus:border-brandBlue"
            />
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit request
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-borderCustom bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-textPrimary">Your requests</h2>
          {referrals === null && (
            <p className="mt-3 text-xs text-textSecondary">Loading…</p>
          )}
          {referrals?.length === 0 && (
            <p className="mt-3 text-xs text-textSecondary">Nothing submitted yet.</p>
          )}
          <ul className="mt-3 space-y-2.5">
            {referrals?.map((r) => {
              const s = STATUS_META[r.status];
              const Icon = s.icon;
              const meta = categoryMeta(r.category);
              return (
                <li key={r.id} className="rounded-lg border border-borderCustom bg-canvas p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${meta.chip}`}>
                      {meta.label}
                    </span>
                    <span className={`flex items-center gap-1 text-[11px] font-medium ${s.className}`}>
                      <Icon className="h-3 w-3" />
                      {s.label}
                    </span>
                  </div>
                  {r.notes && <p className="mt-1.5 text-xs text-textSecondary">{r.notes}</p>}
                  <p className="mt-1 text-[10px] text-textSecondary/70">
                    {new Date(r.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
