import { NextRequest, NextResponse } from "next/server";
import { readTierTrend } from "@/lib/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/snapshot/trend?days=30
 *   → last N days of tier counts (snapshot_date + totals). Used by the
 *     Leadership view's trend chart.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") || 30)));
  try {
    const rows = await readTierTrend(days);
    return NextResponse.json({ days, rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
