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

  // Check for session cookie — NextAuth v4 and v5 names, both HTTP and HTTPS variants
  const hasSession =
    request.cookies.get("next-auth.session-token") ||
    request.cookies.get("__Secure-next-auth.session-token") ||
    request.cookies.get("authjs.session-token") ||
    request.cookies.get("__Secure-authjs.session-token");

  if (!hasSession) {
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
