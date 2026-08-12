import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { chatMessageSchema } from "@/lib/validation/schemas";
import { retrieveRelevantChunks } from "@/lib/rag/retriever";
import { buildRAGMessages } from "@/lib/rag/prompt";
import { generateCompletion } from "@/lib/ai/llm";
import { getAIProvider } from "@/lib/ai/provider";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

/**
 * Non-streaming chat endpoint (see /api/chat/stream for SSE version).
 * Full RAG flow: retrieve -> build grounded prompt -> generate ->
 * persist message + citations -> return structured response.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  }
  const userId = (session.user as any).id as string;

  const rateLimit = await checkRateLimit(userId, "chat");
  if (!rateLimit.success) {
    return apiError("RATE_LIMITED", "Too many chat requests. Please wait.", 429);
  }

  const body = await req.json().catch(() => null);
  const parsed = chatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid message.", 422);
  }

  const { content, language } = parsed.data;

  try {
    const retrievalStart = Date.now();
    const { chunks, evidenceLevel } = await retrieveRelevantChunks(content);
    const retrievalLatencyMs = Date.now() - retrievalStart;

    const messages = buildRAGMessages(content, chunks);

    const aiStart = Date.now();
    const answer = await generateCompletion(messages, { temperature: 0.2 });
    const aiLatencyMs = Date.now() - aiStart;

    const provider = await getAIProvider();

    // Persist conversation + message (best-effort; demo mode may
    // not have a live DB, so failures here don't block the response)
    let conversationId = parsed.data.conversationId;
    try {
      if (!conversationId) {
        const conv = await prisma.conversation.create({
          data: { userId, title: content.slice(0, 60) },
        });
        conversationId = conv.id;
      }
      await prisma.message.create({
        data: {
          conversationId,
          role: "USER",
          content,
          language,
        },
      });
      await prisma.message.create({
        data: {
          conversationId,
          role: "ASSISTANT",
          content: answer,
          language,
          evidenceLevel,
        },
      });
    } catch (persistErr) {
      logger.warn("Chat persistence skipped (no DB in demo mode)", {
        errorType: String(persistErr),
      });
    }

    logger.info("Chat completion generated", {
      userId,
      retrievalLatencyMs,
      aiLatencyMs,
      evidenceLevel,
    });

    return apiSuccess({
      conversationId,
      answer,
      evidenceLevel,
      citations: chunks,
      isDemo: provider.isDemo,
    });
  } catch (err) {
    logger.error("Chat generation failed", { userId, errorType: String(err) });
    return apiError("CHAT_FAILED", "Could not generate a response right now.", 500);
  }
}
