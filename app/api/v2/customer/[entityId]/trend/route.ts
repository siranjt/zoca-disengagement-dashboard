import { NextRequest, NextResponse } from "next/server";
import { readCustomerTrend } from "@/lib/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/customer/:entityId/trend?days=84
 *   → per-customer composite-score timeseries.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: { entityId: string } },
) {
  const url = new URL(req.url);
  const days = Math.max(7, Math.min(365, Number(url.searchParams.get("days") || 84)));
  try {
    const points = await readCustomerTrend(ctx.params.entityId, days);
    return NextResponse.json(
      { entity_id: ctx.params.entityId, days, points },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
