// ==========================================================
// The address that links inside EMAIL point to.
// ----------------------------------------------------------
// An email is opened on the recipient's own device, so a link to
// "http://localhost:3000" is useless to them. EMAIL_LINK_BASE_URL (the
// public site, e.g. https://legalsetu-ai.vercel.app) is used for every
// email link. If it is not set we fall back to the app's own URL, which is
// right for a normal production deployment.
// ==========================================================

export function emailBaseUrl(): string {
  const raw =
    process.env.EMAIL_LINK_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** Full URL for a path such as "/dashboard/consultations/123". */
export function emailLink(path: string): string {
  return `${emailBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
