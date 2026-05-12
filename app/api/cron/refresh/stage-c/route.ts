import { NextRequest, NextResponse } from "next/server";
import { runStageCAndStore } from "@/lib/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * Stage C — Mixpanel + 5 performance cards.
 * Medium memory load. ~15-25s typical.
 * Writes pipeline_state for today's date with stage='C'.
 *
 * Scheduled in vercel.json: '0 22 * * *'. Runs in parallel with A and B.
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
    const result = await runStageCAndStore();
    return NextResponse.json({
      ok: true,
      stage: "C",
      ...result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, stage: "C", error: msg }, { status: 500 });
  }
}

export const POST = GET;
