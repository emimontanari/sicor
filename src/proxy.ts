import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveAuthConfig, SESSION_COOKIE, verifySessionToken } from "./server/auth/token";

// Defense in depth only: pages and server actions MUST still call requireAdmin().
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  const cfg = resolveAuthConfig();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (cfg.enabled && token && verifySessionToken(token, cfg.secret)) return NextResponse.next();

  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
