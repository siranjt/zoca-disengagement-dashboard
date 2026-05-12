import { NextRequest, NextResponse } from "next/server";
import { readAmBookTrend } from "@/lib/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/am/:amName/trend?days=84
 *   → per-AM book trend (RED/YEL/GRN counts + MRR-at-risk per day).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: { amName: string } },
) {
  const url = new URL(req.url);
  const days = Math.max(7, Math.min(365, Number(url.searchParams.get("days") || 84)));
  const am = decodeURIComponent(ctx.params.amName);
  try {
    const points = await readAmBookTrend(am, days);
    return NextResponse.json(
      { am_name: am, days, points },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
