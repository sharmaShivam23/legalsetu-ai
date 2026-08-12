import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

type EvidenceLevel = "STRONG" | "MODERATE" | "LIMITED" | "INSUFFICIENT";

const CONFIG: Record<EvidenceLevel, { label: string; variant: "success" | "brand" | "warning" | "danger" }> = {
  STRONG: { label: "Strong Evidence", variant: "success" },
  MODERATE: { label: "Moderate Evidence", variant: "brand" },
  LIMITED: { label: "Limited Evidence", variant: "warning" },
  INSUFFICIENT: { label: "Insufficient Evidence", variant: "danger" },
};

export function ConfidenceBadge({ level, className }: { level: EvidenceLevel; className?: string }) {
  const cfg = CONFIG[level] ?? CONFIG.INSUFFICIENT;
  return (
    <Badge variant={cfg.variant} className={cn(className)}>
      {cfg.label}
    </Badge>
  );
}
