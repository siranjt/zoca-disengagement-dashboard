// Phase 33.A → 33.B — NextAuth middleware with three-role access split.
//
// Three gates layered on top of every request:
//   1. `authorized` callback → must have a JWT (token != null). If absent
//      the user is redirected to /auth/signin.
//   2. /admin/* paths → admin role ONLY. Managers + AMs bounced to /v2.
//   3. /v2/manager and /v2/manager/* → admin OR manager role. AMs bounced
//      to /v2 (their own AM view).
//
// Excluded from middleware (no auth required):
//   - /_next/static, /_next/image, /favicon.ico  (Next.js internals)
//   - /api/health                                  (uptime monitor)
//   - /api/cron                                    (cron does Bearer auth itself)
//   - /api/auth                                    (NextAuth handler — must be reachable)
//
// Phase 33.B.6 — injects `x-request-path` header on every authorized request
// so requireRole() in lib/api-auth.ts can include the path in api_call
// activity rows. This is how usage analytics learns "which endpoint is hot".
//
// The old DASHBOARD_USER / DASHBOARD_PASSWORD env vars are no longer read
// and can be removed from Vercel.

import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const role = token?.role as "admin" | "manager" | "am" | undefined;
    const path = req.nextUrl.pathname;

    // /admin/* paths — admin only (managers + AMs bounced)
    if (path.startsWith("/admin")) {
      if (role !== "admin") {
        return NextResponse.redirect(new URL("/v2", req.url));
      }
    }

    // /v2/manager and /v2/manager/* — manager + admin allowed
    if (path.startsWith("/v2/manager")) {
      if (role !== "admin" && role !== "manager") {
        return NextResponse.redirect(new URL("/v2", req.url));
      }
    }

    // Phase 33.B.6 — inject the request path as a header so route handlers
    // can attribute api_call rows to a specific endpoint. We clone the
    // original headers to avoid mutating req.headers in place (which Next.js
    // doesn't support).
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-request-path", path);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: { signIn: "/auth/signin" },
  },
);

export const config = {
  matcher: [
    // Same exclusions as the previous Basic-Auth middleware, PLUS api/auth/*
    // which NextAuth needs unauthenticated access to (sign-in / callback / etc.).
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/cron|api/auth).*)",
  ],
};
