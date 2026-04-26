import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (
    pathname.startsWith("/portal") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/whatsapp/webhook") ||
    pathname.startsWith("/api/whatsapp/ai-reply") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/portal") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname === "/"
  ) {
    return NextResponse.next();
  }

  // External integrations (n8n, Zapier, etc.) authenticate with `Authorization: Bearer cms_live_...`.
  // Let those API calls through; the route handler verifies the token and returns 401 if invalid.
  if (pathname.startsWith("/api/")) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      return NextResponse.next();
    }
    console.log(
      `[middleware] ${request.method} ${pathname} no Bearer header; auth-header=${authHeader ? "present-other" : "missing"}`,
    );
  }

  // Check for session cookie — NextAuth v4 and v5 names, both HTTP and HTTPS variants
  const hasSession =
    request.cookies.get("next-auth.session-token") ||
    request.cookies.get("__Secure-next-auth.session-token") ||
    request.cookies.get("authjs.session-token") ||
    request.cookies.get("__Secure-authjs.session-token");

  if (!hasSession) {
    // For API routes return JSON 401 instead of redirecting to /login (which wouldn't make
    // sense for a programmatic caller and produces 405 on POST).
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ data: null, error: "Unauthorized", meta: null }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg).*)",
  ],
};
