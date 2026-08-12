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
