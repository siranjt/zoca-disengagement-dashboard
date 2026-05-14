// Phase 33.A — NextAuth middleware (replaces HTTP Basic Auth).
//
// Two gates layered on top of every request:
//   1. `authorized` callback → must have a JWT (token != null). If absent
//      the user is redirected to /auth/signin.
//   2. Path-based role check → /admin and /v2/manager require role=admin.
//      Non-admin users are bounced back to /v2 (their own AM view).
//
// Excluded from middleware (no auth required):
//   - /_next/static, /_next/image, /favicon.ico  (Next.js internals)
//   - /api/health                                  (uptime monitor)
//   - /api/cron                                    (cron does Bearer auth itself)
//   - /api/auth                                    (NextAuth handler — must be reachable)
//
// The old DASHBOARD_USER / DASHBOARD_PASSWORD env vars are no longer read
// and can be removed from Vercel.

import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Admin-only paths
    if (path.startsWith("/admin") || path.startsWith("/v2/manager")) {
      if (token?.role !== "admin") {
        const url = new URL("/v2", req.url);
        return NextResponse.redirect(url);
      }
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/auth/signin",
    },
  },
);

export const config = {
  matcher: [
    // Same exclusions as the previous Basic-Auth middleware, PLUS api/auth/*
    // which NextAuth needs unauthenticated access to (sign-in / callback / etc.).
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/cron|api/auth).*)",
  ],
};
