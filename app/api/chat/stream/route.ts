import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { apiError } from "@/lib/utils/api-response";
import { chatMessageSchema } from "@/lib/validation/schemas";
import { retrieveRelevantChunks } from "@/lib/rag/retriever";
import { buildRAGMessages } from "@/lib/rag/prompt";
import { streamCompletion } from "@/lib/ai/llm";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * Server-Sent-Events style streaming chat endpoint.
 * Sends: retrieval metadata first, then token deltas, then a
 * final event with citations + evidence level.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  }
  const userId = (session.user as any).id as string;

  const rateLimit = await checkRateLimit(userId, "aiGeneration");
  if (!rateLimit.success) {
    return apiError("RATE_LIMITED", "Too many requests.", 429);
  }

  const body = await req.json().catch(() => null);
  const parsed = chatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid message.", 422);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const { chunks, evidenceLevel } = await retrieveRelevantChunks(
          parsed.data.content
        );
        send("retrieval", { evidenceLevel, sourceCount: chunks.length });

        const messages = buildRAGMessages(parsed.data.content, chunks);

        for await (const chunk of streamCompletion(messages, { temperature: 0.2 })) {
          if (chunk.delta) send("token", { delta: chunk.delta });
          if (chunk.done) send("done", { citations: chunks, evidenceLevel });
        }
      } catch (err) {
        send("error", { message: "Generation failed." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
