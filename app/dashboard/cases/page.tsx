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
    <div className="mx-auto max-w-3xl px-6 py-12 text-textPrimary">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-textPrimary">My Cases</h1>
        <Button className="gap-2 bg-brandBlue text-white hover:bg-brandBlue/90" size="sm">
          <Plus className="h-4 w-4" /> New Case
        </Button>
      </div>

      <div className="mt-8 space-y-3">
        {cases === null && <p className="text-sm text-textSecondary">Loading cases...</p>}

        {cases !== null && cases.length === 0 && (
          <Card className="bg-card border-borderCustom shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Folder className="h-8 w-8 text-textSecondary opacity-50" />
              <p className="text-sm font-medium text-textPrimary">No cases yet.</p>
              <p className="text-xs text-textSecondary max-w-md">
                Cases help you organize conversations, documents, and FIR drafts together.
              </p>
            </CardContent>
          </Card>
        )}

        {cases?.map((c) => (
          <Card key={c.id} className="bg-card border-borderCustom shadow-sm hover:border-brandBlue/40 transition-colors">
            <CardContent className="flex items-center justify-between p-4">
              <span className="text-sm font-medium text-textPrimary">{c.title}</span>
              <Badge className="border border-borderCustom bg-canvas text-textPrimary shadow-none">
                {c.status}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
