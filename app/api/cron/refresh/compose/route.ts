import { NextRequest, NextResponse } from "next/server";
import { composeSnapshot } from "@/lib/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * Compose — reads stages A, B, C for today's snapshot_date from
 * pipeline_state, scores active entities, writes final snapshot to
 * dashboard_snapshots.
 *
 * Lightweight: ~5-15s (no fetching, just Postgres reads + score loop + write).
 *
 * Scheduled in vercel.json: '5 22 * * *' (5 min after stages start).
 * Manual trigger: curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/refresh/compose
 *
 * Fails loudly if any stage's pipeline_state row is missing for today.
 * Caller should hit the missing stage's endpoint, then retry compose.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const ok =
    (secret && auth === `Bearer ${secret}`) ||
    (!secret && !!req.headers.get("x-vercel-cron"));
  if (!ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const snap = await composeSnapshot();
    return NextResponse.json({
      ok: true,
      stage: "compose",
      generatedAt: snap.generatedAt,
      totalActive: snap.totalActive,
      tierCounts: snap.tierCounts,
      stoplightCounts: snap.stoplightCounts,
      durationMs: snap.health.refreshDurationMs,
      errors: snap.errors || [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, stage: "compose", error: msg }, { status: 500 });
  }
}

export const POST = GET;
