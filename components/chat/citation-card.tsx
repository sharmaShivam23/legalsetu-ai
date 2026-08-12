import { ExternalLink, FileCheck2 } from "lucide-react";

interface Citation {
  chunkId: string;
  sourceTitle: string;
  actName: string | null;
  section: string | null;
  officialUrl: string | null;
  verificationStatus: string;
}

export function CitationCard({ citation }: { citation: Citation }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start gap-2">
        <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-navy-900">
            {citation.actName ?? citation.sourceTitle}
          </p>
          {citation.section && (
            <p className="text-xs text-slate-500">Section {citation.section}</p>
          )}
          <p className="text-xs text-slate-400">{citation.verificationStatus}</p>
        </div>
        {citation.officialUrl && (
          <a
            href={citation.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-slate-400 hover:text-brand-500"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}
