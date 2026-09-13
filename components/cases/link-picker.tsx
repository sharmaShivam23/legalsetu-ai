"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Loader2, MessagesSquare, FileText, FileSignature, Link2 } from "lucide-react";

interface Linkable {
  conversations: { id: string; title: string; updatedAt: string }[];
  documents: { id: string; title: string; fileType: string; createdAt: string }[];
  firDrafts: { id: string; incidentType: string | null; status: string; updatedAt: string }[];
}

export function LinkPicker({
  caseId,
  open,
  onClose,
  onLinked,
}: {
  caseId: string;
  open: boolean;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [data, setData] = useState<Linkable | null>(null);
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setData(null);
    fetch("/api/cases/linkable")
      .then((r) => r.json())
      .then((json) => setData(json.success ? json.data : { conversations: [], documents: [], firDrafts: [] }))
      .catch(() => setData({ conversations: [], documents: [], firDrafts: [] }));
  }, [open]);

  if (!open) return null;

  async function link(kind: "conversation" | "document" | "firDraft", recordId: string) {
    setLinking(recordId);
    try {
      const res = await fetch(`/api/cases/${caseId}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, recordId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      toast.success("Linked to this case.");
      onLinked();
      setData((d) =>
        d
          ? {
              conversations: kind === "conversation" ? d.conversations.filter((c) => c.id !== recordId) : d.conversations,
              documents: kind === "document" ? d.documents.filter((c) => c.id !== recordId) : d.documents,
              firDrafts: kind === "firDraft" ? d.firDrafts.filter((c) => c.id !== recordId) : d.firDrafts,
            }
          : d
      );
    } catch (err: any) {
      toast.error(err?.message ?? "Could not link that item.");
    } finally {
      setLinking(null);
    }
  }

  const nothingToShow =
    data && data.conversations.length === 0 && data.documents.length === 0 && data.firDrafts.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl border border-borderCustom bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borderCustom p-4">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-brandBlue" />
            <h3 className="text-sm font-semibold text-textPrimary">Link existing items</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-textSecondary hover:bg-canvas">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {!data && (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-textSecondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}

          {nothingToShow && (
            <p className="py-10 text-center text-xs text-textSecondary">
              Nothing unlinked to add — everything you have is already in a case.
            </p>
          )}

          {data && data.conversations.length > 0 && (
            <Section title="Chats" icon={MessagesSquare}>
              {data.conversations.map((c) => (
                <Row
                  key={c.id}
                  label={c.title}
                  meta={new Date(c.updatedAt).toLocaleDateString()}
                  busy={linking === c.id}
                  onLink={() => void link("conversation", c.id)}
                />
              ))}
            </Section>
          )}

          {data && data.documents.length > 0 && (
            <Section title="Documents" icon={FileText}>
              {data.documents.map((d) => (
                <Row
                  key={d.id}
                  label={d.title}
                  meta={d.fileType}
                  busy={linking === d.id}
                  onLink={() => void link("document", d.id)}
                />
              ))}
            </Section>
          )}

          {data && data.firDrafts.length > 0 && (
            <Section title="FIR / complaint drafts" icon={FileSignature}>
              {data.firDrafts.map((f) => (
                <Row
                  key={f.id}
                  label={f.incidentType ?? "Untitled draft"}
                  meta={f.status}
                  busy={linking === f.id}
                  onLink={() => void link("firDraft", f.id)}
                />
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof MessagesSquare;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary">
        <Icon className="h-3 w-3" />
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  meta,
  busy,
  onLink,
}: {
  label: string;
  meta: string;
  busy: boolean;
  onLink: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-borderCustom bg-canvas px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-textPrimary" data-no-translate>
          {label}
        </p>
        <p className="text-[10px] text-textSecondary">{meta}</p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onLink}
        className="shrink-0 rounded-lg border border-borderCustom bg-card px-2.5 py-1 text-[11px] font-semibold text-textPrimary hover:border-brandBlue/50 hover:text-brandBlue disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Link"}
      </button>
    </div>
  );
}
