import { ExternalLink, FileCheck2, ShieldCheck, HelpCircle } from "lucide-react";

export interface Citation {
  chunkId: string;
  sourceTitle: string;
  actName: string | null;
  section: string | null;
  officialUrl: string | null;
  verificationStatus: string;
}

export function CitationCard({ citation }: { citation: Citation }) {
  const isVerified = citation.verificationStatus.toLowerCase().includes("verified");

  return (
    <div className="group relative rounded-xl border border-white/10 bg-slate-900/60 p-3.5 backdrop-blur-md transition-all duration-200 hover:border-blue-500/40 hover:bg-slate-900/90 hover:shadow-lg hover:shadow-blue-500/5">
      <div className="flex items-start gap-3">
        {/* Icon Badge */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-400">
          <FileCheck2 className="h-4 w-4" aria-hidden="true" />
        </div>

        {/* Content Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-100 transition-colors group-hover:text-blue-300">
              {citation.actName ?? citation.sourceTitle}
            </p>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {citation.section && (
              <span className="font-mono text-slate-300">
                Section {citation.section}
              </span>
            )}

            {/* Verification Badge */}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                isVerified
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-slate-700 bg-slate-800 text-slate-400"
              }`}
            >
              {isVerified ? (
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              ) : (
                <HelpCircle className="h-3 w-3" aria-hidden="true" />
              )}
              {citation.verificationStatus}
            </span>
          </div>
        </div>

        {/* External URL Action */}
        {citation.officialUrl && (
          <a
            href={citation.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open official source for ${citation.actName ?? citation.sourceTitle}`}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}