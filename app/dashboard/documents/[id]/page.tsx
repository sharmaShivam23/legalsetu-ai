"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function analyze() {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${params.id}/analyze`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error?.message ?? "Could not analyze document.");
        return;
      }
      setSummary(data.data.summary);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Analysis is triggered on demand, not automatically, to
    // respect AI-generation rate limits.
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-navy-900">Document Analysis</h1>
      <Card className="mt-6">
        <CardContent className="p-6">
          {summary ? (
            <p className="whitespace-pre-wrap text-sm text-slate-700">{summary}</p>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-slate-500">
                Get a plain-language explanation of this document.
              </p>
              <Button variant="brand" onClick={analyze} disabled={loading}>
                {loading ? "Analyzing..." : "Explain this document"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
