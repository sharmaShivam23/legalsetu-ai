"use client";

import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, Sparkles, Zap, Brain } from "lucide-react";
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

export function ModelSelector({
  selectedModelId,
  onModelChange,
}: {
  selectedModelId: string;
  onModelChange: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const selected = UI_MODELS.find((m) => m.id === selectedModelId) || UI_MODELS[2]; // Default Gemini Pro

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
            <div className="flex items-center gap-2">
              {selectedModelId === model.id ? (
                <Check className="w-4 h-4 text-brandBlue" />
              ) : (
                <div className="w-4 h-4" />
              )}
              <span className={selectedModelId === model.id ? "font-medium" : ""}>
                {model.name}
              </span>
            </div>
            <span className="text-[10px] text-textSecondary flex items-center gap-1 opacity-70">
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
          {selected.name}
          <CapabilityIcon capability={selected.capability} />
        </span>
        <ChevronDown className="w-4 h-4 opacity-50" />
      </Button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-[280px] bg-canvas/95 backdrop-blur-xl border border-borderCustom text-textPrimary shadow-2xl p-2 rounded-xl z-50 overflow-y-auto max-h-[70vh]">
          {renderGroup("DEFAULT", "LegalSetu AI")}
          <div className="h-px bg-borderCustom my-2" />
          {renderGroup("OPENROUTER", "OpenRouter")}
          <div className="h-px bg-borderCustom my-2" />
          {renderGroup("OPENCODE", "OpenCode")}
        </div>
      )}
    </div>
  );
}
