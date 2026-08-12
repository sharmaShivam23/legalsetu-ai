import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { prisma } from "@/lib/db/prisma";
import { generateCompletion } from "@/lib/ai/llm";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "Sign in required.", 401);
  const userId = (session.user as any).id as string;
  const { id } = await params;

  const rateLimit = await checkRateLimit(userId, "aiGeneration");
  if (!rateLimit.success) return apiError("RATE_LIMITED", "Too many requests.", 429);

  // User isolation: only analyze documents owned by this user.
  const document = await prisma.document.findFirst({ where: { id, userId } });
  if (!document) return apiError("NOT_FOUND", "Document not found.", 404);

  if (!document.extractedText) {
    return apiError(
      "NOT_READY",
      "Document text has not been extracted yet. Please wait for processing to complete.",
      409
    );
  }

  const summary = await generateCompletion([
    {
      role: "system",
      content:
        "You summarize legal documents in plain language for non-lawyers. Identify important clauses and anything that may need professional review. Never declare a clause illegal — only note that it 'may require professional review.' Keep it concise.",
    },
    { role: "user", content: document.extractedText.slice(0, 8000) },
  ]);

  await prisma.document.update({
    where: { id: document.id },
    data: { summary },
  });

  return apiSuccess({ summary });
}
