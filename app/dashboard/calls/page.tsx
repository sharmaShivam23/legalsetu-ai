"use client";

// ==========================================================
// LegalSetu — Call helpline
// ----------------------------------------------------------
// "Call me": LegalSetu phones the user, asks about their problem in
// their own language, and explains their options aloud. Works on any
// phone, including a basic keypad phone with no internet.
//
// The page requests the call, shows it connecting live (the status
// endpoint asks Twilio, so no public webhook is needed), and lists
// past calls. Each call's transcript is an ordinary saved
// conversation, so it also appears in History.
// ==========================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Phone, PhoneCall, PhoneOff, PhoneMissed, Loader2, ShieldAlert, FileText, Clock, Mic } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/languages";

type Status = "REQUESTED" | "RINGING" | "IN_PROGRESS" | "COMPLETED" | "NO_ANSWER" | "BUSY" | "FAILED" | "CANCELED";

interface CallRow {
  id: string;
  conversationId: string | null;
  phoneMasked: string;
  language: string;
  mode: string;
  status: Status;
  failureReason: string | null;
  requestedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  turnCount: number;
  metrics: { summary?: { avgFirstAudioMs: number | null; p90FirstAudioMs: number | null } } | null;
}

const TERMINAL: Status[] = ["COMPLETED", "NO_ANSWER", "BUSY", "FAILED", "CANCELED"];

const STATUS_TEXT: Record<Status, string> = {
  REQUESTED: "Connecting…",
  RINGING: "Ringing — please pick up",
  IN_PROGRESS: "On the call",
  COMPLETED: "Call ended",
  NO_ANSWER: "Not answered",
  BUSY: "Line busy",
  FAILED: "Could not connect",
  CANCELED: "Cancelled",
};

const STATUS_CHIP: Record<Status, string> = {
  REQUESTED: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  RINGING: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  IN_PROGRESS: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  COMPLETED: "bg-brandBlue/10 text-brandBlue border-brandBlue/30",
  NO_ANSWER: "bg-slate-500/10 text-textSecondary border-borderCustom",
  BUSY: "bg-slate-500/10 text-textSecondary border-borderCustom",
  FAILED: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
  CANCELED: "bg-slate-500/10 text-textSecondary border-borderCustom",
};

function duration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  return m > 0 ? `${m} min ${sec % 60} s` : `${sec} s`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function CallsPage() {
  const { language } = useLanguage();
  const [phone, setPhone] = useState("");
  const [callLanguage, setCallLanguage] = useState(language);
  const [mode, setMode] = useState<"case" | "quick">("case");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  // Follow the interface language until the user picks one for the call.
  const touchedLanguage = useRef(false);
  useEffect(() => {
    if (!touchedLanguage.current) setCallLanguage(language);
  }, [language]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/calls");
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) {
        setCalls(json.data.calls);
        setAvailable(json.data.available);
        setUnavailableReason(json.data.unavailableReason ?? null);
      }
    } catch {
      /* the list is informational */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll the call in progress until it ends.
  const active = calls.find((c) => c.id === activeId) ?? null;
  useEffect(() => {
    if (!activeId) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/calls/${activeId}`);
        const json = await res.json().catch(() => null);
        if (!stopped && res.ok && json?.data?.call) {
          const fresh = json.data.call as CallRow;
          setCalls((prev) => prev.map((c) => (c.id === fresh.id ? { ...c, ...fresh } : c)));
          if (TERMINAL.includes(fresh.status)) {
            setActiveId(null);
            void load();
            return;
          }
        }
      } catch {
        /* try again on the next tick */
      }
      if (!stopped) timer = setTimeout(tick, 2000);
    };
    let timer = setTimeout(tick, 1500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [activeId, load]);

  async function requestCall(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, language: callLanguage, mode, consent }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error?.message ?? "Could not place the call.");
        void load();
        return;
      }
      toast.success("Calling you now — please pick up.");
      await load();
      setActiveId(json.data.id);
    } catch {
      toast.error("Network problem. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function endCall() {
    if (!activeId || ending) return;
    setEnding(true);
    try {
      await fetch(`/api/calls/${activeId}`, { method: "DELETE" });
      setActiveId(null);
      await load();
    } finally {
      setEnding(false);
    }
  }

  const live = active && !TERMINAL.includes(active.status);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brandBlue/10 text-brandBlue">
          <Phone className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Call LegalSetu</h1>
          <p className="text-sm text-textSecondary">
            Tell us your problem on a phone call. We ask a few questions, then explain your options — in your language.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-700 dark:text-rose-300">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong>In danger right now? Hang up and dial 112.</strong> LegalSetu gives legal information, not legal advice, and
          is not an emergency service.
        </p>
      </div>

      {!available && (
        <Card className="mt-5 border-amber-500/30 bg-amber-500/10">
          <CardContent className="py-4 text-sm text-amber-800 dark:text-amber-300">
            {unavailableReason ?? "Phone calls are not available right now."}
          </CardContent>
        </Card>
      )}

      {live ? (
        <Card className="mt-6 border-borderCustom bg-card shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <span
              className={
                "flex h-16 w-16 items-center justify-center rounded-full " +
                (active.status === "IN_PROGRESS" ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600")
              }
            >
              {active.status === "IN_PROGRESS" ? <PhoneCall className="h-7 w-7" /> : <Loader2 className="h-7 w-7 animate-spin" />}
            </span>
            <p className="text-lg font-semibold text-textPrimary">{STATUS_TEXT[active.status]}</p>
            <p className="text-sm text-textSecondary">
              {active.status === "IN_PROGRESS"
                ? "Speak naturally. You can interrupt at any time."
                : `Calling ${active.phoneMasked}. If a message asks you to press a key, press any key.`}
            </p>
            <button
              type="button"
              onClick={endCall}
              disabled={ending}
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
            >
              <PhoneOff className="h-4 w-4" />
              End call
            </button>
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-6 border-borderCustom bg-card shadow-sm">
          <CardContent className="py-6">
            <form onSubmit={requestCall} className="space-y-4">
              <div>
                <label htmlFor="phone" className="text-sm font-medium text-textPrimary">
                  Your mobile number
                </label>
                <div className="mt-1.5 flex items-center overflow-hidden rounded-xl border border-borderCustom bg-canvas focus-within:border-brandBlue">
                  <span className="border-r border-borderCustom px-3 py-2.5 text-sm text-textSecondary">+91</span>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="98765 43210"
                    maxLength={20}
                    className="w-full bg-transparent px-3 py-2.5 text-base text-textPrimary outline-none"
                    data-no-translate
                  />
                </div>
                <p className="mt-1 text-xs text-textSecondary">Indian mobile numbers only. We never store your full number.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="callLang" className="text-sm font-medium text-textPrimary">
                    Language for the call
                  </label>
                  <select
                    id="callLang"
                    value={callLanguage}
                    onChange={(e) => {
                      touchedLanguage.current = true;
                      setCallLanguage(e.target.value as typeof callLanguage);
                    }}
                    className="mt-1.5 w-full rounded-xl border border-borderCustom bg-canvas px-3 py-2.5 text-sm text-textPrimary outline-none focus:border-brandBlue"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code} data-no-translate>
                        {l.nativeName} ({l.englishName})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="text-sm font-medium text-textPrimary">How should we help?</span>
                  <div className="mt-1.5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Call style">
                    {(
                      [
                        { key: "case", label: "Ask me questions first" },
                        { key: "quick", label: "Quick answer" },
                      ] as const
                    ).map((o) => (
                      <button
                        key={o.key}
                        type="button"
                        role="radio"
                        aria-checked={mode === o.key}
                        onClick={() => setMode(o.key)}
                        className={
                          "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors " +
                          (mode === o.key
                            ? "border-brandBlue bg-brandBlue/10 text-brandBlue"
                            : "border-borderCustom bg-canvas text-textSecondary hover:text-textPrimary")
                        }
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-textSecondary">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-brandBlue"
                />
                <span>
                  I want LegalSetu to call this number now, and I understand the conversation is saved as text in my history. This is
                  legal information from an AI, not advice from a lawyer.
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting || !consent || !phone.trim() || !available}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brandBlue px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                Call me now
              </button>
            </form>
          </CardContent>
        </Card>
      )}

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-textSecondary">Your calls</h2>

      {loading && (
        <div className="mt-6 flex items-center justify-center gap-2 text-textSecondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {!loading && calls.length === 0 && (
        <Card className="mt-3 border-borderCustom bg-card shadow-sm">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <PhoneMissed className="h-7 w-7 text-textSecondary opacity-40" />
            <p className="text-sm text-textSecondary">No calls yet. Your first call will appear here, with its transcript.</p>
          </CardContent>
        </Card>
      )}

      <div className="mt-3 space-y-3">
        {calls.map((c) => {
          const avg = c.metrics?.summary?.avgFirstAudioMs;
          return (
            <Card key={c.id} className="border-borderCustom bg-card shadow-sm">
              <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
                <span className={"rounded-full border px-2.5 py-0.5 text-xs font-medium " + STATUS_CHIP[c.status]}>
                  {STATUS_TEXT[c.status]}
                </span>
                <span className="text-sm text-textPrimary" data-no-translate>
                  {c.phoneMasked}
                </span>
                <span className="text-xs text-textSecondary">{when(c.requestedAt)}</span>
                <span className="ml-auto flex items-center gap-3 text-xs text-textSecondary">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {duration(c.durationSec)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Mic className="h-3 w-3" />
                    {c.turnCount} {c.turnCount === 1 ? "turn" : "turns"}
                  </span>
                  {avg != null && <span title="Average time from you finishing to LegalSetu starting to answer">reply ≈ {(avg / 1000).toFixed(1)} s</span>}
                </span>
                {c.failureReason && <p className="w-full text-xs text-rose-600 dark:text-rose-400">{c.failureReason}</p>}
                {c.conversationId && c.turnCount > 0 && (
                  <Link
                    href={`/dashboard/chat?c=${c.conversationId}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-brandBlue hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Read the transcript
                  </Link>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
