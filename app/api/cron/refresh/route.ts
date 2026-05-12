import { NextRequest, NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/refresh";
import { writeSnapshot } from "@/lib/store";

// Vercel Cron calls this route with the header `Authorization: Bearer <CRON_SECRET>`.
// It's also callable manually by an operator with the same bearer token for
// on-demand refreshes (useful right after deploy so the first UI load is hot).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90; // requires Vercel Pro; Hobby caps to 10s

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const ok =
    (secret && auth === `Bearer ${secret}`) ||
    // Vercel sends a request with the `x-vercel-cron` header set; accept it only
    // when CRON_SECRET is unset (defense in depth — prefer the secret when set).
    (!secret && !!req.headers.get("x-vercel-cron"));
  if (!ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const snap = await buildSnapshot();
    await writeSnapshot(snap);
    return NextResponse.json({
      ok: true,
      generatedAt: snap.generatedAt,
      totalActive: snap.totalActive,
      tierCounts: snap.tierCounts,
      durationMs: snap.stats.fetch_duration_ms,
      errors: snap.errors || [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Allow POST too — some ops tools prefer it.
export const POST = GET;
