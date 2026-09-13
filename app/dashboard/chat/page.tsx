"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Scale, Sparkles, AlertTriangle, Fingerprint, Layers, Loader2, PanelLeft, Square, X, BookOpen, MessagesSquare, SkipForward, ZoomIn, ZoomOut, RotateCcw, FileText, Download, Printer, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MicButton } from "@/components/voice/mic-button";
import { VoiceMode } from "@/components/voice/voice-mode";
import { ConfidenceBadge } from "@/components/chat/confidence-badge";
import { CitationCard } from "@/components/chat/citation-card";
import { ConversationSidebar, type ConversationSummary } from "@/components/chat/conversation-sidebar";
import { MessageActions } from "@/components/chat/message-actions";
import { AnswerTrustPanel } from "@/components/chat/answer-trust-panel";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { ModeSelector } from "@/components/chat/mode-selector";
import { MermaidDiagram } from "@/components/chat/mermaid-diagram";
import { auditCitations } from "@/lib/rag/citation-guard";
import type { ChatMode } from "@/lib/rag/prompt";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { useLanguage } from "@/components/providers/LanguageProvider";
import remarkGfm from "remark-gfm";
import { ModelSelector } from "@/components/chat/model-selector";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidenceLevel?: "STRONG" | "MODERATE" | "LIMITED" | "INSUFFICIENT";
  citations?: any[];
  isDemo?: boolean;
  /** True while tokens are still arriving for this message. */
  streaming?: boolean;
  /** Set when a cited section could not be matched to a source. */
  citationWarning?: string | null;
  /** Row id once saved, needed to edit or delete this message. */
  dbId?: string;
  /** Statute numbers traced back to retrieved official text. */
  verifiedCitations?: string[];
  /** Statute numbers the corpus could not support. */
  unverifiedCitations?: string[];
  /** How many sections retrieval pulled, shown while streaming. */
  sourceCount?: number;
  /** Which chat mode produced this turn. */
  mode?: ChatMode;
  /** For assistant messages in "case" mode: still gathering facts,
   *  or the full report. "answer"/"explainer" for quick/knowledge. */
  kind?: "question" | "report" | "answer" | "explainer";
  /** Set on the finished FIR draft, so it can offer a PDF download. */
  firDraftId?: string;
}


/**
 * True when an answer appears NOT to be written in the language the
 * user selected.
 *
 * Answers are normally marked data-no-translate, because the model is
 * instructed to write directly in the user's language and a second
 * translation pass would only degrade it. But when the model ignores
 * that instruction, that opt-out would leave English text stranded on
 * a Hindi page. Every language LegalSetu supports except English uses
 * a non-Latin script, so a reply that is almost entirely ASCII is a
 * reliable sign the instruction was not followed — and the runtime
 * translator should be allowed to fix it after all.
 */
/** The English headings the answer format asks for. */
const ENGLISH_HEADINGS =
  /^#{1,4}\s*(Answer|Do this now|Step-by-step plan|Your case[, ]|Legal basis|If this gets harder|Disclaimer|Explanation|Key provisions|Example|Related to explore next|A note on sources)/im;

function looksUntranslated(text: string, language: string): boolean {
  if (language === "en" || !text) return false;

  // Case 1: the model ignored the language instruction outright.
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 40) {
    const nonLatin = letters.replace(/[A-Za-z]/g, "").length;
    if (nonLatin / letters.length < 0.15) return true;
  }

  // Case 2 (the common one): the body came back correctly translated
  // but the section headings stayed in English, leaving a page that
  // reads half-Hindi, half-English. Letting the runtime translator
  // handle the message fixes the headings; prose already in the right
  // language passes through it unchanged.
  return ENGLISH_HEADINGS.test(text);
}

export default function ChatPage() {
  // Answers are generated directly in this language by the model.
  const { language } = useLanguage();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Chat zoom, in rem. Legal text is dense and this app is used by
  // people who may be reading it on a cheap phone in a police station,
  // so being able to enlarge the whole conversation matters.
  const ZOOM_MIN = 0.8;
  const ZOOM_MAX = 1.6;
  const ZOOM_STEP = 0.1;
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    try {
      const saved = parseFloat(localStorage.getItem("ls_chat_zoom") ?? "");
      if (!Number.isNaN(saved) && saved >= ZOOM_MIN && saved <= ZOOM_MAX) {
        setZoom(saved);
      }
    } catch {
      // Private mode / storage blocked — the default zoom is fine.
    }
  }, []);

  function changeZoom(next: number) {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 10) / 10));
    setZoom(clamped);
    try {
      localStorage.setItem("ls_chat_zoom", String(clamped));
    } catch {
      // Non-fatal.
    }
  }

  // Which conversation shape is active — see components/chat/mode-selector.tsx.
  // "case" (full intake -> report + flowchart) is the flagship default.
  const [mode, setMode] = useState<ChatMode>("case");
  const modeRef = useRef<ChatMode>(mode);
  modeRef.current = mode;

  // Selected AI Model
  const [modelId, setModelId] = useState<string>("gemini-default");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ls_chat_model");
      if (saved) setModelId(saved);
    } catch {}
  }, []);
  const handleModelChange = (id: string) => {
    setModelId(id);
    try { localStorage.setItem("ls_chat_model", id); } catch {}
  };

  // The complaint draft a "Generate FIR" conversation is building. Sent
  // back with each turn so the intake continues the same draft rather
  // than starting a new one on every message.
  const firDraftRef = useRef<string | null>(null);

  // --- conversation history ---
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);

  // --- editing an earlier question ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // --- voice mode ---
  const [voiceOpen, setVoiceOpen] = useState(false);

  /**
   * A spoken turn has finished. It went through the same
   * /api/chat/stream pipeline and is already persisted server-side, so
   * this only mirrors it into the visible transcript and adopts the
   * conversation id if voice mode started a fresh thread.
   */
  function addVoiceTurn(question: string, answer: string, newConversationId?: string) {
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "user", content: question, mode: modeRef.current },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: answer,
        mode: modeRef.current,
        streaming: false,
      },
    ]);
    if (newConversationId && !activeIdRef.current) {
      setActiveId(newConversationId);
      activeIdRef.current = newConversationId;
      void loadConversations();
    }
  }

  // Lets the user stop a long generation.
  const abortRef = useRef<AbortController | null>(null);
  // Read inside async callbacks that must not close over a stale value.
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  useEffect(() => {
    // Avoid scrollIntoView as it can shift the entire page upwards in some browsers
    // when applied to elements inside flex containers. Explicitly set scrollTop instead.
    const container = bottomRef.current?.closest(".overflow-y-auto");
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, loading]);


  // ---------------- conversation history ----------------

  async function loadConversations() {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/conversations");
      if (!res.ok) return;
      const json = await res.json();
      setConversations(json?.data?.conversations ?? []);
    } catch {
      // Offline or the database is asleep — the composer still works.
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    void loadConversations();

    // Opening a thread from /dashboard/history passes ?c=<id>.
    // Read it from the URL directly so this page needs no Suspense
    // boundary around useSearchParams().
    if (typeof window !== "undefined") {
      const requested = new URLSearchParams(window.location.search).get("c");
      if (requested) void openConversation(requested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Opens a saved thread and replaces what is on screen. */
  async function openConversation(id: string) {
    if (loading) stopGeneration();
    try {
      const res = await fetch("/api/conversations/" + id);
      if (!res.ok) {
        toast.error("Could not open that chat.");
        return;
      }
      const json = await res.json();
      const conv = json?.data?.conversation;
      if (!conv) return;

      setActiveId(conv.id);
      const restoredMessages = (conv.messages ?? []).filter(
        (m: any) => m.role === "USER" || m.role === "ASSISTANT"
      );

      // Continuing an old thread should continue in the mode it was
      // started in — reopening a Case Analysis thread should not
      // silently drop back into a different mode.
      const lastMode = [...restoredMessages].reverse().find((m: any) => m.mode)?.mode;
      if (lastMode === "quick" || lastMode === "case" || lastMode === "knowledge") {
        setMode(lastMode);
      }

      setMessages(
        restoredMessages.map((m: any) => ({
            id: m.id,
            dbId: m.id,
            role: m.role === "USER" ? "user" : "assistant",
            content: m.content,
            evidenceLevel: m.evidenceLevel ?? undefined,
            mode: m.mode ?? undefined,
            kind: m.kind ?? undefined,
            // Rebuild the source cards so a reopened conversation is
            // just as checkable as it was when first answered.
            // The verification result is not stored, but the audit is a
            // pure function of the answer text and its sources — so it is
            // recomputed here rather than lost on reload.
            ...(() => {
              const restored = (m.citations ?? []).map((c: any) => ({
                section: c.section ?? null,
                text: c.snippet ?? "",
              }));
              if (m.role !== "ASSISTANT" || restored.length === 0) return {};
              const audit = auditCitations(m.content, restored as any);
              return {
                verifiedCitations: audit.verified,
                unverifiedCitations: audit.unverified,
              };
            })(),
            citations: (m.citations ?? []).map((c: any) => ({
              chunkId: c.id,
              sourceTitle: c.legalSource?.title ?? "",
              actName: c.legalSource?.actName ?? null,
              section: c.section ?? null,
              officialUrl: c.legalSource?.officialUrl ?? null,
              verificationStatus:
                c.legalSource?.verificationStatus ?? "UNVERIFIED",
              text: c.snippet ?? "",
            })),
          }))
      );
    } catch {
      toast.error("Could not open that chat.");
    }
  }

  function newChat() {
    if (loading) stopGeneration();
    firDraftRef.current = null;
    setActiveId(null);
    setMessages([]);
    setInput("");
    setEditingId(null);
  }

  async function renameConversation(id: string, title: string) {
    setConversations((list) =>
      list.map((c) => (c.id === id ? { ...c, title } : c))
    );
    try {
      const res = await fetch("/api/conversations/" + id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Could not rename that chat.");
      void loadConversations();
    }
  }

  async function deleteConversation(id: string) {
    const previous = conversations;
    setConversations((list) => list.filter((c) => c.id !== id));
    if (activeIdRef.current === id) newChat();

    try {
      const res = await fetch("/api/conversations/" + id, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Chat deleted.");
    } catch {
      setConversations(previous);
      toast.error("Could not delete that chat.");
    }
  }

  // ---------------- message-level actions ----------------

  function stopGeneration() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setMessages((m) => m.map((x) => ({ ...x, streaming: false })));
  }

  /**
   * Rewinds the saved thread to just before `dbId`, so an edited or
   * regenerated turn replaces the old one instead of stacking under it.
   */
  async function truncateFrom(dbId: string) {
    const conversationId = activeIdRef.current;
    if (!conversationId) return;
    try {
      await fetch(
        "/api/conversations/" + conversationId + "/messages/" + dbId + "?andAfter=1",
        { method: "DELETE" }
      );
    } catch {
      // Non-fatal: the new turn is still appended and shown.
    }
  }

  /** Edit a question and ask it again. */
  async function submitEdit(message: ChatMessage) {
    const text = editDraft.trim();
    if (!text) return;

    const index = messages.findIndex((m) => m.id === message.id);
    setEditingId(null);
    setMessages((m) => (index >= 0 ? m.slice(0, index) : m));
    if (message.dbId) await truncateFrom(message.dbId);
    await runTurn(text);
  }

  /** Ask the same question again for a fresh answer. */
  async function regenerate(assistantMessage: ChatMessage) {
    const index = messages.findIndex((m) => m.id === assistantMessage.id);
    if (index < 1) return;
    const question = messages[index - 1];
    if (question.role !== "user") return;

    // Drop BOTH the question and its answer: runTurn re-adds the
    // question itself, so slicing only the answer would leave the
    // thread showing the same question twice.
    setMessages((m) => m.slice(0, index - 1));

    // Rewind the saved thread to the same point.
    const rewindFrom = question.dbId ?? assistantMessage.dbId;
    if (rewindFrom) await truncateFrom(rewindFrom);

    await runTurn(question.content);
  }

  async function deleteMessage(message: ChatMessage) {
    setMessages((m) => m.filter((x) => x.id !== message.id));
    const conversationId = activeIdRef.current;
    if (!message.dbId || !conversationId) return;
    try {
      await fetch(
        "/api/conversations/" + conversationId + "/messages/" + message.dbId,
        { method: "DELETE" }
      );
    } catch {
      toast.error("Removed here, but it may still be saved.");
    }
  }

  /**
   * Streams the answer over Server-Sent Events.
   *
   * Speed here is perceived, not just measured: retrieval metadata
   * arrives first, then tokens render as they are generated, so the
   * user sees the answer forming instead of staring at a spinner
   * until the whole response is complete.
   */
  function sendMessage() {
    if (!input.trim() || loading) return;
    const question = input.trim();
    setInput("");
    void runTurn(question);
  }

  /**
   * Switches this conversation into FIR mode and carries the facts
   * already established across, so the complaint intake starts from
   * what the user has said rather than from a blank page.
   */
  async function startFirFromConversation() {
    if (loading) return;
    setMode("fir");
    modeRef.current = "fir";
    // A fresh complaint for this thread; the server seeds it from the
    // conversation so nothing already answered is asked again.
    firDraftRef.current = null;
    await runTurn(
      "I would like to turn this into a police complaint. Please use what I have already told you."
    );
  }

  /** Runs one question/answer turn and streams the reply in. */
  async function runTurn(question: string) {
    if (loading) return;

    const turnMode = modeRef.current;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      mode: turnMode,
    };

    // Placeholder the streamed tokens are appended into.
    const replyId = crypto.randomUUID();
    setMessages((m) => [
      ...m,
      userMsg,
      { id: replyId, role: "assistant", content: "", streaming: true, mode: turnMode },
    ]);
    setLoading(true);

    // A fresh controller per turn so "Stop" only cancels this one.
    const controller = new AbortController();
    abortRef.current = controller;

    const patchReply = (patch: Partial<ChatMessage>) =>
      setMessages((m) =>
        m.map((msg) => (msg.id === replyId ? { ...msg, ...patch } : msg))
      );

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        // Sending the id keeps the turn in the thread the user has open.
        body: JSON.stringify({
          content: question,
          language,
          mode: turnMode,
          modelId,
          ...(activeIdRef.current ? { conversationId: activeIdRef.current } : {}),
          ...(turnMode === "fir" && firDraftRef.current
            ? { firDraftId: firDraftRef.current }
            : {}),
        }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => null);
        patchReply({
          content: `⚠️ ${detail?.error?.message ?? "Could not reach the assistant. Please try again."}`,
          streaming: false,
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const lines = frame.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event:"));
          const dataLine = lines.find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.slice(6).trim();
          let payload: any;
          try {
            payload = JSON.parse(dataLine.slice(5).trim());
          } catch {
            continue;
          }

          if (event === "retrieval") {
            // Show the evidence indicator and how much source material
            // was found before any answer text arrives, so the user can
            // see the grounding step actually happening.
            patchReply({
              evidenceLevel: payload.evidenceLevel,
              sourceCount: payload.sourceCount,
            });
          } else if (event === "kind") {
            // Arrives as soon as the server knows whether this turn is a
            // clarifying question or the full report — lets the UI pick
            // the right card before most of the text has even arrived.
            patchReply({ kind: payload.kind });
          } else if (event === "token") {
            answer += payload.delta ?? "";
            patchReply({ content: answer });
          } else if (event === "model") {
            const PROVIDER_NAMES: Record<string, string> = {
              gemini: "Gemini",
              groq: "Groq",
              openrouter: "OpenRouter",
              openai: "OpenAI",
              anthropic: "Claude",
              opencode: "OpenCode",
            };
            const servedBy = PROVIDER_NAMES[payload.servedBy] ?? payload.servedBy;
            toast.info(`${payload.requested} isn't available right now — this answer is from ${servedBy}.`);
          } else if (event === "done") {
            patchReply({
              citations: payload.citations,
              evidenceLevel: payload.evidenceLevel,
              citationWarning: payload.citationWarning ?? null,
              verifiedCitations: payload.verifiedCitations ?? [],
              unverifiedCitations: payload.unverifiedCitations ?? [],
              isDemo: payload.isDemo,
              streaming: false,
              dbId: payload.assistantMessageId,
              // Only the completed draft gets a download button.
              firDraftId: payload.firComplete ? payload.firDraftId : undefined,
            });

            if (payload.firDraftId) firDraftRef.current = payload.firDraftId;

            // Remember the saved ids so this turn can be edited later.
            if (payload.userMessageId) {
              setMessages((m) =>
                m.map((x) =>
                  x.id === userMsg.id ? { ...x, dbId: payload.userMessageId } : x
                )
              );
            }
            if (payload.conversationId && !activeIdRef.current) {
              setActiveId(payload.conversationId);
              activeIdRef.current = payload.conversationId;
            }
            void loadConversations();
          } else if (event === "error") {
            const message = payload.message ?? "Generation failed.";
            patchReply({
              // A reply that broke off part-way must say so — otherwise a
              // half-finished plan reads as if it were the whole answer.
              content: answer
                ? `${answer}\n\n> ⚠️ This answer was cut off before it finished. ${message}`
                : `⚠️ ${message}`,
              streaming: false,
            });
          }
        }
      }

      patchReply({ streaming: false });
    } catch (err) {
      // AbortError means the user pressed Stop, so whatever streamed in
      // stays on screen. Anything else is a real failure worth showing.
      if ((err as any)?.name !== "AbortError") {
        patchReply({
          content:
            "⚠️ The connection dropped before the answer finished. Please try again.",
          streaming: false,
        });
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] w-full gap-0 overflow-hidden rounded-[2.5rem] border border-borderCustom bg-canvas shadow-xl">

      {/* Saved chats. Collapsible so the answer keeps the full width
          when the user is reading rather than browsing. */}
      {historyOpen && (
        <div className="hidden w-72 shrink-0 md:block">
          <ConversationSidebar
            conversations={conversations}
            activeId={activeId}
            loading={historyLoading}
            onSelect={openConversation}
            onNew={newChat}
            onRename={renameConversation}
            onDelete={deleteConversation}
          />
        </div>
      )}

    <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-canvas text-textPrimary transition-colors duration-200 font-sans">
      
      {/* --- SPATIAL COMPUTING CSS ENGINE --- */}
      <style dangerouslySetInnerHTML={{ __html: `
        .spatial-container { perspective: 2000px; transform-style: preserve-3d; }
        
        /* Dynamic Ambient Aurora Background */
        .aurora-bg {
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background: 
            radial-gradient(circle at 15% 50%, rgba(29, 78, 216, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 85% 30%, rgba(16, 185, 129, 0.06) 0%, transparent 50%);
          filter: blur(60px);
          animation: aurora-shift 20s ease-in-out infinite alternate;
          pointer-events: none;
          z-index: 0;
        }
        @keyframes aurora-shift {
          0% { transform: scale(1) translate(0, 0); }
          100% { transform: scale(1.1) translate(-20px, 20px); }
        }

        /* 3D Message Unfold Animation */
        @keyframes unfold3D {
          0% { opacity: 0; transform: translateY(60px) translateZ(-200px) rotateX(-25deg) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) translateZ(0) rotateX(0deg) scale(1); }
        }
        .msg-spatial {
          animation: unfold3D 0.8s cubic-bezier(0.19, 1, 0.22, 1) forwards;
          transform-origin: center bottom;
          will-change: transform, opacity;
        }

        /* --- Structured answer: action table --- */
        .answer-body table {
          width: 100%;
          border-collapse: collapse;
          margin: 1rem 0;
          font-size: 0.875rem;
        }
        .answer-body thead th {
          /* Translucent so it reads correctly in both light and dark. */
          background: rgba(148, 163, 184, 0.14);
          text-align: left;
          font-weight: 600;
          padding: 0.6rem 0.75rem;
          border-bottom: 2px solid currentColor;
          border-bottom-color: rgba(148, 163, 184, 0.35);
          white-space: nowrap;
        }
        .answer-body tbody td {
          padding: 0.6rem 0.75rem;
          border-bottom: 1px solid rgba(148, 163, 184, 0.2);
          vertical-align: top;
        }
        .answer-body tbody tr:last-child td { border-bottom: none; }
        .answer-body tbody td:first-child {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
          width: 2.5rem;
        }
        /* The steps table must scroll on its own, never the page. */
        .answer-body .table-scroll { overflow-x: auto; }
        .answer-body h2 {
          font-size: 1.05rem;
          font-weight: 600;
          margin: 1.5rem 0 0.5rem;
          letter-spacing: -0.01em;
        }
        .answer-body h2:first-child { margin-top: 0; }
        .answer-body ul { margin: 0.5rem 0; }
        .answer-body li { margin: 0.25rem 0; }

        /* Handoff button: a soft pulse to draw the eye without the
           neon-and-gradient look the rest of the app avoids. */
        .fir-handoff {
          background: linear-gradient(135deg, #1d4ed8, #2563eb);
          box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.55);
          animation: fir-pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .fir-handoff:hover { transform: translateY(-1px); }
        @keyframes fir-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.5); }
          70%  { box-shadow: 0 0 0 12px rgba(37, 99, 235, 0); }
          100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fir-handoff { animation: none; }
        }

        /* Blinking caret while tokens are still arriving */
        @keyframes caret-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .stream-caret {
          display: inline-block;
          width: 0.5rem; height: 1.05rem;
          margin-left: 2px;
          vertical-align: text-bottom;
          background: currentColor;
          animation: caret-blink 1s step-end infinite;
        }

        /* Glass Pane (Adaptive Theme) */
        .glass-pane {
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
        }

        /* Scanning Line for Loading */
        @keyframes scan-line {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .scanner::after {
          content: ''; position: absolute; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.8), transparent);
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.6);
          animation: scan-line 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          z-index: 10;
        }

        /* Floating Empty State */
        @keyframes float-complex {
          0%, 100% { transform: translateY(0) rotateX(10deg) rotateY(-10deg); }
          50% { transform: translateY(-15px) rotateX(15deg) rotateY(-5deg); }
        }
        .core-float { animation: float-complex 8s ease-in-out infinite; transform-style: preserve-3d; }
      `}} />

      <div className="aurora-bg"></div>
      
      {/* Grid Overlay */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay z-0 pointer-events-none"></div>

      {/* Top Status Bar */}
      <header className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-8 py-5 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            title={historyOpen ? "Hide saved chats" : "Show saved chats"}
            className="glass-pane hidden md:flex h-9 w-9 items-center justify-center rounded-full border border-borderCustom bg-card/80 text-textSecondary shadow-sm transition-colors hover:text-textPrimary"
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-3 glass-pane bg-card/80 border border-borderCustom rounded-full px-4 py-1.5 shadow-sm">
            <Layers className="h-4 w-4 text-brandBlue" />
            <span className="text-xs font-bold tracking-widest text-textPrimary uppercase">Legal Neural Engine</span>
          </div>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <ModelSelector selectedModelId={modelId} onModelChange={handleModelChange} />

          {/* Text size for the conversation */}
          <div
            className="glass-pane flex items-center gap-0.5 rounded-full border border-borderCustom bg-card/80 px-1.5 py-1 shadow-sm"
            data-no-translate
          >
            <button
              type="button"
              onClick={() => changeZoom(zoom - ZOOM_STEP)}
              disabled={zoom <= ZOOM_MIN}
              title="Make text smaller"
              aria-label="Zoom out"
              className="flex h-7 w-7 items-center justify-center rounded-full text-textSecondary transition-colors hover:bg-canvas hover:text-textPrimary disabled:opacity-30"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => changeZoom(1)}
              title="Reset text size"
              aria-label="Reset zoom"
              className="min-w-[2.75rem] rounded-full px-1 text-[10px] font-mono font-semibold text-textSecondary transition-colors hover:bg-canvas hover:text-textPrimary"
            >
              {Math.round(zoom * 100)}%
            </button>

            <button
              type="button"
              onClick={() => changeZoom(zoom + ZOOM_STEP)}
              disabled={zoom >= ZOOM_MAX}
              title="Make text bigger"
              aria-label="Zoom in"
              className="flex h-7 w-7 items-center justify-center rounded-full text-textSecondary transition-colors hover:bg-canvas hover:text-textPrimary disabled:opacity-30"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="glass-pane flex items-center gap-2 rounded-full border border-borderCustom bg-card/80 px-3 py-1.5 shadow-sm">
            <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
            <span className="text-[10px] font-mono text-textSecondary uppercase">System Ready</span>
          </div>
        </div>
      </header>

      {/* Main Chat Area */}
      <div
        className="spatial-container flex-1 overflow-y-auto px-4 sm:px-12 pt-24 pb-10 z-10 scrollbar-hide"
        // Chat zoom scales the whole conversation, not the chrome.
        style={{ fontSize: `${zoom}rem` }}
      >
        <div className="mx-auto max-w-4xl space-y-10 flex flex-col">
          
          {/* Empty state: shows the real source library and offers
              concrete starting points instead of a blank prompt. */}
          {messages.length === 0 && (
            <ChatEmptyState onPick={(q) => void runTurn(q)} />
          )}

          {/* Render Messages */}
          {messages.map((msg) => (
            <div key={msg.id} className={`msg-spatial flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "user" ? (
                /* User Bubble */
                <div className="group relative max-w-[85%] sm:max-w-[70%]">
                  {editingId === msg.id ? (
                    /* Edit in place, then re-ask. The old answer below is
                       removed so the thread never shows two replies. */
                    <div className="rounded-3xl border border-brandBlue/40 bg-card p-3 shadow-md" data-no-translate>
                      <Textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void submitEdit(msg);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        rows={2}
                        className="min-h-[64px] w-full resize-none border-0 bg-transparent text-[15px] text-textPrimary focus-visible:ring-0"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-textSecondary hover:bg-canvas"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void submitEdit(msg)}
                          disabled={!editDraft.trim()}
                          className="rounded-lg bg-brandBlue px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          Save &amp; resend
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* The user typed this themselves — never rewrite it. */}
                      <div
                        data-no-translate
                        className="relative rounded-3xl rounded-tr-sm bg-brandBlue px-6 py-4 text-[15px] text-white shadow-md font-medium leading-relaxed"
                      >
                        {msg.content}
                      </div>
                      <div className="mt-1 flex justify-end">
                        <MessageActions
                          content={msg.content}
                          onEdit={() => {
                            setEditingId(msg.id);
                            setEditDraft(msg.content);
                          }}
                          onDelete={() => void deleteMessage(msg)}
                        />
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* AI Glass Panel */
                <div className="group relative w-full max-w-[95%] sm:max-w-[85%] perspective-wrapper">
                  <div className="glass-pane bg-card border border-borderCustom rounded-[2rem] rounded-tl-sm p-6 sm:p-10 relative overflow-hidden shadow-sm">
                    
                    {/* Header Metadata */}
                    <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-borderCustom pb-4">
                      <div className="flex items-center gap-1.5">
                        {msg.kind === "question" ? (
                          <MessagesSquare className="h-4 w-4 text-brandBlue" />
                        ) : (
                          <Fingerprint className="h-4 w-4 text-brandBlue" />
                        )}
                        <span className="text-[11px] font-bold text-textSecondary uppercase tracking-widest">
                          {msg.kind === "question"
                            ? `Gathering case details · question ${
                                messages
                                  .slice(0, messages.findIndex((x) => x.id === msg.id) + 1)
                                  .filter(
                                    (x) => x.role === "assistant" && x.kind === "question"
                                  ).length
                              }`
                            : msg.kind === "explainer"
                              ? "Legal explainer"
                              : msg.kind === "answer"
                                ? "Quick answer"
                                : "Verified response"}
                        </span>
                      </div>
                      
                      {msg.isDemo && (
                        <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1 border border-amber-500/30">
                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                          <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 uppercase tracking-widest">Demo Sandbox</span>
                        </div>
                      )}
                      
                      {msg.evidenceLevel && (
                        <div className="ml-auto">
                          <ConfidenceBadge level={msg.evidenceLevel} />
                        </div>
                      )}
                    </div>

                    {/* Rich Text Markdown */}
                    {/* The model already writes this answer in the user's
                        chosen language, so the runtime DOM translator
                        must not translate it a second time. */}
                    <div
                      // Normally the model already wrote this in the
                      // chosen language, so a second pass would only
                      // hurt. If it plainly did not, let the runtime
                      // translator step in rather than show English.
                      {...(looksUntranslated(msg.content, language)
                        ? {}
                        : { "data-no-translate": true })}
                      className="answer-body prose dark:prose-invert prose-slate max-w-none text-textPrimary prose-headings:font-serif prose-headings:font-light prose-headings:text-textPrimary prose-a:text-brandBlue prose-a:no-underline hover:prose-a:underline prose-strong:text-textPrimary prose-strong:font-semibold leading-relaxed"
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          // Wide step tables scroll inside their own
                          // container so the chat never scrolls sideways.
                          table: ({ node, ...props }) => (
                            <div className="table-scroll">
                              <table {...props} />
                            </div>
                          ),
                          // A fenced ```mermaid block becomes an actual
                          // diagram, not a text dump of Mermaid syntax —
                          // this is the flowchart in "Case Analysis" reports.
                          // `pre` is overridden to a no-op wrapper so the
                          // diagram/code isn't double-wrapped in <pre>.
                          pre: ({ children }) => <>{children}</>,
                          code: ({ className, children, ...props }: any) => {
                            const lang = /language-(\w+)/.exec(className || "")?.[1];
                            const text = String(children).replace(/\n$/, "");

                            if (lang === "mermaid") {
                              // While tokens are still arriving the fence is
                              // only half written — rendering it then is what
                              // produced Mermaid's error graphics.
                              return (
                                <MermaidDiagram
                                  code={text}
                                  enabled={!msg.streaming}
                                />
                              );
                            }
                            if (lang) {
                              return (
                                <pre className="my-3 overflow-x-auto rounded-lg bg-canvas p-3 text-xs">
                                  <code {...props}>{text}</code>
                                </pre>
                              );
                            }
                            return (
                              <code className={className} {...props}>
                                {children}
                              </code>
                            );
                          },
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                      {msg.streaming && <span className="stream-caret" />}
                    </div>

                    {/* Live grounding status while the answer streams. */}
                    {msg.streaming && typeof msg.sourceCount === "number" && (
                      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-textSecondary">
                        <BookOpen className="h-3 w-3 text-emerald-500" />
                        {msg.sourceCount > 0
                          ? `Read ${msg.sourceCount} section${msg.sourceCount === 1 ? "" : "s"} from the law library — writing your answer…`
                          : "No matching section found — answering with general guidance only."}
                      </p>
                    )}

                    {/* Citation verification result. Reports BOTH outcomes:
                        every citation traced to a source, or one the corpus
                        could not support. A general chatbot can do neither. */}
                    {!msg.streaming && msg.content && msg.kind !== "question" && (
                      <AnswerTrustPanel
                        verified={msg.verifiedCitations}
                        unverified={msg.unverifiedCitations}
                        warning={msg.citationWarning}
                        sourceCount={msg.citations?.length ?? 0}
                        actsSearched={Array.from(
                          new Set(
                            (msg.citations ?? [])
                              .map((c: any) => c.actName ?? c.sourceTitle)
                              .filter(Boolean)
                          )
                        ) as string[]}
                      />
                    )}

                    {/* Case Analysis is still gathering facts — let the
                        user bail out to the report at any point rather
                        than feel interrogated. */}
                    {!msg.streaming && msg.kind === "question" && (
                      <button
                        type="button"
                        onClick={() =>
                          void runTurn(
                            "Please stop asking questions and analyze my case now with whatever information I have already given."
                          )
                        }
                        className="mt-4 flex items-center gap-1.5 rounded-lg border border-borderCustom bg-canvas px-3 py-1.5 text-xs font-semibold text-textSecondary transition-colors hover:border-brandBlue/40 hover:text-brandBlue"
                      >
                        <SkipForward className="h-3.5 w-3.5" />
                        Skip questions — analyze with what I have
                      </button>
                    )}

                    {/* The finished complaint draft — offer the PDF. */}
                    {msg.firDraftId && !msg.streaming && (
                      <div className="mt-5 rounded-xl border border-borderCustom bg-canvas p-4">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-brandBlue" />
                          <p className="text-sm font-semibold text-textPrimary">
                            Your complaint draft is ready
                          </p>
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-textSecondary">
                          Check every name, date, amount and location before you
                          submit it. This is a draft, not an official FIR — the
                          police decide whether an FIR is registered and which
                          provisions apply.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <a
                            href={`/api/fir/${msg.firDraftId}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-brandBlue px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download PDF
                          </a>
                          <a
                            href={`/api/fir/${msg.firDraftId}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-borderCustom px-3 py-2 text-xs font-semibold text-textPrimary transition-colors hover:border-brandBlue/40"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Preview / print
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Hand off to the FIR tab. Shown once an answer is
                        complete and the thread is not already an FIR one,
                        so the user can turn the situation they just
                        described into a complaint without retelling it. */}
                    {!msg.streaming &&
                      msg.content &&
                      !msg.firDraftId &&
                      (msg.kind === "report" || msg.kind === "answer") &&
                      msg.mode !== "fir" && (
                        <div className="mt-5">
                          <button
                            type="button"
                            onClick={() => void startFirFromConversation()}
                            disabled={loading}
                            className="fir-handoff group relative flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-transform disabled:opacity-60 sm:w-auto"
                          >
                            <FileText className="h-4 w-4" />
                            Generate a police complaint from this
                          </button>
                          <p className="mt-1.5 text-[11px] text-textSecondary">
                            Uses what you have already told me — you will only be
                            asked for anything still missing.
                          </p>
                        </div>
                      )}

                    {/* Copy / regenerate / delete for this answer */}
                    {!msg.streaming && msg.content && (
                      <div className="mt-4 flex justify-end border-t border-borderCustom pt-3">
                        <MessageActions
                          content={msg.content}
                          onRegenerate={() => void regenerate(msg)}
                          onDelete={() => void deleteMessage(msg)}
                        />
                      </div>
                    )}

                    {/* Grounded Citations Vault */}
                    {msg.kind !== "question" && msg.citations && msg.citations.length > 0 && (
                      <div className="mt-10 rounded-2xl bg-canvas p-5 border border-borderCustom">
                        <div className="mb-4 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-emerald-500" />
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                            Official sources used — read the law yourself
                          </span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {msg.citations.map((c: any) => (
                            <CitationCard key={c.chunkId} citation={c} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Advanced Processing State */}
          {loading && (
            <div className="msg-spatial flex justify-start w-full max-w-[85%]">
              <div className="glass-pane bg-card border border-borderCustom scanner relative rounded-2xl rounded-tl-sm px-8 py-6 flex items-center gap-5 overflow-hidden shadow-sm">
                <Loader2 className="h-6 w-6 text-brandBlue animate-spin" />
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-bold text-textPrimary tracking-wide">Synthesizing Legal Context</span>
                  <span className="text-[11px] font-mono text-textSecondary uppercase">Querying vector space database...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} className="h-10" />
        </div>
      </div>

      {/* Composer — a normal flex child pinned to the bottom of the
          column, so it never floats over the conversation. */}
      <div className="relative z-40 shrink-0 border-t border-borderCustom bg-canvas/80 px-4 pb-3 pt-3 backdrop-blur-xl sm:px-12">
        <div className="mx-auto max-w-4xl">

          {/* Mode switcher — the three distinct ways to talk to
              LegalSetu. Case Analysis is the flagship default. */}
          <div className="mb-1 flex justify-center">
            <ModeSelector mode={mode} onChange={setMode} disabled={loading} />
          </div>

          <div className="bg-card/90 backdrop-blur-xl border border-borderCustom rounded-[2rem] p-2 transition-all duration-300 shadow-lg focus-within:ring-2 focus-within:ring-brandBlue/30">
            <div className="flex items-end gap-3 rounded-[1.5rem] bg-canvas px-5 py-4 border border-borderCustom">
              
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={
                  mode === "case"
                    ? "Describe what happened, in your own words..."
                    : mode === "quick"
                      ? "Ask your legal question for an immediate answer..."
                      : mode === "fir"
                        ? "Describe the incident you want to report..."
                        : "Ask about any law, Act, or right..."
                }
                rows={1}
                className="max-h-[160px] min-h-[48px] flex-1 resize-none border-0 bg-transparent py-3 text-lg text-textPrimary placeholder:text-textSecondary focus-visible:ring-0 shadow-none scrollbar-hide font-medium"
              />
              
              <div className="flex shrink-0 items-center gap-3 pb-1">
                <div className="text-textSecondary hover:text-textPrimary transition-colors">
                  <MicButton onTranscript={(text) => setInput((prev) => (prev ? prev + " " + text : text))} />
                </div>

                {/* Hands-free conversation — same pipeline, spoken. */}
                <Button
                  onClick={() => setVoiceOpen(true)}
                  disabled={loading}
                  title="Start voice mode — talk instead of typing"
                  aria-label="Start voice mode"
                  variant="outline"
                  className="hidden h-12 items-center gap-2 rounded-2xl border-brandBlue/30 bg-brandBlue/10 px-4 text-sm font-semibold text-brandBlue transition-all hover:scale-105 hover:bg-brandBlue/20 disabled:opacity-40 sm:flex"
                >
                  <AudioLines className="h-4 w-4" />
                  Voice
                </Button>
                <Button
                  onClick={() => setVoiceOpen(true)}
                  disabled={loading}
                  aria-label="Start voice mode"
                  className="h-12 w-12 rounded-2xl bg-brandBlue/10 text-brandBlue shadow-none transition-all hover:scale-105 hover:bg-brandBlue/20 disabled:opacity-40 sm:hidden"
                  size="icon"
                >
                  <AudioLines className="h-5 w-5" />
                </Button>

                {loading ? (
                  /* Stop replaces Send while tokens are arriving —
                     whatever has already streamed in is kept. */
                  <Button
                    onClick={stopGeneration}
                    title="Stop generating"
                    className="h-12 w-12 rounded-2xl bg-rose-600 text-white shadow-md transition-all duration-200 hover:bg-rose-600/90 hover:scale-105"
                    size="icon"
                  >
                    <Square className="h-4 w-4 fill-current" />
                  </Button>
                ) : (
                  <Button
                    onClick={sendMessage}
                    disabled={!input.trim()}
                    className="h-12 w-12 rounded-2xl bg-brandBlue text-white hover:bg-brandBlue/90 hover:scale-105 transition-all duration-200 disabled:opacity-30 disabled:hover:scale-100 shadow-md"
                    size="icon"
                  >
                    <Send className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <VoiceMode
      open={voiceOpen}
      onClose={() => setVoiceOpen(false)}
      language={language}
      mode={mode}
      modelId={modelId}
      conversationId={activeId}
      onTurn={addVoiceTurn}
    />
    </div>
  );
}