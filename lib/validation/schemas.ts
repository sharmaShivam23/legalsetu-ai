import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const chatMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  content: z.string().min(1).max(4000),
  language: z.string().min(2).max(10).default("en"),
});

export const ragSearchSchema = z.object({
  query: z.string().min(1).max(1000),
  jurisdiction: z.string().optional(),
  language: z.string().optional(),
  sourceType: z.string().optional(),
});

export const firDraftSchema = z.object({
  incidentType: z.string().min(1).max(200).optional(),
  incidentDate: z.string().datetime().optional(),
  location: z.string().max(500).optional(),
  peopleInvolved: z.string().max(2000).optional(),
  description: z.string().max(5000).optional(),
  evidence: z.string().max(2000).optional(),
  witnesses: z.string().max(2000).optional(),
  additionalDetails: z.string().max(2000).optional(),
});

export const caseSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(2000).optional(),
  jurisdiction: z.string().max(100).optional(),
});

export const translationSchema = z.object({
  text: z.string().min(1).max(5000),
  targetLanguage: z.string().min(2).max(10),
  sourceLanguage: z.string().min(2).max(10).optional(),
});

export const feedbackSchema = z.object({
  messageId: z.string().uuid().optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// LegalDocument validation + category mapping (OCR + AI analysis pipeline)
// ---------------------------------------------------------------------------

// ---- Category mapping: UI-facing string <-> Prisma enum ----
// Must match the LegalDocumentCategory enum in schema.prisma exactly.

export const DOCUMENT_CATEGORY_TO_DB = {
  "legal-notice": "LEGAL_NOTICE",
  "fir-police-doc": "FIR_POLICE_DOC",
  "court-order": "COURT_ORDER",
} as const;

export const DOCUMENT_CATEGORY_FROM_DB: Record<string, string> = {
  LEGAL_NOTICE: "legal-notice",
  FIR_POLICE_DOC: "fir-police-doc",
  COURT_ORDER: "court-order",
};

export type DocumentCategory = keyof typeof DOCUMENT_CATEGORY_TO_DB;

// ---- Upload validation (used in app/api/documents/route.ts POST) ----

export const createDocumentSchema = z.object({
  category: z.enum(["legal-notice", "fir-police-doc", "court-order"]),
  ocrText: z.string().min(1, "OCR text is required."),
  ocrConfidence: z.coerce.number().min(0).max(100),
});

// ---- AI analysis result (used in app/api/documents/[id]/analyze/route.ts) ----

export const analysisResultSchema = z.object({
  documentType: z.string(),
  partiesInvolved: z.array(z.string()),
  keyDates: z.array(z.string()),
  mainSubjectMatter: z.string(),
  obligationsOrDirections: z.array(z.string()),
  deadlinesOrTimeLimits: z.array(z.string()),
  possibleConsequences: z.array(z.string()),
  recommendedNextSteps: z.array(z.string()),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export function fallbackAnalysisResult(): AnalysisResult {
  return {
    documentType: "Not detected",
    partiesInvolved: ["Not detected"],
    keyDates: ["Not detected"],
    mainSubjectMatter: "Not detected",
    obligationsOrDirections: ["Not detected"],
    deadlinesOrTimeLimits: ["Not detected"],
    possibleConsequences: ["Not detected"],
    recommendedNextSteps: ["Not detected"],
  };
}