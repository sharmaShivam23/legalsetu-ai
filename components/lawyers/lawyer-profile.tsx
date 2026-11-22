"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, CalendarDays, Languages, Loader2, MapPin, MessageSquare, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { label } from "@/lib/lawyers/constants";
import { formatDistance } from "@/lib/lawyers/geo";
import type { PublicLawyerCard } from "@/lib/lawyers/server";
import { LawyerMap } from "./map";
import { Avatar, Chip, DemoBadge, LegalAidBadge, VerifiedBadge } from "./ui";

interface CaseOption {
  id: string;
  title: string;
}

const fieldCls =
  "mt-1 w-full rounded-xl border border-borderCustom bg-card px-3 py-2.5 text-sm text-textPrimary outline-none focus:border-brandBlue";

function RequestForm({ lawyer, onSent }: { lawyer: PublicLawyerCard; onSent: (id: string) => void }) {
  const [category, setCategory] = useState(lawyer.practiceAreas[0] ?? "");
  const [language, setLanguage] = useState(lawyer.languages[0] ?? "en");
  const [urgency, setUrgency] = useState<"NORMAL" | "URGENT">("NORMAL");
  const [summary, setSummary] = useState("");
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [caseId, setCaseId] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cases")
      .then((r) => r.json())
      .then((j) => setCases(j.success ? j.data.cases.map((c: CaseOption) => ({ id: c.id, title: c.title })) : []))
      .catch(() => setCases([]));
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (summary.trim().length < 20) return setError("Describe the problem in at least 20 characters.");
    if (caseId && !consent) return setError("Tick the box to confirm you want to share this case with the advocate.");
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lawyerId: lawyer.id, category, language, urgency, summary, caseId: caseId || null }),
      });
      const json = await res.json();
      if (!json.success) return setError(json.error?.message ?? "Could not send the request.");
      onSent(json.data.consultation.id);
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} className="space-y-4 rounded-2xl border border-brandBlue/30 bg-card p-5" aria-label="Request a consultation">
      <h2 className="text-sm font-bold text-textPrimary">Request a consultation</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-textSecondary">
          Problem area
          <select className={fieldCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            {lawyer.practiceAreas.map((a) => (
              <option key={a} value={a}>
                {label.practiceArea(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-textSecondary">
          Language
          <select className={fieldCls} value={language} onChange={(e) => setLanguage(e.target.value)}>
            {lawyer.languages.map((l) => (
              <option key={l} value={l}>
                {label.language(l)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend className="text-xs font-semibold text-textSecondary">How urgent?</legend>
        <div className="mt-1 flex gap-1.5">
          {(
            [
              ["NORMAL", "Normal"],
              ["URGENT", "Urgent (arrest, court date, deadline)"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              aria-pressed={urgency === v}
              onClick={() => setUrgency(v)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                urgency === v
                  ? v === "URGENT"
                    ? "border-rose-600 bg-rose-600 text-white"
                    : "border-brandBlue bg-brandBlue text-white"
                  : "border-borderCustom text-textSecondary"
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block text-xs font-semibold text-textSecondary">
        What happened? (only this advocate will see it)
        <textarea
          className={cn(fieldCls, "min-h-[110px] resize-y")}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={1500}
          placeholder="e.g. My brother was arrested on 31 Aug under BNS 303(2). He is in Tihar. We need help with bail."
        />
        <span className="mt-0.5 block text-right text-[11px] font-normal">{summary.length}/1500</span>
      </label>
      {cases.length > 0 && (
        <div className="rounded-xl border border-borderCustom bg-canvas p-3">
          <label className="text-xs font-semibold text-textSecondary">
            Share a case file (optional)
            <select
              className={fieldCls}
              value={caseId}
              onChange={(e) => {
                setCaseId(e.target.value);
                setConsent(false);
              }}
            >
              <option value="">Don&apos;t share a case</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          {caseId && (
            <label className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-textPrimary">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brandBlue" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                I agree to let {lawyer.fullName} read this case — Rights Clock dates, FIR drafts and document text — while this consultation is
                open. Private chats are never shared. I can stop sharing at any time.
              </span>
            </label>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}
      <button
        type="submit"
        disabled={sending}
        className="flex items-center gap-2 rounded-xl bg-brandBlue px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
      >
        {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Send request
      </button>
    </form>
  );
}

export function LawyerProfileView({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<{
    lawyer: PublicLawyerCard;
    isSelf: boolean;
    openConsultation: { id: string; status: string } | null;
  } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    fetch(`/api/lawyers/${id}`)
      .then(async (r) => {
        if (r.status === 404) return setNotFound(true);
        const j = await r.json();
        if (j.success) setData(j.data);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound) {
    return (
      <div className="rounded-2xl border border-borderCustom bg-card p-10 text-center">
        <p className="text-sm font-semibold text-textPrimary">This advocate is not available</p>
        <Link href="/dashboard/lawyers" className="mt-3 inline-block text-sm font-semibold text-brandBlue">
          Back to Find a Lawyer
        </Link>
      </div>
    );
  }
  if (!data) return <div className="h-64 animate-pulse rounded-2xl border border-borderCustom bg-card" aria-busy="true" />;
  const l = data.lawyer;

  return (
    <div className="space-y-5">
      <Link href="/dashboard/lawyers" className="inline-flex items-center gap-1 text-xs font-semibold text-textSecondary hover:text-textPrimary">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All advocates
      </Link>

      {l.isDemo && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-2.5 text-xs text-textPrimary">
          This is a <strong>fictional demo profile</strong> used to show how LegalSetu works. It is not a real advocate.
        </p>
      )}

      <section className="flex flex-col gap-5 rounded-2xl border border-borderCustom bg-card p-5 sm:flex-row" aria-label="Advocate">
        <Avatar name={l.fullName} photoUrl={l.photoUrl} size={96} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-2xl font-semibold text-textPrimary">{l.fullName}</h1>
            <VerifiedBadge />
            {l.isDemo && <DemoBadge />}
            <LegalAidBadge panel={l.legalAidPanel} proBono={l.proBono} />
          </div>
          <p className="mt-1 text-sm text-textSecondary">Advocate · {l.barCouncilName}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              <div>
                <dt className="text-xs text-textSecondary">Enrolment number</dt>
                <dd className="font-semibold text-textPrimary">{l.enrolmentNumber}</dd>
              </div>
            </div>
            <div className="flex gap-2">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-brandBlue" aria-hidden />
              <div>
                <dt className="text-xs text-textSecondary">Practising since</dt>
                <dd className="font-semibold text-textPrimary">
                  {l.enrolmentYear} ({l.yearsOfPractice} years)
                </dd>
              </div>
            </div>
            <div className="flex gap-2">
              <Languages className="mt-0.5 h-4 w-4 shrink-0 text-brandBlue" aria-hidden />
              <div>
                <dt className="text-xs text-textSecondary">Languages</dt>
                <dd className="font-semibold text-textPrimary">{l.languages.map(label.language).join(", ")}</dd>
              </div>
            </div>
            <div className="flex gap-2">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-brandBlue" aria-hidden />
              <div>
                <dt className="text-xs text-textSecondary">Courts</dt>
                <dd className="font-semibold text-textPrimary">{l.courts.map(label.court).join(", ")}</dd>
              </div>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {l.practiceAreas.map((a) => (
              <Chip key={a}>{label.practiceArea(a)}</Chip>
            ))}
          </div>
          {l.bio && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-textPrimary">{l.bio}</p>}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          {data.isSelf ? (
            <p className="rounded-2xl border border-borderCustom bg-card p-5 text-sm text-textSecondary">
              This is how citizens see your profile. <Link href="/dashboard/advocate/profile" className="font-semibold text-brandBlue">Edit it</Link>.
            </p>
          ) : data.openConsultation ? (
            <Link
              href={`/dashboard/consultations/${data.openConsultation.id}`}
              className="flex items-center gap-2 rounded-2xl border border-brandBlue/40 bg-brandBlue/5 p-5 text-sm font-semibold text-brandBlue"
            >
              <MessageSquare className="h-4 w-4" aria-hidden />
              {data.openConsultation.status === "PENDING" ? "Request sent — waiting for a reply. Open it" : "Open your conversation"}
            </Link>
          ) : !l.acceptingClients ? (
            <p className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 text-sm text-textPrimary">
              This advocate is not taking new requests right now. Try another advocate nearby, or call free legal aid on 15100.
            </p>
          ) : requesting ? (
            <RequestForm lawyer={l} onSent={(cid) => router.push(`/dashboard/consultations/${cid}`)} />
          ) : (
            <button
              type="button"
              onClick={() => setRequesting(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brandBlue px-5 py-4 text-sm font-semibold text-white hover:opacity-90"
            >
              <MessageSquare className="h-4 w-4" aria-hidden />
              Request a consultation
            </button>
          )}
          <p className="text-[11px] leading-relaxed text-textSecondary">
            LegalSetu does not charge for introductions and takes no commission. Any fee is agreed directly with the advocate. If you cannot
            afford a lawyer, you may be entitled to one free under the Legal Services Authorities Act — call 15100.
          </p>
        </div>
        <section className="space-y-2" aria-label="Office">
          <p className="flex items-start gap-1.5 text-sm text-textPrimary">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brandBlue" aria-hidden />
            <span>
              {l.officeAddress}, {l.city} {l.pincode}
              {l.distanceKm !== null && <span className="text-textSecondary"> · {formatDistance(l.distanceKm)} away</span>}
            </span>
          </p>
          <LawyerMap
            center={[l.latitude, l.longitude]}
            showCenter={false}
            height={260}
            pins={[{ id: l.id, latitude: l.latitude, longitude: l.longitude, title: l.fullName, subtitle: l.officeAddress }]}
            ariaLabel="Office location"
          />
        </section>
      </div>
    </div>
  );
}
