"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { FileText, Sparkles, Loader2 } from "lucide-react";

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
    <div className="mx-auto max-w-3xl px-6 py-12 text-textPrimary">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-brandBlue" />
        <h1 className="text-2xl font-semibold text-textPrimary">Document Analysis</h1>
      </div>

      <Card className="mt-6 bg-card border-borderCustom shadow-sm">
        <CardContent className="p-6">
          {summary ? (
            <p className="whitespace-pre-wrap text-sm text-textPrimary leading-relaxed font-sans">
              {summary}
            </p>
          ) : (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="rounded-full bg-canvas p-4 border border-borderCustom">
                <Sparkles className="h-6 w-6 text-brandBlue" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-textPrimary">
                  Plain-Language Summary
                </p>
                <p className="text-xs text-textSecondary max-w-sm">
                  Get a clear, plain-language legal explanation and key clause breakdown for this document.
                </p>
              </div>
              <Button
                onClick={analyze}
                disabled={loading}
                className="mt-2 gap-2 bg-brandBlue text-white hover:bg-brandBlue/90 shadow-md transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing Document...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Explain this document
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
