"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  Check,
  MapPin,
  Trash2,
  Loader2,
  Link2,
  MessagesSquare,
  FileText,
  FileSignature,
  Unlink,
  Download,
} from "lucide-react";
import { STATUS_META } from "@/components/cases/status-badge";
import { NextActionCard } from "@/components/cases/next-action-card";
import { LinkPicker } from "@/components/cases/link-picker";
import { ActivityTimeline } from "@/components/cases/activity-timeline";

interface CaseDetail {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  jurisdiction: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  createdAt: string;
  updatedAt: string;
  conversations: { id: string; title: string; updatedAt: string; createdAt: string; _count: { messages: number } }[];
  documents: { id: string; title: string; fileType: string; status: string; createdAt: string }[];
  firDrafts: {
    id: string;
    status: string;
    incidentType: string | null;
    draftVersion: number;
    hasGeneratedDraft: boolean;
    createdAt: string;
    updatedAt: string;
  }[];
}

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "ESCALATED", "RESOLVED", "CLOSED"] as const;

export default function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [data, setData] = useState<CaseDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingJurisdiction, setEditingJurisdiction] = useState(false);
  const [jurisdictionDraft, setJurisdictionDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      const res = await fetch(`/api/cases/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      const json = await res.json();
      if (json.success) setData(json.data.case);
    } catch {
      setNotFound(true);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/cases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message);
    setData((d) => (d ? { ...d, ...json.data.case } : d));
  }

  async function unlink(kind: "conversation" | "document" | "firDraft", recordId: string) {
    try {
      const res = await fetch(`/api/cases/${id}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, recordId, unlink: true }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      toast.success("Removed from this case.");
      void load();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not remove that link.");
    }
  }

  async function deleteCase() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/cases/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      toast.success("Case deleted. Your chats and documents were kept.");
      router.push("/dashboard/cases");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not delete the case.");
      setDeleting(false);
    }
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-sm text-textSecondary">This case could not be found.</p>
        <Link href="/dashboard/cases" className="mt-3 inline-block text-sm font-semibold text-brandBlue">
          Back to My Cases
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-7 w-1/2 rounded bg-canvas" />
          <div className="h-24 rounded-2xl bg-canvas" />
          <div className="h-40 rounded-2xl bg-canvas" />
        </div>
      </div>
    );
  }

  const timelineEntries = [
    { id: "created", type: "created" as const, label: `Case opened${data.jurisdiction ? ` — ${data.jurisdiction}` : ""}`, at: data.createdAt },
    ...data.conversations.map((c) => ({
      id: `conv-${c.id}`,
      type: "conversation" as const,
      label: `Chat: ${c.title}`,
      at: c.createdAt,
    })),
    ...data.documents.map((d) => ({
      id: `doc-${d.id}`,
      type: "document" as const,
      label: `Uploaded: ${d.title}`,
      at: d.createdAt,
    })),
    ...data.firDrafts.map((f) => ({
      id: `fir-${f.id}`,
      type: "firDraft" as const,
      label: `Complaint draft started${f.incidentType ? ` — ${f.incidentType}` : ""}`,
      at: f.createdAt,
    })),
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-textPrimary sm:px-6 sm:py-12">
      <Link
        href="/dashboard/cases"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-textSecondary hover:text-textPrimary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        My Cases
      </Link>

      {/* Header */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && patch({ title: titleDraft }).then(() => setEditingTitle(false))}
                className="w-full rounded-lg border border-brandBlue/50 bg-canvas px-3 py-1.5 font-serif text-2xl font-semibold text-textPrimary outline-none"
              />
              <button
                onClick={() => patch({ title: titleDraft }).then(() => setEditingTitle(false))}
                className="rounded-lg bg-brandBlue p-2 text-white"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="group flex items-center gap-2">
              <h1 className="truncate font-serif text-2xl font-semibold text-textPrimary">{data.title}</h1>
              <button
                onClick={() => {
                  setTitleDraft(data.title);
                  setEditingTitle(true);
                }}
                className="shrink-0 rounded-md p-1 text-textSecondary opacity-0 transition-opacity hover:text-brandBlue group-hover:opacity-100"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={data.status}
              onChange={(e) => patch({ status: e.target.value })}
              data-no-translate
              className="rounded-full border border-borderCustom bg-card px-2.5 py-1 text-xs font-semibold text-textPrimary outline-none focus:border-brandBlue"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>

            {editingJurisdiction ? (
              <input
                autoFocus
                value={jurisdictionDraft}
                onChange={(e) => setJurisdictionDraft(e.target.value)}
                onBlur={() => patch({ jurisdiction: jurisdictionDraft || null }).then(() => setEditingJurisdiction(false))}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                placeholder="Area / city"
                className="rounded-lg border border-brandBlue/50 bg-canvas px-2 py-1 text-xs text-textPrimary outline-none"
              />
            ) : (
              <button
                onClick={() => {
                  setJurisdictionDraft(data.jurisdiction ?? "");
                  setEditingJurisdiction(true);
                }}
                className="flex items-center gap-1 rounded-full border border-borderCustom px-2.5 py-1 text-xs text-textSecondary hover:text-textPrimary"
              >
                <MapPin className="h-3 w-3" />
                {data.jurisdiction ?? "Add area"}
              </button>
            )}
          </div>
        </div>

        {confirmDelete ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={deleteCase}
              disabled={deleting}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm delete"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg px-3 py-1.5 text-xs text-textSecondary hover:bg-canvas"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-borderCustom px-3 py-1.5 text-xs font-medium text-textSecondary hover:border-rose-500/40 hover:text-rose-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        )}
      </div>

      {data.summary && <p className="mt-4 text-sm leading-relaxed text-textSecondary">{data.summary}</p>}

      {/* Next action */}
      <div className="mt-6">
        <NextActionCard
          caseId={id}
          nextAction={data.nextAction}
          nextActionDue={data.nextActionDue}
          onSaved={(p) => setData((d) => (d ? { ...d, ...p } : d))}
        />
      </div>

      {/* Linked content */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-textSecondary">Linked to this case</h2>
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-borderCustom px-3 py-1.5 text-xs font-semibold text-textPrimary hover:border-brandBlue/40 hover:text-brandBlue"
        >
          <Link2 className="h-3.5 w-3.5" />
          Link existing
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {data.conversations.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-borderCustom bg-card p-3.5">
            <Link href={`/dashboard/chat?c=${c.id}`} className="flex min-w-0 flex-1 items-center gap-2.5 group">
              <MessagesSquare className="h-4 w-4 shrink-0 text-blue-500" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-textPrimary group-hover:text-brandBlue">{c.title}</p>
                <p className="text-[11px] text-textSecondary">{c._count.messages} messages</p>
              </div>
            </Link>
            <button onClick={() => unlink("conversation", c.id)} className="shrink-0 rounded-lg p-1.5 text-textSecondary hover:text-rose-500" title="Remove from case">
              <Unlink className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {data.documents.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between gap-3 rounded-xl border border-borderCustom bg-card p-3.5">
            <Link href={`/dashboard/documents/${doc.id}`} className="flex min-w-0 flex-1 items-center gap-2.5 group">
              <FileText className="h-4 w-4 shrink-0 text-violet-500" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-textPrimary group-hover:text-brandBlue">{doc.title}</p>
                <p className="text-[11px] text-textSecondary">{doc.fileType} · {doc.status}</p>
              </div>
            </Link>
            <button onClick={() => unlink("document", doc.id)} className="shrink-0 rounded-lg p-1.5 text-textSecondary hover:text-rose-500" title="Remove from case">
              <Unlink className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {data.firDrafts.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-borderCustom bg-card p-3.5">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <FileSignature className="h-4 w-4 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-textPrimary">
                  {f.incidentType ?? "Complaint draft"}
                </p>
                <p className="text-[11px] text-textSecondary">{f.status} · v{f.draftVersion || 1}</p>
              </div>
            </div>
            {f.hasGeneratedDraft && (
              <a
                href={`/api/fir/${f.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="flex shrink-0 items-center gap-1 rounded-lg border border-borderCustom px-2 py-1 text-[11px] font-semibold text-textPrimary hover:border-brandBlue/40 hover:text-brandBlue"
              >
                <Download className="h-3 w-3" />
                PDF
              </a>
            )}
            <button onClick={() => unlink("firDraft", f.id)} className="shrink-0 rounded-lg p-1.5 text-textSecondary hover:text-rose-500" title="Remove from case">
              <Unlink className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {data.conversations.length === 0 && data.documents.length === 0 && data.firDrafts.length === 0 && (
          <div className="rounded-xl border border-dashed border-borderCustom p-6 text-center text-xs text-textSecondary">
            Nothing linked yet. Use "Link existing" above, or continue this matter from Ask LegalSetu.
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="mt-8">
        <ActivityTimeline entries={timelineEntries} />
      </div>

      <LinkPicker
        caseId={id}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onLinked={() => void load()}
      />
    </div>
  );
}
