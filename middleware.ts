import { NextRequest, NextResponse } from "next/server";

// HTTP Basic Auth — shared password for teammates.
// Same pattern as the AM Ticket Journey dashboard.
// - Skip /api/health so uptime monitors can hit it.
// - Skip /api/cron/* (the cron route does its own Bearer-token auth).

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|api/cron).*)"],
};

export function middleware(req: NextRequest) {
  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!user || !pass) {
    const res = NextResponse.next();
    res.headers.set("x-dashboard-auth", "not-configured");
    return res;
  }
  const auth = req.headers.get("authorization");
  if (auth) {
    const [scheme, value] = auth.split(" ");
    if (scheme === "Basic" && value) {
      try {
        const decoded = atob(value);
        const idx = decoded.indexOf(":");
        if (idx > -1) {
          const u = decoded.slice(0, idx);
          const p = decoded.slice(idx + 1);
          if (u === user && p === pass) return NextResponse.next();
        }
      } catch {
        // fall through to 401
      }
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Zoca Dashboard", charset="UTF-8"' },
  });
}
