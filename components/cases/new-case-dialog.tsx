"use client";

import { useState } from "react";
import { X, Loader2, FolderPlus } from "lucide-react";
import { toast } from "sonner";

export function NewCaseDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (caseId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          jurisdiction: jurisdiction.trim() || undefined,
          summary: summary.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      toast.success("Case created.");
      onCreated(json.data.case.id);
      setTitle("");
      setJurisdiction("");
      setSummary("");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not create the case.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-borderCustom bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brandBlue/10">
              <FolderPlus className="h-4.5 w-4.5 text-brandBlue" />
            </div>
            <h2 className="text-lg font-semibold text-textPrimary">New case</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-textSecondary hover:bg-canvas hover:text-textPrimary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1.5 text-xs leading-relaxed text-textSecondary">
          A case groups the chats, documents and complaint drafts about one
          matter, so you can find everything about it in one place later.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-textSecondary">
              What is this case about?
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Landlord withholding deposit"
              maxLength={200}
              className="w-full rounded-xl border border-borderCustom bg-canvas px-3.5 py-2.5 text-sm text-textPrimary outline-none focus:border-brandBlue focus:ring-1 focus:ring-brandBlue"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-textSecondary">
              Area / city <span className="font-normal normal-case text-textSecondary">(optional)</span>
            </label>
            <input
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              placeholder="e.g. Ghaziabad, UP"
              maxLength={100}
              className="w-full rounded-xl border border-borderCustom bg-canvas px-3.5 py-2.5 text-sm text-textPrimary outline-none focus:border-brandBlue focus:ring-1 focus:ring-brandBlue"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-textSecondary">
              Notes <span className="font-normal normal-case text-textSecondary">(optional)</span>
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder="Anything worth remembering about this case"
              maxLength={2000}
              className="w-full resize-none rounded-xl border border-borderCustom bg-canvas px-3.5 py-2.5 text-sm text-textPrimary outline-none focus:border-brandBlue focus:ring-1 focus:ring-brandBlue"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-textSecondary hover:bg-canvas"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || saving}
              className="flex items-center gap-2 rounded-xl bg-brandBlue px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create case
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
