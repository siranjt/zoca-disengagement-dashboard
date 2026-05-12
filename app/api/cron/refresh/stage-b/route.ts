import { NextRequest, NextResponse } from "next/server";
import { runStageBAndStore } from "@/lib/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * Stage B — Comms (5 CSVs) → per-entity CustomerMetrics.
 * Heaviest stage memory-wise (1.6M+ comms events).
 * Writes pipeline_state for today's date with stage='B'.
 *
 * Scheduled in vercel.json: '0 22 * * *'. Runs in parallel with A and C.
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
    const result = await runStageBAndStore();
    return NextResponse.json({
      ok: true,
      stage: "B",
      ...result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, stage: "B", error: msg }, { status: 500 });
  }
}

export const POST = GET;
