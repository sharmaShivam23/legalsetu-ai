"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Folder, Plus, Search, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { CaseCard, type CaseListItem } from "@/components/cases/case-card";
import { NewCaseDialog } from "@/components/cases/new-case-dialog";
import { STATUS_META } from "@/components/cases/status-badge";

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "OPEN", label: STATUS_META.OPEN.label },
  { key: "IN_PROGRESS", label: STATUS_META.IN_PROGRESS.label },
  { key: "ESCALATED", label: STATUS_META.ESCALATED.label },
  { key: "RESOLVED", label: STATUS_META.RESOLVED.label },
  { key: "CLOSED", label: STATUS_META.CLOSED.label },
] as const;

function CaseCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-borderCustom bg-card p-5">
      <div className="h-4 w-2/3 rounded bg-canvas" />
      <div className="mt-2 h-3 w-full rounded bg-canvas" />
      <div className="mt-4 h-3 w-1/3 rounded bg-canvas" />
    </div>
  );
}

export default function CasesPage() {
  const router = useRouter();
  const [cases, setCases] = useState<CaseListItem[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("ALL");
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/cases");
      const json = await res.json();
      setCases(json.success ? json.data.cases : []);
    } catch {
      setCases([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!cases) return null;
    return cases.filter((c) => {
      if (filter !== "ALL" && c.status !== filter) return false;
      if (query.trim() && !c.title.toLowerCase().includes(query.trim().toLowerCase())) return false;
      return true;
    });
  }, [cases, filter, query]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: cases?.length ?? 0 };
    for (const c of cases ?? []) map[c.status] = (map[c.status] ?? 0) + 1;
    return map;
  }, [cases]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 text-textPrimary sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-textPrimary">My Cases</h1>
          <p className="mt-1 text-sm text-textSecondary">
            Every chat, document and complaint draft about one matter, kept together.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-brandBlue px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New case
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors " +
                (filter === f.key
                  ? "border-brandBlue bg-brandBlue text-white"
                  : "border-borderCustom bg-card text-textSecondary hover:text-textPrimary")
              }
            >
              {f.label}
              {counts[f.key] ? <span className="ml-1 opacity-70">{counts[f.key]}</span> : null}
            </button>
          ))}
        </div>

        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-textSecondary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cases…"
            className="w-full rounded-xl border border-borderCustom bg-card py-2 pl-8 pr-3 text-sm text-textPrimary outline-none focus:border-brandBlue"
          />
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {filtered === null &&
          Array.from({ length: 4 }).map((_, i) => <CaseCardSkeleton key={i} />)}

        {filtered !== null && filtered.length === 0 && (cases?.length ?? 0) === 0 && (
          <div className="col-span-full rounded-2xl border border-borderCustom bg-card p-10 text-center">
            <Folder className="mx-auto h-8 w-8 text-textSecondary opacity-50" />
            <p className="mt-3 text-sm font-medium text-textPrimary">No cases yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-textSecondary">
              A case keeps every chat, document and complaint draft about one
              matter together, so you never lose track of where things stand.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-brandBlue px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                Create your first case
              </button>
              <Link
                href="/dashboard/chat"
                className="flex items-center gap-1.5 rounded-xl border border-borderCustom px-4 py-2 text-xs font-semibold text-textPrimary hover:bg-canvas"
              >
                <MessagesSquare className="h-3.5 w-3.5" />
                Or start by asking LegalSetu
              </Link>
            </div>
          </div>
        )}

        {filtered !== null && filtered.length === 0 && (cases?.length ?? 0) > 0 && (
          <div className="col-span-full rounded-2xl border border-borderCustom bg-card p-8 text-center text-sm text-textSecondary">
            No cases match this filter.
          </div>
        )}

        {filtered?.map((c) => (
          <CaseCard key={c.id} item={c} />
        ))}
      </div>

      <NewCaseDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(id) => {
          setDialogOpen(false);
          router.push(`/dashboard/cases/${id}`);
        }}
      />
    </div>
  );
}
