"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BookMarked,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  ShieldCheck,
  Trash2,
  Pencil,
  Check,
  Search,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TiltCard } from "@/components/ui/tilt-card";

interface SourceRow {
  id: string;
  title: string;
  actName: string | null;
  jurisdiction: string;
  verificationStatus: string;
  officialUrl: string | null;
}

interface SavedRow {
  id: string;
  legalSourceId: string;
  section: string | null;
  note: string | null;
  sectionText: string | null;
  createdAt: string;
  legalSource: {
    id: string;
    title: string;
    actName: string | null;
    jurisdiction: string;
    officialUrl: string | null;
    verificationStatus: string;
  };
}

export default function SourcesPage() {
  const [tab, setTab] = useState<"saved" | "browse">("saved");
  const [sources, setSources] = useState<SourceRow[] | null>(null);
  const [saved, setSaved] = useState<SavedRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  function loadSaved() {
    fetch("/api/saved-sources")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setSaved(json?.data?.saved ?? []))
      .catch(() => setSaved([]));
  }

  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then((data) => setSources(data.success ? data.data.sources : []))
      .catch(() => setSources([]));
    loadSaved();
  }, []);

  const savedSourceIds = useMemo(() => new Set(saved?.map((s) => s.legalSourceId) ?? []), [saved]);

  const filteredBrowse = useMemo(() => {
    if (!sources) return null;
    if (!query.trim()) return sources;
    const q = query.trim().toLowerCase();
    return sources.filter((s) => (s.actName ?? s.title).toLowerCase().includes(q) || s.jurisdiction.toLowerCase().includes(q));
  }, [sources, query]);

  async function toggleSave(source: SourceRow) {
    const already = savedSourceIds.has(source.id);
    if (already) {
      const row = saved?.find((s) => s.legalSourceId === source.id && !s.section);
      if (!row) return;
      setSaved((list) => list?.filter((s) => s.id !== row.id) ?? []);
      try {
        await fetch("/api/saved-sources", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: row.id }),
        });
        toast.success("Removed from saved sources.");
      } catch {
        toast.error("Could not remove. Please try again.");
        loadSaved();
      }
      return;
    }
    try {
      const res = await fetch("/api/saved-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legalSourceId: source.id }),
      });
      if (!res.ok) throw new Error();
      toast.success("Saved for quick access.");
      loadSaved();
    } catch {
      toast.error("Could not save that source.");
    }
  }

  async function removeSaved(id: string) {
    const previous = saved;
    setSaved((list) => list?.filter((s) => s.id !== id) ?? []);
    try {
      const res = await fetch("/api/saved-sources", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      toast.success("Removed.");
    } catch {
      setSaved(previous);
      toast.error("Could not remove that.");
    }
  }

  async function saveNote(row: SavedRow) {
    try {
      const res = await fetch("/api/saved-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legalSourceId: row.legalSourceId, section: row.section ?? undefined, note: noteDraft.trim() || undefined }),
      });
      if (!res.ok) throw new Error();
      setEditingNote(null);
      toast.success("Note saved.");
      loadSaved();
    } catch {
      toast.error("Could not save your note.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-textPrimary sm:px-6 sm:py-12">
      <h1 className="font-serif text-2xl font-semibold text-textPrimary">Saved Sources</h1>
      <p className="mt-1 text-sm text-textSecondary">
        Bookmark the laws you refer to often, with the actual verified text kept alongside your own notes.
      </p>

      <div className="mt-6 flex gap-1.5 rounded-xl border border-borderCustom bg-canvas p-1">
        <button
          type="button"
          onClick={() => setTab("saved")}
          className={
            "flex-1 rounded-lg py-2 text-xs font-semibold transition-colors " +
            (tab === "saved" ? "bg-card text-brandBlue shadow-sm" : "text-textSecondary hover:text-textPrimary")
          }
        >
          My Saved {saved && saved.length > 0 ? `(${saved.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setTab("browse")}
          className={
            "flex-1 rounded-lg py-2 text-xs font-semibold transition-colors " +
            (tab === "browse" ? "bg-card text-brandBlue shadow-sm" : "text-textSecondary hover:text-textPrimary")
          }
        >
          Browse Law Library
        </button>
      </div>

      {tab === "saved" && (
        <div className="mt-6 space-y-3">
          {saved === null && <p className="text-sm text-textSecondary">Loading…</p>}

          {saved !== null && saved.length === 0 && (
            <Card className="bg-card border-borderCustom shadow-sm">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <BookMarked className="h-8 w-8 text-textSecondary opacity-40" />
                <p className="text-sm font-medium text-textPrimary">Nothing saved yet.</p>
                <p className="max-w-md text-xs text-textSecondary">
                  Browse the law library and bookmark the acts you come back to often.
                </p>
                <button
                  type="button"
                  onClick={() => setTab("browse")}
                  className="mt-2 rounded-lg bg-brandBlue px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
                >
                  Browse the library
                </button>
              </CardContent>
            </Card>
          )}

          {saved?.map((row) => (
            <TiltCard key={row.id} maxTilt={4} className="rounded-2xl">
              <div className="rounded-2xl border border-borderCustom bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-textPrimary">
                      {row.legalSource.actName ?? row.legalSource.title}
                      {row.section && <span className="ml-1.5 font-normal text-textSecondary">· Section {row.section}</span>}
                    </p>
                    <p className="text-xs text-textSecondary">{row.legalSource.jurisdiction}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {row.legalSource.officialUrl && (
                      <a
                        href={row.legalSource.officialUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md p-1.5 text-textSecondary hover:bg-canvas hover:text-textPrimary"
                        title="Open official source"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => removeSaved(row.id)}
                      className="rounded-md p-1.5 text-textSecondary hover:bg-rose-500/10 hover:text-rose-500"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {row.sectionText && (
                  <div className="mt-3 rounded-lg border border-borderCustom bg-canvas p-3">
                    <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-brandBlue">
                      <ShieldCheck className="h-3 w-3" />
                      Verified text
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-textPrimary" data-no-translate>
                      {row.sectionText}
                    </p>
                  </div>
                )}

                {editingNote === row.id ? (
                  <div className="mt-3 flex items-start gap-2">
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      rows={2}
                      placeholder="Add a personal note…"
                      className="flex-1 resize-none rounded-lg border border-borderCustom bg-canvas px-2.5 py-1.5 text-xs text-textPrimary outline-none focus:border-brandBlue"
                    />
                    <button
                      type="button"
                      onClick={() => saveNote(row)}
                      className="mt-0.5 rounded-md bg-brandBlue p-1.5 text-white hover:opacity-90"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : row.note ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingNote(row.id);
                      setNoteDraft(row.note ?? "");
                    }}
                    className="mt-3 flex w-full items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-left text-xs text-amber-800 dark:text-amber-300"
                  >
                    <Pencil className="mt-0.5 h-3 w-3 shrink-0" />
                    {row.note}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingNote(row.id);
                      setNoteDraft("");
                    }}
                    className="mt-3 flex items-center gap-1 text-[11px] font-medium text-textSecondary hover:text-brandBlue"
                  >
                    <Pencil className="h-3 w-3" />
                    Add a note
                  </button>
                )}
              </div>
            </TiltCard>
          ))}
        </div>
      )}

      {tab === "browse" && (
        <div className="mt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-textSecondary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the library…"
              className="w-full rounded-xl border border-borderCustom bg-card py-2 pl-8 pr-3 text-sm text-textPrimary outline-none focus:border-brandBlue"
            />
          </div>

          <div className="mt-4 space-y-3">
            {filteredBrowse === null && <p className="text-sm text-textSecondary">Loading sources...</p>}

            {filteredBrowse !== null && filteredBrowse.length === 0 && (
              <Card className="bg-card border-borderCustom shadow-sm">
                <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                  <BookMarked className="h-8 w-8 text-textSecondary opacity-40" />
                  <p className="text-sm font-medium text-textPrimary">No sources match.</p>
                </CardContent>
              </Card>
            )}

            {filteredBrowse?.map((s) => {
              const isSaved = savedSourceIds.has(s.id);
              return (
                <Card key={s.id} className="bg-card border-borderCustom shadow-sm hover:border-brandBlue/40 transition-colors">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-textPrimary">{s.actName ?? s.title}</p>
                      <p className="text-xs text-textSecondary">{s.jurisdiction}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge className="border border-borderCustom bg-canvas text-textPrimary shadow-none">
                        {s.verificationStatus}
                      </Badge>
                      {s.officialUrl && (
                        <a
                          href={s.officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-textSecondary hover:text-textPrimary transition-colors"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleSave(s)}
                        className={
                          "rounded-md p-1.5 transition-colors " +
                          (isSaved ? "text-brandBlue hover:bg-brandBlue/10" : "text-textSecondary hover:bg-canvas hover:text-textPrimary")
                        }
                        title={isSaved ? "Remove from saved" : "Save for quick access"}
                      >
                        {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
