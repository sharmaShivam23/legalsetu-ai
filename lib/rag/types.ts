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
  /**
   * How many chunks to retrieve. Defaults to TOP_K in the retriever.
   * Voice mode lowers it: a spoken answer is four sentences long and
   * cannot cite six sources, so the extra chunks only enlarge the
   * prompt — and prompt size is paid for in time-to-first-token, which
   * in a spoken conversation is silence the listener sits through.
   */
  topK?: number;
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
