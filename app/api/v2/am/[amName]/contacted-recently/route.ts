import { NextRequest, NextResponse } from "next/server";
import { entitiesContactedRecently } from "@/lib/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/am/:amName/contacted-recently?days=7
 *   → list of entity_ids the AM has logged a 'contacted_*' action against
 *     in the last N days. Powers the dimmed-card / 'already contacted'
 *     affordance on V2AMTriage so the AM doesn't double-call.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: { amName: string } },
) {
  const url = new URL(req.url);
  const days = Math.max(1, Math.min(30, Number(url.searchParams.get("days") || 7)));
  const am = decodeURIComponent(ctx.params.amName);
  try {
    const set = await entitiesContactedRecently(am, days);
    return NextResponse.json(
      { am_name: am, days, entity_ids: Array.from(set) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
