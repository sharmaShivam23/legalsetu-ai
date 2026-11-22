// ==========================================================
// LegalSetu — Ollama mode switch
// ----------------------------------------------------------
// GET  /api/ai/mode                     current state + installed models
// POST /api/ai/mode {enabled, model?}   turn Ollama mode on/off
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { isOllamaMode, setOllamaMode } from "@/lib/ai/mode";
import { listOllamaModels, ollamaBaseUrl, ollamaModel, warmUpOllama } from "@/lib/ai/ollama";

export const runtime = "nodejs";
export const maxDuration = 30;

async function snapshot() {
  const models = await listOllamaModels();
  return {
    ollamaMode: isOllamaMode(),
    configured: ollamaBaseUrl() !== null,
    reachable: models !== null,
    activeModel: ollamaModel(),
    models: models ?? [],
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "You must be signed in.", 401);
  return apiSuccess(await snapshot());
}

const bodySchema = z.object({
  enabled: z.boolean(),
  model: z.string().min(1).max(100).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return apiError("UNAUTHORIZED", "You must be signed in.", 401);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid request.", 422);
  const { enabled, model } = parsed.data;

  if (!enabled) {
    setOllamaMode(false);
    return apiSuccess(await snapshot());
  }

  if (!ollamaBaseUrl()) {
    return apiError("OLLAMA_NOT_CONFIGURED", "Set OLLAMA_BASE_URL in .env to use Ollama mode.", 409);
  }
  const installed = await listOllamaModels();
  if (installed === null) {
    return apiError(
      "OLLAMA_UNREACHABLE",
      "Ollama is not reachable from this server. Start the Ollama app (Ollama mode only works when the app runs on the same computer).",
      409
    );
  }

  // Accept "llama3" for "llama3:latest".
  const has = (name: string) => installed.some((m) => m === name || m === `${name}:latest`);
  let chosen = model ?? ollamaModel();
  // No model asked for and the configured default isn't downloaded:
  // use one that is, rather than failing the switch.
  if (!model && !has(chosen) && installed.length > 0) {
    chosen = installed.find((m) => /gemma3|qwen/i.test(m)) ?? installed[0];
  }
  const present = has(chosen);
  if (!present) {
    return apiError(
      "OLLAMA_MODEL_MISSING",
      `Model "${chosen}" is not downloaded. Run: ollama pull ${chosen}`,
      409
    );
  }

  setOllamaMode(true, chosen);
  // Load the model into memory in the background so the first answer is quick.
  void warmUpOllama(chosen);
  return apiSuccess(await snapshot());
}
