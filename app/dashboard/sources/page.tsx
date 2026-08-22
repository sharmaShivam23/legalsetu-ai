"use client";

import { useEffect, useState } from "react";
import { BookMarked, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SourceRow {
  id: string;
  title: string;
  actName: string | null;
  jurisdiction: string;
  verificationStatus: string;
  officialUrl: string | null;
}

export default function SourcesPage() {
  const [sources, setSources] = useState<SourceRow[] | null>(null);

  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then((data) => setSources(data.success ? data.data.sources : []));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-textPrimary">
      <h1 className="text-2xl font-semibold text-textPrimary">Saved Sources</h1>
      <p className="mt-1 text-sm text-textSecondary">
        Verified legal sources available for grounded answers.
      </p>

      <div className="mt-8 space-y-3">
        {sources === null && <p className="text-sm text-textSecondary">Loading sources...</p>}

        {sources !== null && sources.length === 0 && (
          <Card className="bg-card border-borderCustom shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <BookMarked className="h-8 w-8 text-textSecondary opacity-40" />
              <p className="text-sm font-medium text-textPrimary">No verified sources ingested yet.</p>
              <p className="text-xs text-textSecondary max-w-md">
                Run <code className="rounded bg-canvas px-1 py-0.5 text-textPrimary">npm run rag:ingest</code> to add sample legal sources, or add real ones via the admin panel.
              </p>
            </CardContent>
          </Card>
        )}

        {sources?.map((s) => (
          <Card key={s.id} className="bg-card border-borderCustom shadow-sm hover:border-brandBlue/40 transition-colors">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-textPrimary">{s.actName ?? s.title}</p>
                <p className="text-xs text-textSecondary">{s.jurisdiction}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="border border-borderCustom bg-canvas text-textPrimary shadow-none">
                  {s.verificationStatus}
                </Badge>
                {s.officialUrl && (
                  <a
                    href={s.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 text-textSecondary hover:text-textPrimary transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}