import { NextResponse } from "next/server";
import { composeSnapshot } from "@/lib/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
