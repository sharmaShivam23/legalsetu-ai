"use client";

import { useEffect, useState } from "react";
import { Folder, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface CaseRow {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
}

export default function CasesPage() {
  const [cases, setCases] = useState<CaseRow[] | null>(null);

  useEffect(() => {
    fetch("/api/cases")
      .then((r) => r.json())
      .then((data) => setCases(data.success ? data.data.cases : []));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-navy-900">My Cases</h1>
        <Button variant="brand" size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> New Case
        </Button>
      </div>

      <div className="mt-8 space-y-3">
        {cases === null && <p className="text-sm text-slate-400">Loading cases...</p>}

        {cases !== null && cases.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Folder className="h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">No cases yet.</p>
              <p className="text-xs text-slate-400">
                Cases help you organize conversations, documents, and FIR drafts together.
              </p>
            </CardContent>
          </Card>
        )}

        {cases?.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex items-center justify-between p-4">
              <span className="text-sm font-medium text-navy-900">{c.title}</span>
              <Badge>{c.status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
