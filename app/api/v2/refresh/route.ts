import { NextResponse } from "next/server";
import { composeSnapshot } from "@/lib/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Phase 31.v2.1 — bumped from 60 → 300 (Vercel Pro max). composeSnapshot
// auto-runs missing stages A/B/C/D synchronously inside this function, and
// Stage B's 5 sequential comms CSVs alone can take 30-45s. 60s budget
// guaranteed a 504. 300s gives breathing room: A ~15s, B ~45s, C ~30s,
// D ~30s, compose itself ~30s = ~150s worst case.
export const maxDuration = 300;

/**
 * Manual refresh — invoked from the V2 dashboard "Refresh" button.
 *
 * Gated by the dashboard's HTTP Basic Auth middleware (covers `/api/v2/*`),
 * so the browser doesn't need to know CRON_SECRET.
 *
 * Compose-only: re-reads stage A/B/C/D state from pipeline_state and rebuilds
 * the dashboard_snapshots row. Stages themselves still run on the daily
 * 22:00 UTC cron. Use this when configuration edits need to land in the UI
 * before the next scheduled run.
 */
export async function POST() {
  const t0 = Date.now();
  try {
    const snap = await composeSnapshot();
    return NextResponse.json({
      ok: true,
      generatedAt: snap.generatedAt,
      customerCount: snap.totalActive,
      tierCounts: snap.tierCounts,
      stoplightCounts: snap.stoplightCounts,
      durationMs: Date.now() - t0,
      errors: snap.errors ?? [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg, durationMs: Date.now() - t0 },
      { status: 500 },
    );
  }
}
