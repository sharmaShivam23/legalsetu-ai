"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AdminSourcesPage() {
  const [sources, setSources] = useState<any[] | null>(null);

  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then((d) => setSources(d.success ? d.data.sources : []));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-navy-900">Manage Legal Sources</h1>
      <p className="mt-1 text-sm text-slate-500">
        Ingest new sources via <code>npm run rag:ingest</code>, then verify them here
        before they become usable in RAG retrieval.
      </p>
      <div className="mt-6 space-y-3">
        {sources?.map((s) => (
          <Card key={s.id}>
            <CardContent className="flex items-center justify-between p-4">
              <span className="text-sm font-medium text-navy-900">{s.title}</span>
              <Badge variant={s.verificationStatus === "VERIFIED" ? "success" : "warning"}>
                {s.verificationStatus}
              </Badge>
            </CardContent>
          </Card>
        ))}
        {sources?.length === 0 && (
          <p className="text-sm text-slate-400">No sources ingested yet.</p>
        )}
      </div>
    </div>
  );
}
