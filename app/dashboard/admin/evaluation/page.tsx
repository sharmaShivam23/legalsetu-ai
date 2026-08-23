import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const METRICS = [
  { label: "Retrieval Precision", value: "0.78 (DEMO)" },
  { label: "Retrieval Recall", value: "0.71 (DEMO)" },
  { label: "Citation Accuracy", value: "0.85 (DEMO)" },
  { label: "Groundedness", value: "0.82 (DEMO)" },
  { label: "Answer Relevance", value: "0.80 (DEMO)" },
  { label: "Avg. Latency", value: "1.4s (DEMO)" },
  { label: "Translation Quality (BLEU-like)", value: "0.68 (DEMO)" },
  { label: "FIR Completeness", value: "74% (DEMO)" },
  { label: "User Satisfaction", value: "4.2 / 5 (DEMO)" },
  { label: "Hallucination Rate", value: "3.1% (DEMO)" },
];

export default function EvaluationDashboard() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-textPrimary">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-textPrimary">Evaluation Dashboard</h1>
        <Badge variant="warning">DEMO DATA</Badge>
      </div>
      <p className="mt-1 text-sm text-textSecondary">
        Sample metrics illustrating the evaluation architecture. Replace with
        real measurements from your test set before citing anywhere.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {METRICS.map((m) => (
          <Card key={m.label} className="bg-card border-borderCustom shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-textSecondary">{m.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold text-textPrimary">{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}