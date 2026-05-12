import { NextRequest, NextResponse } from "next/server";
import { readStoplightMovement } from "@/lib/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/snapshot/movement?days=7
 *   → stoplight movement between latest snapshot and N days ago.
 *     Buckets: flippedToRed, recoveries, degraded.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const days = Math.max(1, Math.min(60, Number(url.searchParams.get("days") || 7)));
  try {
    const result = await readStoplightMovement(days);
    if (!result) {
      return NextResponse.json(
        { error: "no snapshots available for comparison" },
        { status: 404 },
      );
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
