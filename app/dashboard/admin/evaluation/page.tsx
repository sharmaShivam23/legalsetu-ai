import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// NOTE: All figures on this page are DEMO DATA for illustrating the
// evaluation architecture, clearly labeled as such. Real metrics
// must be computed by the scripts referenced in README.md against
// an actual test set before being reported anywhere (e.g. a thesis
// or paper) as real results.
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
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy-900">Evaluation Dashboard</h1>
        <Badge variant="warning">DEMO DATA</Badge>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Sample metrics illustrating the evaluation architecture. Replace with
        real measurements from your test set before citing anywhere.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {METRICS.map((m) => (
          <Card key={m.label}>
            <CardHeader>
              <CardTitle className="text-sm text-slate-500">{m.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold text-navy-900">{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
