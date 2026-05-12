import { NextRequest, NextResponse } from "next/server";
import { readPodTrend } from "@/lib/postgres";
import { POD_MAP } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/trends/pods?days=14
 *   → per-pod book trend (RED/YEL/GRN counts per pod per day).
 *     Pod mapping is the canonical POD_MAP from lib/config.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const days = Math.max(7, Math.min(90, Number(url.searchParams.get("days") || 14)));
  try {
    const data = await readPodTrend(POD_MAP, days);
    return NextResponse.json(
      { days, data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
