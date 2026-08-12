import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Disclaimer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800",
        className
      )}
    >
      <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
      <p>
        LegalSetu provides general legal information, not legal advice. For
        complex or high-risk matters, please consult a qualified lawyer or an
        official legal-aid service.
      </p>
    </div>
  );
}
