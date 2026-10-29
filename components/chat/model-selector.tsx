"use client";

import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, Sparkles, Zap, Brain, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

// Matching the types from models.ts (these will be sent from server or duplicated for UI)
export type ModelCategory = "DEFAULT" | "OPENAI" | "ANTHROPIC" | "GOOGLE" | "GROQ" | "OPENROUTER" | "OPENCODE";
export type ModelCapability = "Fast" | "Balanced" | "Reasoning";

export interface UIModel {
  id: string;
  category: ModelCategory;
  name: string;
  capability: ModelCapability;
}

const UI_MODELS: UIModel[] = [
  { id: "auto", category: "DEFAULT", name: "Auto (Best Available)", capability: "Balanced" },
  { id: "gemini-flash", category: "DEFAULT", name: "Gemini Flash", capability: "Fast" },
  { id: "gemini-default", category: "DEFAULT", name: "Gemini Pro", capability: "Balanced" },
  { id: "anthropic-default", category: "DEFAULT", name: "Claude", capability: "Balanced" },
  { id: "openai-default", category: "DEFAULT", name: "OpenAI", capability: "Balanced" },
  { id: "groq-default", category: "DEFAULT", name: "Groq", capability: "Fast" },

  { id: "openrouter-nemotron", category: "OPENROUTER", name: "Nemotron Super", capability: "Reasoning" },
  { id: "openrouter-gemma", category: "OPENROUTER", name: "Gemma 4 26B", capability: "Balanced" },
  { id: "openrouter-ling", category: "OPENROUTER", name: "Ling 3 Flash", capability: "Fast" },
  
  { id: "opencode-nemotron", category: "OPENCODE", name: "Nemotron Ultra", capability: "Reasoning" },
  { id: "opencode-mimo", category: "OPENCODE", name: "MiMo V2.5", capability: "Fast" },
];

// Mirrors lib/ai/status.ts (server-only module, so not imported here).
type Health =
  | "working"
  | "rate_limited"
  | "daily_limit"
  | "no_credits"
  | "invalid_key"
  | "overloaded"
  | "unavailable"
  | "not_configured";

interface ItemStatus {
  id: string;
  name: string;
  health: Health;
  workingKeys: number;
  totalKeys: number;
  remainingRequests?: number;
  limitRequests?: number;
  detail?: string;
  userRemaining?: number;
  userLimit?: number;
}

interface StatusReport {
  checkedAt: string;
  models: ItemStatus[];
  services: ItemStatus[];
  autoServedBy: string | null;
}

const HEALTH_LABEL: Record<Health, string> = {
  working: "Working",
  rate_limited: "Rate limited",
  daily_limit: "Daily limit reached",
  no_credits: "No credits",
  invalid_key: "Key rejected",
  overloaded: "Overloaded",
  unavailable: "Unavailable",
  not_configured: "No API key",
};

const HEALTH_DOT: Record<Health, string> = {
  working: "bg-emerald-500",
  rate_limited: "bg-amber-400",
  overloaded: "bg-amber-400",
  daily_limit: "bg-orange-500",
  no_credits: "bg-rose-500",
  invalid_key: "bg-rose-500",
  unavailable: "bg-rose-500",
  not_configured: "bg-slate-500",
};

function StatusDot({ health }: { health?: Health }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", health ? HEALTH_DOT[health] : "bg-slate-600/60")}
    />
  );
}

/** "Working · 2 of 4 keys · 3,960 requests left today · you: 287/300" */
function StatusLine({
  status,
  loading,
  autoServedBy,
}: {
  status?: ItemStatus;
  loading?: boolean;
  /** Set for the Auto row: "" when nothing is working. */
  autoServedBy?: string;
}) {
  if (autoServedBy !== undefined) {
    return (
      <p className="text-[10.5px] leading-snug text-textSecondary">
        {autoServedBy ? `Using ${autoServedBy} right now` : "No provider is answering right now"}
      </p>
    );
  }
  if (!status) {
    return loading ? <p className="text-[10.5px] text-textSecondary">Checking…</p> : null;
  }
  const parts: string[] = [HEALTH_LABEL[status.health]];
  if (status.totalKeys > 1) parts.push(`${status.workingKeys} of ${status.totalKeys} keys`);
  if (status.remainingRequests !== undefined) {
    parts.push(`${status.remainingRequests.toLocaleString()} requests left today`);
  }
  if (status.userLimit !== undefined && status.userRemaining !== undefined) {
    parts.push(`you: ${status.userRemaining}/${status.userLimit} today`);
  }
  return (
    <p className="text-[10.5px] leading-snug text-textSecondary" title={status.detail}>
      {parts.join(" · ")}
      {status.health !== "working" && status.detail ? (
        <span className="block text-[10px] opacity-80">{status.detail}</span>
      ) : null}
    </p>
  );
}

export function ModelSelector({
  selectedModelId,
  onModelChange,
}: {
  selectedModelId: string;
  onModelChange: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Live status of every model's keys — see lib/ai/status.ts.
  const [status, setStatus] = useState<StatusReport | null>(null);
  const [checking, setChecking] = useState(false);
  const loadStatus = async (refresh = false) => {
    setChecking(true);
    try {
      const res = await fetch(`/api/ai/status${refresh ? "?refresh=1" : ""}`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) setStatus(json.data);
    } catch {
      // Status is informational; the picker works without it.
    } finally {
      setChecking(false);
    }
  };
  useEffect(() => {
    if (isOpen && !status && !checking) void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  const statusFor = (id: string) => status?.models.find((m) => m.id === id);
  const autoHealth: Health | undefined = status ? (status.autoServedBy ? "working" : "unavailable") : undefined;

  const selected = UI_MODELS.find((m) => m.id === selectedModelId) || UI_MODELS[0]; // Default: Auto

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const CapabilityIcon = ({ capability }: { capability: string }) => {
    switch (capability) {
      case "Fast":
        return <Zap className="w-3 h-3 text-amber-500 ml-1" />;
      case "Reasoning":
        return <Brain className="w-3 h-3 text-purple-400 ml-1" />;
      default:
        return <Sparkles className="w-3 h-3 text-blue-400 ml-1" />;
    }
  };

  const selectModel = (id: string) => {
    onModelChange(id);
    setIsOpen(false);
  };

  const renderGroup = (category: string, title: string) => (
    <>
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 mt-2 px-2">
        {title}
      </div>
      <div className="flex flex-col">
        {UI_MODELS.filter((m) => m.category === category).map((model) => (
          <button
            key={model.id}
            onClick={() => selectModel(model.id)}
            className={cn(
              "flex items-center justify-between rounded-lg px-2 py-2 cursor-pointer transition-colors text-left",
              selectedModelId === model.id ? "bg-brandBlue/15 text-brandBlue" : "hover:bg-card/80 text-textPrimary"
            )}
          >
            <div className="flex min-w-0 items-start gap-2">
              {selectedModelId === model.id ? (
                <Check className="mt-0.5 w-4 h-4 shrink-0 text-brandBlue" />
              ) : (
                <div className="w-4 h-4 shrink-0" />
              )}
              <div className="min-w-0">
                <span className={cn("flex items-center gap-1.5", selectedModelId === model.id ? "font-medium" : "")}>
                  <StatusDot health={model.id === "auto" ? autoHealth : statusFor(model.id)?.health} />
                  {model.name}
                </span>
                <StatusLine
                  loading={checking && !status}
                  status={statusFor(model.id)}
                  autoServedBy={model.id === "auto" ? (status ? (status.autoServedBy ?? "") : undefined) : undefined}
                />
              </div>
            </div>
            <span className="text-[10px] text-textSecondary flex shrink-0 items-center gap-1 opacity-70">
              {model.capability}
            </span>
          </button>
        ))}
      </div>
    </>
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="h-9 px-3 gap-2 font-medium text-textSecondary hover:text-textPrimary hover:bg-canvas rounded-xl"
      >
        <span className="flex items-center gap-1.5">
          <StatusDot health={selected.id === "auto" ? autoHealth : statusFor(selected.id)?.health} />
          {selected.name}
          <CapabilityIcon capability={selected.capability} />
        </span>
        <ChevronDown className="w-4 h-4 opacity-50" />
      </Button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-[340px] max-w-[calc(100vw-2rem)] bg-canvas/95 backdrop-blur-xl border border-borderCustom text-textPrimary shadow-2xl p-2 rounded-xl z-50 overflow-y-auto max-h-[75vh]">
          <div className="flex items-center justify-between px-2 pt-1 text-[11px] text-textSecondary">
            <span>
              {checking
                ? "Checking every API key…"
                : status
                  ? `Checked ${new Date(status.checkedAt).toLocaleTimeString()}`
                  : "Live status unavailable"}
            </span>
            <button
              type="button"
              onClick={() => void loadStatus(true)}
              disabled={checking}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-card/80 disabled:opacity-50"
              title="Re-check all API keys now"
            >
              <RefreshCw className={cn("h-3 w-3", checking && "animate-spin")} />
              Refresh
            </button>
          </div>
          {renderGroup("DEFAULT", "LegalSetu AI")}
          <div className="h-px bg-borderCustom my-2" />
          {renderGroup("OPENROUTER", "OpenRouter")}
          <div className="h-px bg-borderCustom my-2" />
          {renderGroup("OPENCODE", "OpenCode")}
          {status && (
            <>
              <div className="h-px bg-borderCustom my-2" />
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 mt-2 px-2">
                Backups &amp; services
              </div>
              {[
                ...status.models.filter((m) => m.id.startsWith("groq-overflow:")),
                ...status.services,
              ].map((s) => (
                <div key={s.id} className="px-2 py-1.5">
                  <span className="flex items-center gap-1.5 text-sm">
                    <StatusDot health={s.health} />
                    {s.name}
                  </span>
                  <StatusLine status={s} />
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
