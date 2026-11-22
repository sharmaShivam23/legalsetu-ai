// ==========================================================
// LegalSetu — Verified Lawyer Connect: route helpers (server)
// ==========================================================

import type { NextRequest } from "next/server";
import { apiError } from "@/lib/utils/api-response";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { getSessionUser, type SessionUser } from "./server";

export type Guarded = { user: SessionUser; error?: undefined } | { user?: undefined; error: Response };

/** Signed in (and optionally rate-limited). */
export async function requireUser(limit?: keyof typeof RATE_LIMITS): Promise<Guarded> {
  const user = await getSessionUser();
  if (!user) return { error: apiError("UNAUTHORIZED", "Sign in required.", 401) };
  if (limit) {
    const rl = await checkRateLimit(user.id, limit);
    if (!rl.success) return { error: apiError("RATE_LIMITED", "Too many requests. Please wait a moment.", 429) };
  }
  return { user };
}

/** Admin, checked against the database on every call. */
export async function requireAdmin(): Promise<Guarded> {
  const g = await requireUser();
  if (g.error) return g;
  if (g.user.role !== "ADMIN") return { error: apiError("FORBIDDEN", "Admins only.", 403) };
  return g;
}

export async function readJson(req: NextRequest): Promise<unknown> {
  return req.json().catch(() => null);
}

export function firstIssue(err: { issues: { message: string }[] }, fallback = "Invalid details."): string {
  return err.issues[0]?.message ?? fallback;
}

/** Reads one file field from a multipart body, refusing oversize bodies before buffering them. */
export async function readUpload(
  req: NextRequest,
  maxBytes: number
): Promise<{ file: Buffer; fields: FormData } | { error: Response }> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  // Multipart framing adds a little; anything far beyond the limit is refused unread.
  if (declared > maxBytes + 64 * 1024) {
    return { error: apiError("FILE_TOO_LARGE", `The file is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).`, 413) };
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { error: apiError("VALIDATION_ERROR", "Send the file as multipart form data.", 422) };
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) return { error: apiError("NO_FILE", "No file was uploaded.", 422) };
  if (file.size > maxBytes) {
    return { error: apiError("FILE_TOO_LARGE", `The file is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).`, 413) };
  }
  return { file: Buffer.from(await file.arrayBuffer()), fields: form };
}

/** Headers for serving a private stored file. */
export function privateFileHeaders(contentType: string, filename: string): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Disposition": `inline; filename="${filename}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  // An image opened directly is data, never an active document. PDFs are
  // exempt: browsers refuse to run their built-in PDF viewer inside a
  // sandboxed document, which would leave reviewers unable to read a
  // certificate. (Only PDF/JPEG/PNG/WebP are ever stored — see files.ts.)
  if (contentType !== "application/pdf") {
    headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";
  }
  return headers;
}
