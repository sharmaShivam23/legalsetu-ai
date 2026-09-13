"use client";

// ==========================================================
// LegalSetu — Per-message actions
// ----------------------------------------------------------
// Copy, edit, regenerate and delete, shown on hover.
//
// Copy matters more here than in a general chatbot: people
// take these answers to a police station or a legal-aid desk,
// so getting the text out cleanly is a real workflow.
// ==========================================================

import { useState } from "react";
import { Copy, Check, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function MessageActions({
  content,
  onEdit,
  onRegenerate,
  onDelete,
  className,
}: {
  content: string;
  onEdit?: () => void;
  onRegenerate?: () => void;
  onDelete?: () => void;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure context or denied permission).
    }
  };

  const button =
    "rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-canvas hover:text-textPrimary";

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
        className
      )}
      data-no-translate
    >
      <button type="button" onClick={copy} className={button} title="Copy text">
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>

      {onEdit && (
        <button type="button" onClick={onEdit} className={button} title="Edit and resend">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}

      {onRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          className={button}
          title="Regenerate this answer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      )}

      {onDelete &&
        (confirmDelete ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setConfirmDelete(false);
                onDelete();
              }}
              className="rounded-lg px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-600 hover:bg-rose-500/10"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg px-1.5 py-1 text-[10px] uppercase tracking-wide text-textSecondary hover:bg-canvas"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className={cn(button, "hover:bg-rose-500/10 hover:text-rose-500")}
            title="Delete message"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ))}
    </div>
  );
}
