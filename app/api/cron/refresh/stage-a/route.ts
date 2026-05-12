import { NextRequest, NextResponse } from "next/server";
import { runStageAAndStore } from "@/lib/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * Stage A — Chargebee subs + invoices + transactions + BaseSheet.
 * Lightweight payloads, fast (~10-20s typical).
 * Writes pipeline_state for today's date with stage='A'.
 *
 * Scheduled in vercel.json: '0 22 * * *' (22:00 UTC daily).
 * Manual trigger: curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/refresh/stage-a
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
    const result = await runStageAAndStore();
    return NextResponse.json({
      ok: true,
      stage: "A",
      ...result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, stage: "A", error: msg }, { status: 500 });
  }
}

export const POST = GET;
