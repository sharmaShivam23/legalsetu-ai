import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Disclaimer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/80 p-3.5 text-xs text-amber-900 shadow-sm backdrop-blur-sm",
        className
      )}
    >
      <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
      <p className="leading-relaxed">
        LegalSetu provides general legal information, not legal advice. For
        complex or high-risk matters, please consult a qualified lawyer or an
        official legal-aid service.
      </p>
    </div>
  );
}