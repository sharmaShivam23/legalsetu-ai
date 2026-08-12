import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge middleware: applies security headers globally and guards
 * dashboard/admin routes. Fine-grained per-resource authorization
 * (e.g. "does this user own this case?") is enforced again at the
 * data-access layer in each API route / server action — middleware
 * alone is never trusted as the only authorization boundary.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  const sessionCookie =
    request.cookies.get("authjs.session-token") ??
    request.cookies.get("__Secure-authjs.session-token");

  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isAdmin = request.nextUrl.pathname.startsWith("/dashboard/admin");

  if (isDashboard && !sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin-role check happens server-side in the admin layout itself
  // (session.user.role), since middleware cannot decode the JWT
  // payload without extra crypto work — this is a first line of
  // defense only, not the sole authorization check.
  if (isAdmin && !sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
