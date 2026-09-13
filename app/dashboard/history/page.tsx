"use client";

// ==========================================================
// LegalSetu — Chat history
// ----------------------------------------------------------
// A full-page view of every saved conversation, for finding an
// older thread than the chat sidebar comfortably shows. Beyond
// listing threads, this also gives the account a shape: how much
// you've used LegalSetu and in which mode, at a glance.
// Opening a thread hands off to /dashboard/chat, which loads it.
// ==========================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  History,
  Trash2,
  Loader2,
  X,
  Search,
  Sparkles,
  Gavel,
  BookOpenText,
  FileSignature,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { TiltCard } from "@/components/ui/tilt-card";

interface ConversationRow {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
  mode: string;
}

interface Stats {
  totalConversations: number;
  totalMessages: number;
  modeBreakdown: Record<string, number>;
}

const MODES = [
  { key: "quick", label: "Quick Answer", icon: Sparkles, chip: "bg-brandBlue/10 text-brandBlue border-brandBlue/30" },
  { key: "case", label: "Case Analysis", icon: Gavel, chip: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30" },
  { key: "knowledge", label: "Know the Law", icon: BookOpenText, chip: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30" },
  { key: "fir", label: "Generate FIR", icon: FileSignature, chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" },
] as const;

function modeMeta(key: string) {
  return MODES.find((m) => m.key === key) ?? MODES[0];
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;

  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function HistoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [modeFilter, setModeFilter] = useState<string>("ALL");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/conversations?limit=100")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((json) => {
        if (cancelled) return;
        setRows(json?.data?.conversations ?? []);
        setStats(json?.data?.stats ?? null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (modeFilter !== "ALL" && r.mode !== modeFilter) return false;
      if (query.trim() && !r.title.toLowerCase().includes(query.trim().toLowerCase()) && !r.preview.toLowerCase().includes(query.trim().toLowerCase())) return false;
      return true;
    });
  }, [rows, modeFilter, query]);

  async function remove(id: string) {
    const previous = rows;
    setRows((list) => list.filter((r) => r.id !== id));
    setConfirmId(null);

    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Chat deleted.");
    } catch {
      setRows(previous);
      toast.error("Could not delete that chat.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-textPrimary sm:px-6 sm:py-12">
      <h1 className="font-serif text-2xl font-semibold text-textPrimary">History</h1>
      <p className="mt-1 text-sm text-textSecondary">Every conversation you've had with LegalSetu, in one place.</p>

      {stats && stats.totalConversations > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TiltCard maxTilt={6} className="rounded-2xl">
            <div className="rounded-2xl border border-borderCustom bg-gradient-to-br from-brandBlue/10 to-transparent p-4">
              <p className="text-2xl font-bold text-textPrimary">{stats.totalConversations}</p>
              <p className="text-[11px] font-medium text-textSecondary">Conversations</p>
            </div>
          </TiltCard>
          <TiltCard maxTilt={6} className="rounded-2xl">
            <div className="rounded-2xl border border-borderCustom bg-gradient-to-br from-brandBlue/10 to-transparent p-4">
              <p className="text-2xl font-bold text-textPrimary">{stats.totalMessages}</p>
              <p className="text-[11px] font-medium text-textSecondary">Messages exchanged</p>
            </div>
          </TiltCard>
          {MODES.slice(0, 2).map((m) => (
            <TiltCard key={m.key} maxTilt={6} className="rounded-2xl">
              <div className="flex items-center gap-2 rounded-2xl border border-borderCustom bg-card p-4">
                <m.icon className="h-4 w-4 text-textSecondary" />
                <div>
                  <p className="text-lg font-bold text-textPrimary">{stats.modeBreakdown[m.key] ?? 0}</p>
                  <p className="text-[10px] font-medium text-textSecondary">{m.label}</p>
                </div>
              </div>
            </TiltCard>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setModeFilter("ALL")}
              className={
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors " +
                (modeFilter === "ALL"
                  ? "border-brandBlue bg-brandBlue text-white"
                  : "border-borderCustom bg-card text-textSecondary hover:text-textPrimary")
              }
            >
              All
            </button>
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setModeFilter(m.key)}
                className={
                  "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors " +
                  (modeFilter === m.key
                    ? "border-brandBlue bg-brandBlue text-white"
                    : "border-borderCustom bg-card text-textSecondary hover:text-textPrimary")
                }
              >
                <m.icon className="h-3 w-3" />
                {m.label}
              </button>
            ))}
          </div>
          <div className="relative sm:w-56">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-textSecondary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search history…"
              className="w-full rounded-xl border border-borderCustom bg-card py-2 pl-8 pr-3 text-sm text-textPrimary outline-none focus:border-brandBlue"
            />
          </div>
        </div>
      )}

      {loading && (
        <div className="mt-10 flex items-center justify-center gap-2 text-textSecondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading your chats…</span>
        </div>
      )}

      {!loading && failed && (
        <Card className="mt-8 border-borderCustom bg-card shadow-sm">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <History className="h-8 w-8 text-textSecondary opacity-40" />
            <p className="text-sm font-medium text-textPrimary">
              Your history could not be loaded right now.
            </p>
            <p className="text-xs text-textSecondary">
              The database may be unreachable. Try again in a moment.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && !failed && rows.length === 0 && (
        <Card className="mt-8 border-borderCustom bg-card shadow-sm">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <History className="h-8 w-8 text-textSecondary opacity-40" />
            <p className="text-sm font-medium text-textPrimary">
              No saved conversations yet.
            </p>
            <Link
              href="/dashboard/chat"
              className="mt-2 rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Ask your first question
            </Link>
          </CardContent>
        </Card>
      )}

      {!loading && !failed && rows.length > 0 && filtered.length === 0 && (
        <div className="mt-8 rounded-2xl border border-borderCustom bg-card p-8 text-center text-sm text-textSecondary">
          No chats match this filter.
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <ul className="mt-6 space-y-2">
          {filtered.map((row) => {
            const meta = modeMeta(row.mode);
            const Icon = meta.icon;
            return (
              <li key={row.id}>
                <div className="group flex items-start gap-3 rounded-xl border border-borderCustom bg-card p-4 transition-colors hover:border-brandBlue/30">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${meta.chip}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>

                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/chat?c=${row.id}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-medium text-textPrimary">
                      {row.title}
                    </p>
                    {row.preview && (
                      <p className="mt-0.5 truncate text-xs text-textSecondary">
                        {row.preview}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-textSecondary">
                      {row.messageCount} message{row.messageCount === 1 ? "" : "s"}
                      {" · "}
                      {formatWhen(row.updatedAt)}
                    </p>
                  </button>

                  {confirmId === row.id ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void remove(row.id)}
                        className="rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-600 hover:bg-rose-500/10"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="rounded-lg p-1 text-textSecondary hover:bg-canvas"
                        title="Keep this chat"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(row.id)}
                      className="shrink-0 rounded-lg p-1.5 text-textSecondary opacity-0 transition-opacity hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100 focus:opacity-100"
                      title="Delete chat"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
