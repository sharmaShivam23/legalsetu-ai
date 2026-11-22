"use client";

import { useCallback, useEffect, useState } from "react";
import { Cpu, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";

interface ModeState {
  ollamaMode: boolean;
  configured: boolean;
  reachable: boolean;
  activeModel: string;
  models: string[];
}

/**
 * One switch that moves the whole app (chat, translation, analysis) onto the
 * local Ollama server. State lives on the server, so every page agrees.
 */
export function OllamaModeToggle({ onChange }: { onChange?: (on: boolean) => void }) {
  const [state, setState] = useState<ModeState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/mode");
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) {
        setState(json.data);
        onChange?.(json.data.ollamaMode);
      }
    } catch {
      // Informational only.
    }
  }, [onChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (enabled: boolean, model?: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/ai/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, model }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error?.message ?? "Could not change Ollama mode.");
        return;
      }
      setState(json.data);
      onChange?.(json.data.ollamaMode);
      toast.success(
        json.data.ollamaMode
          ? `Ollama mode ON — using ${json.data.activeModel}`
          : "Ollama mode OFF — using cloud AI"
      );
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;
  const on = state.ollamaMode;

  return (
    <div
      className="glass-pane flex items-center gap-1 rounded-full border border-borderCustom bg-card/80 px-1.5 py-1 shadow-sm"
      data-no-translate
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => void send(!on)}
        title={
          on
            ? "Ollama mode is ON: everything runs on the local model. Click to go back to cloud AI."
            : "Switch the whole app to the local Ollama model (no API keys, no limits)."
        }
        aria-pressed={on}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors disabled:opacity-60",
          on ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "text-textSecondary hover:text-textPrimary"
        )}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cpu className="h-3.5 w-3.5" />}
        Ollama: {on ? "ON" : "OFF"}
      </button>

      {on && state.models.length > 0 && (
        <select
          value={state.activeModel}
          disabled={busy}
          onChange={(e) => void send(true, e.target.value)}
          aria-label="Ollama model"
          className="h-7 max-w-[130px] rounded-full bg-transparent pr-1 text-xs text-textPrimary outline-none"
        >
          {!state.models.includes(state.activeModel) && (
            <option value={state.activeModel}>{state.activeModel}</option>
          )}
          {state.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
