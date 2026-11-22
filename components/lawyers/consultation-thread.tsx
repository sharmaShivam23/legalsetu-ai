"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, FolderOpen, Loader2, Lock, Send, Share2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { label } from "@/lib/lawyers/constants";
import type { SerializedConsultation } from "@/lib/lawyers/consultations";
import type { RightsClockResult } from "@/lib/rights-clock/engine";
import { RightsClockResultView } from "@/components/rights-clock/result-view";
import { Avatar, DemoBadge, StatusPill } from "./ui";

interface Message {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  read: boolean;
}

interface SharedCase {
  case: { id: string; title: string; summary: string | null; status: string; nextAction: string | null; nextActionDue: string | null };
  trackers: { id: string; personName: string; firNumber: string | null; policeStation: string | null; result: RightsClockResult }[];
  firDrafts: { id: string; status: string; incidentType: string | null; draftText: string | null; updatedAt: string }[];
  documents: { id: string; title: string; extractedText: string | null; truncated: boolean }[];
}

const POLL_MS = 5000;

function SharedCaseView({ consultationId, caseId }: { consultationId: string; caseId: string }) {
  const [data, setData] = useState<SharedCase | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/consultations/${consultationId}/cases/${caseId}`)
      .then((r) => r.json())
      .then((j) => (j.success ? setData(j.data) : setError(j.error?.message ?? "Could not open the case.")))
      .catch(() => setError("Could not reach the server."));
  }, [consultationId, caseId]);

  if (error) return <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>;
  if (!data) return <Loader2 className="h-5 w-5 animate-spin text-textSecondary" aria-label="Loading case" />;

  return (
    <div className="space-y-4">
      {data.case.summary && <p className="text-sm text-textPrimary">{data.case.summary}</p>}
      {data.case.nextAction && (
        <p className="text-xs text-textSecondary">
          Next action: <span className="font-semibold text-textPrimary">{data.case.nextAction}</span>
        </p>
      )}
      {data.trackers.map((t) => (
        <div key={t.id} className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-textSecondary">
            Rights Clock — {t.personName}
            {t.firNumber ? ` · FIR ${t.firNumber}` : ""}
            {t.policeStation ? ` · ${t.policeStation}` : ""}
          </p>
          <RightsClockResultView result={t.result} compact narrow />
        </div>
      ))}
      {data.firDrafts.map((f) => (
        <details key={f.id} className="rounded-xl border border-borderCustom bg-canvas p-3">
          <summary className="cursor-pointer text-sm font-semibold text-textPrimary">
            FIR draft{f.incidentType ? ` — ${f.incidentType}` : ""}
          </summary>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-textPrimary">{f.draftText ?? "No draft text yet."}</pre>
        </details>
      ))}
      {data.documents.map((d) => (
        <details key={d.id} className="rounded-xl border border-borderCustom bg-canvas p-3">
          <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-textPrimary">
            <FileText className="h-3.5 w-3.5" aria-hidden /> {d.title}
          </summary>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-textPrimary">
            {d.extractedText ?? "No text was extracted from this document."}
            {d.truncated ? "\n…(truncated)" : ""}
          </pre>
        </details>
      ))}
      {data.trackers.length + data.firDrafts.length + data.documents.length === 0 && (
        <p className="text-sm text-textSecondary">This case has no trackers, FIR drafts or documents yet.</p>
      )}
    </div>
  );
}

export function ConsultationThread({ id }: { id: string }) {
  const [c, setC] = useState<SerializedConsultation | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [canSend, setCanSend] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [openCase, setOpenCase] = useState<string | null>(null);
  const [cases, setCases] = useState<{ id: string; title: string }[]>([]);
  const [shareCaseId, setShareCaseId] = useState("");
  const [shareConsent, setShareConsent] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastSeen = useRef<string | null>(null);

  const loadConsultation = useCallback(async () => {
    const r = await fetch(`/api/consultations/${id}`);
    if (r.status === 404) return setNotFound(true);
    const j = await r.json();
    if (j.success) setC(j.data.consultation);
  }, [id]);

  const loadMessages = useCallback(async () => {
    // Overlap the window by 2 s and de-duplicate, so a message written in
    // the same millisecond as the last one seen is never missed.
    const after = lastSeen.current ? new Date(new Date(lastSeen.current).getTime() - 2000).toISOString() : null;
    const r = await fetch(`/api/consultations/${id}/messages${after ? `?after=${encodeURIComponent(after)}` : ""}`);
    if (!r.ok) return;
    const j = await r.json();
    if (!j.success) return;
    setCanSend(j.data.canSend);
    const incoming: Message[] = j.data.messages;
    if (incoming.length) {
      lastSeen.current = incoming[incoming.length - 1].createdAt;
      setMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        for (const m of incoming) map.set(m.id, m);
        return [...map.values()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      });
    }
  }, [id]);

  useEffect(() => {
    void loadConsultation();
    void loadMessages();
  }, [loadConsultation, loadMessages]);

  // Poll while the consultation is live; stop once it has ended.
  const live = c?.status === "PENDING" || c?.status === "ACCEPTED";
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadMessages();
      void loadConsultation();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [live, loadMessages, loadConsultation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  useEffect(() => {
    if (c?.party !== "CITIZEN") return;
    fetch("/api/cases")
      .then((r) => r.json())
      .then((j) => j.success && setCases(j.data.cases.map((x: { id: string; title: string }) => ({ id: x.id, title: x.title }))))
      .catch(() => undefined);
  }, [c?.party]);

  async function act(action: string, reason?: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/consultations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason || null }),
      });
      const j = await r.json();
      if (!j.success) return setError(j.error?.message ?? "Could not update the request.");
      setC(j.data.consultation);
      setDeclining(false);
      void loadMessages();
    } finally {
      setBusy(false);
    }
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const r = await fetch(`/api/consultations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const j = await r.json();
      if (!j.success) return setError(j.error?.message ?? "Could not send the message.");
      setDraft("");
      const m: Message = j.data.message;
      lastSeen.current = m.createdAt;
      setMessages((prev) => [...prev.filter((x) => x.id !== m.id), m]);
    } catch {
      setError("Could not reach the server. Your message was not sent.");
    } finally {
      setSending(false);
    }
  }

  async function share() {
    if (!shareCaseId || !shareConsent) return;
    setBusy(true);
    const r = await fetch(`/api/consultations/${id}/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: shareCaseId }),
    });
    const j = await r.json();
    setBusy(false);
    if (!j.success) return setError(j.error?.message ?? "Could not share the case.");
    setShareCaseId("");
    setShareConsent(false);
    void loadConsultation();
  }

  async function revoke(shareId: string) {
    if (!window.confirm("Stop sharing this case? The advocate will no longer be able to see it.")) return;
    setBusy(true);
    const r = await fetch(`/api/consultations/${id}/shares/${shareId}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return setError("Could not stop sharing. Please try again.");
    void loadConsultation();
  }

  if (notFound) {
    return (
      <div className="rounded-2xl border border-borderCustom bg-card p-10 text-center">
        <p className="text-sm font-semibold text-textPrimary">Consultation not found</p>
        <Link href="/dashboard/consultations" className="mt-3 inline-block text-sm font-semibold text-brandBlue">
          Back to consultations
        </Link>
      </div>
    );
  }
  if (!c) return <div className="h-64 animate-pulse rounded-2xl border border-borderCustom bg-card" aria-busy="true" />;

  const isLawyer = c.party === "LAWYER";
  const activeShares = c.shares.filter((s) => s.active);
  const shareable = cases.filter((x) => !activeShares.some((s) => s.caseId === x.id));

  return (
    <div className="space-y-5">
      <Link href="/dashboard/consultations" className="inline-flex items-center gap-1 text-xs font-semibold text-textSecondary hover:text-textPrimary">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All consultations
      </Link>

      {/* Header */}
      <section className="flex flex-wrap items-start gap-4 rounded-2xl border border-borderCustom bg-card p-5" aria-label="Consultation">
        <Avatar name={isLawyer ? c.client.name : c.lawyer.fullName} photoUrl={isLawyer ? null : c.lawyer.photoUrl} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {isLawyer ? (
              <h1 className="text-lg font-semibold text-textPrimary">{c.client.name}</h1>
            ) : (
              <Link href={`/dashboard/lawyers/${c.lawyer.id}`} className="text-lg font-semibold text-textPrimary hover:text-brandBlue">
                {c.lawyer.fullName}
              </Link>
            )}
            <StatusPill status={c.status} />
            {c.urgency === "URGENT" && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white">URGENT</span>}
            {!isLawyer && c.lawyer.isDemo && <DemoBadge />}
          </div>
          <p className="mt-0.5 text-xs text-textSecondary">
            {label.practiceArea(c.category)} · in {label.language(c.language)} · requested{" "}
            {new Date(c.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            {!isLawyer && ` · ${c.lawyer.enrolmentNumber}`}
          </p>
          {c.declineReason && <p className="mt-2 text-sm text-rose-700 dark:text-rose-400">Advocate&apos;s note: {c.declineReason}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {c.actions.includes("accept") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act("accept")}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Accept
            </button>
          )}
          {c.actions.includes("decline") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setDeclining((d) => !d)}
              className="rounded-xl border border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-500/5 disabled:opacity-50 dark:text-rose-400"
            >
              Decline
            </button>
          )}
          {c.actions.includes("cancel") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => window.confirm("Cancel this request?") && act("cancel")}
              className="rounded-xl border border-borderCustom px-4 py-2 text-sm font-semibold text-textPrimary hover:bg-canvas disabled:opacity-50"
            >
              Cancel request
            </button>
          )}
          {c.actions.includes("close") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => window.confirm("Close this consultation? Messaging and case sharing will end.") && act("close")}
              className="rounded-xl border border-borderCustom px-4 py-2 text-sm font-semibold text-textPrimary hover:bg-canvas disabled:opacity-50"
            >
              Close consultation
            </button>
          )}
        </div>
        {declining && (
          <div className="w-full space-y-2">
            <label className="block text-xs font-semibold text-textSecondary">
              Note for the client (optional) — e.g. suggest a colleague or legal aid
              <textarea
                className="mt-1 w-full rounded-xl border border-borderCustom bg-card px-3 py-2 text-sm text-textPrimary outline-none focus:border-brandBlue"
                value={declineReason}
                maxLength={300}
                onChange={(e) => setDeclineReason(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => act("decline", declineReason)}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Confirm decline
            </button>
          </div>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-borderCustom bg-card p-5" aria-label="Request">
            <h2 className="text-xs font-bold uppercase tracking-wider text-textSecondary">{isLawyer ? "What the client wrote" : "Your request"}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-textPrimary">{c.summary}</p>
          </section>

          <section className="rounded-2xl border border-borderCustom bg-card p-5" aria-label="Shared case files">
            <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-textSecondary">
              <FolderOpen className="h-4 w-4" aria-hidden /> Shared case files
            </h2>
            {activeShares.length === 0 && (
              <p className="mt-2 text-sm text-textSecondary">{isLawyer ? "The client has not shared a case file." : "You have not shared a case file."}</p>
            )}
            <ul className="mt-2 space-y-2">
              {activeShares.map((s) => (
                <li key={s.id} className="rounded-xl border border-borderCustom p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-textPrimary">{s.caseTitle}</p>
                    {isLawyer ? (
                      (c.status === "PENDING" || c.status === "ACCEPTED") && (
                        <button
                          type="button"
                          onClick={() => setOpenCase((o) => (o === s.caseId ? null : s.caseId))}
                          className="text-xs font-semibold text-brandBlue"
                          aria-expanded={openCase === s.caseId}
                        >
                          {openCase === s.caseId ? "Hide" : "Open case file"}
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => revoke(s.id)}
                        className="flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-400"
                      >
                        <Undo2 className="h-3.5 w-3.5" aria-hidden /> Stop sharing
                      </button>
                    )}
                  </div>
                  {isLawyer && openCase === s.caseId && (
                    <div className="mt-3">
                      <SharedCaseView consultationId={c.id} caseId={s.caseId} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!isLawyer && (c.status === "PENDING" || c.status === "ACCEPTED") && shareable.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-borderCustom pt-3">
                <label className="block text-xs font-semibold text-textSecondary">
                  Share another case
                  <select
                    className="mt-1 w-full rounded-xl border border-borderCustom bg-card px-3 py-2 text-sm text-textPrimary"
                    value={shareCaseId}
                    onChange={(e) => {
                      setShareCaseId(e.target.value);
                      setShareConsent(false);
                    }}
                  >
                    <option value="">Choose a case…</option>
                    {shareable.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.title}
                      </option>
                    ))}
                  </select>
                </label>
                {shareCaseId && (
                  <>
                    <label className="flex items-start gap-2 text-xs text-textPrimary">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brandBlue" checked={shareConsent} onChange={(e) => setShareConsent(e.target.checked)} />
                      I agree to let this advocate read this case while the consultation is open. I can stop sharing at any time.
                    </label>
                    <button
                      type="button"
                      disabled={!shareConsent || busy}
                      onClick={share}
                      className="flex items-center gap-1.5 rounded-xl bg-brandBlue px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <Share2 className="h-3.5 w-3.5" aria-hidden /> Share case
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Messages */}
        <section className="flex min-h-[420px] flex-col rounded-2xl border border-borderCustom bg-card" aria-label="Messages">
          <div className="border-b border-borderCustom px-5 py-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-textSecondary">Messages</h2>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4" style={{ maxHeight: 520 }} aria-live="polite">
            {messages.length === 0 && (
              <p className="pt-8 text-center text-sm text-textSecondary">
                {c.status === "PENDING"
                  ? isLawyer
                    ? "Accept the request to start messaging."
                    : "Messaging opens when the advocate accepts your request."
                  : "No messages yet."}
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                    m.mine ? "rounded-br-sm bg-brandBlue text-white" : "rounded-bl-sm bg-canvas text-textPrimary"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cn("mt-0.5 text-right text-[10px]", m.mine ? "text-white/70" : "text-textSecondary")}>
                    {new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    {m.mine && (m.read ? " · Seen" : "")}
                  </p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          {canSend ? (
            <form onSubmit={send} className="flex items-end gap-2 border-t border-borderCustom p-3">
              <label htmlFor="message" className="sr-only">
                Message
              </label>
              <textarea
                id="message"
                rows={2}
                value={draft}
                maxLength={4000}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
                className="min-h-[44px] flex-1 resize-none rounded-xl border border-borderCustom bg-canvas px-3 py-2 text-sm text-textPrimary outline-none focus:border-brandBlue"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                aria-label="Send"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brandBlue text-white disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          ) : (
            <p className="flex items-center gap-1.5 border-t border-borderCustom px-5 py-3 text-xs text-textSecondary">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              {c.status === "PENDING" ? "Messaging opens once the request is accepted." : "This consultation has ended."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
