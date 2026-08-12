/**
 * Additional security headers applied at the API-route level
 * (global headers are also set in next.config.ts for all routes).
 */
export function withSecurityHeaders(headers: Headers = new Headers()): Headers {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.NODE_ENV === "production") {
    headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }
  return headers;
}
