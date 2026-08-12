export type EvidenceLevel = "STRONG" | "MODERATE" | "LIMITED" | "INSUFFICIENT";

export interface RetrievedChunk {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  actName: string | null;
  section: string | null;
  jurisdiction: string;
  officialUrl: string | null;
  verificationStatus: string;
  text: string;
  similarity: number;
}

export interface RAGSearchFilters {
  jurisdiction?: string;
  language?: string;
  sourceType?: string;
  actName?: string;
}

export interface RAGSearchResult {
  chunks: RetrievedChunk[];
  evidenceLevel: EvidenceLevel;
}

export interface GroundedAnswer {
  answer: string;
  evidenceLevel: EvidenceLevel;
  citations: RetrievedChunk[];
  isDemo: boolean;
}
