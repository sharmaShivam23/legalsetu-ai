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
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-navy-900">Saved Sources</h1>
      <p className="mt-1 text-sm text-slate-500">
        Verified legal sources available for grounded answers.
      </p>

      <div className="mt-8 space-y-3">
        {sources === null && <p className="text-sm text-slate-400">Loading sources...</p>}

        {sources !== null && sources.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <BookMarked className="h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">No verified sources ingested yet.</p>
              <p className="text-xs text-slate-400">
                Run <code>npm run rag:ingest</code> to add sample legal sources, or add real ones via the admin panel.
              </p>
            </CardContent>
          </Card>
        )}

        {sources?.map((s) => (
          <Card key={s.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-navy-900">{s.actName ?? s.title}</p>
                <p className="text-xs text-slate-400">{s.jurisdiction}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={s.verificationStatus === "VERIFIED" ? "success" : "warning"}>
                  {s.verificationStatus}
                </Badge>
                {s.officialUrl && (
                  <a href={s.officialUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 text-slate-400" />
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
