"use client";

// ==========================================================
// LegalSetu — Conversation history panel
// ----------------------------------------------------------
// Lists the signed-in user's saved chats and lets them start,
// open, rename and delete threads.
//
// Deleting is guarded by an inline confirm step rather than a
// browser dialog: a legal thread can hold the only written
// record of someone's situation, so it should not vanish on a
// single mis-click.
// ==========================================================

import { useEffect, useRef, useState } from "react";
import {
  MessageSquarePlus,
  MessagesSquare,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
}

export function ConversationSidebar({
  conversations,
  activeId,
  loading,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading?: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.focus();
  }, [editingId]);

  const startRename = (c: ConversationSummary) => {
    setConfirmId(null);
    setEditingId(c.id);
    setDraftTitle(c.title);
  };

  const commitRename = async () => {
    const title = draftTitle.trim();
    const id = editingId;
    setEditingId(null);
    if (id && title) await onRename(id, title);
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-borderCustom bg-card/60">
      <div className="border-b border-borderCustom p-3">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brandBlue px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && conversations.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-8 text-textSecondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Loading chats…</span>
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <p className="px-3 py-8 text-center text-xs leading-relaxed text-textSecondary">
            Your saved chats appear here. Ask a question to start one.
          </p>
        )}

        <ul className="space-y-1">
          {conversations.map((c) => {
            const active = c.id === activeId;
            const isEditing = editingId === c.id;
            const isConfirming = confirmId === c.id;

            return (
              <li key={c.id}>
                <div
                  className={cn(
                    "group relative rounded-xl border px-3 py-2 transition-colors",
                    active
                      ? "border-brandBlue/30 bg-brandBlue/10"
                      : "border-transparent hover:bg-canvas"
                  )}
                >
                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={inputRef}
                        value={draftTitle}
                        maxLength={200}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitRename();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="min-w-0 flex-1 rounded-md border border-borderCustom bg-canvas px-2 py-1 text-sm text-textPrimary outline-none focus:border-brandBlue"
                        aria-label="Conversation title"
                      />
                      <button
                        type="button"
                        onClick={() => void commitRename()}
                        className="rounded p-1 text-emerald-600 hover:bg-emerald-500/10"
                        title="Save title"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded p-1 text-textSecondary hover:bg-canvas"
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onSelect(c.id)}
                        className="block w-full text-left"
                      >
                        <span
                          className={cn(
                            "flex items-center gap-2 truncate text-sm font-medium",
                            active ? "text-brandBlue" : "text-textPrimary"
                          )}
                        >
                          <MessagesSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                          <span className="truncate">{c.title}</span>
                        </span>
                        {c.preview && (
                          <span className="mt-0.5 block truncate pl-5 text-[11px] text-textSecondary">
                            {c.preview}
                          </span>
                        )}
                      </button>

                      {/* Row actions: visible on hover, always on the open chat. */}
                      <div
                        className={cn(
                          "absolute right-2 top-2 flex items-center gap-0.5 rounded-lg bg-card/90 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100",
                          active && "opacity-100"
                        )}
                      >
                        {isConfirming ? (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                setConfirmId(null);
                                await onDelete(c.id);
                              }}
                              className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600 hover:bg-rose-500/10"
                              title="Confirm delete"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmId(null)}
                              className="rounded p-1 text-textSecondary hover:bg-canvas"
                              title="Keep this chat"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startRename(c)}
                              className="rounded p-1 text-textSecondary hover:bg-canvas hover:text-textPrimary"
                              title="Rename chat"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmId(c.id)}
                              className="rounded p-1 text-textSecondary hover:bg-rose-500/10 hover:text-rose-500"
                              title="Delete chat"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
