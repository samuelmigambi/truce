import { NextResponse, type NextRequest } from "next/server";

/**
 * A quick first check before the app's pages render: without a session cookie, /app and
 * /onboarding go straight to sign-in (and back afterwards). It only looks for the cookie; the
 * pages and API routes verify it, so a forged or expired cookie gets no further than here would.
 */

const SESSION_COOKIE = "truce_session";

export function proxy(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  const url = request.nextUrl.clone();
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = "/signin";
  url.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*", "/onboarding/:path*", "/onboarding"],
};
