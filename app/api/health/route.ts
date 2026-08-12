import { apiSuccess } from "@/lib/utils/api-response";

export async function GET() {
  return apiSuccess({
    status: "ok",
    aiProvider: process.env.AI_PROVIDER ?? "mock",
    timestamp: new Date().toISOString(),
  });
}
