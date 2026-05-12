import { NextRequest, NextResponse } from "next/server";
import { readMultipleCustomerTrends } from "@/lib/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/trends/customers?days=14&ids=ent1,ent2,ent3
 *   → bundled per-customer composite-score trend.
 *     Max 200 entity_ids per request to keep response size sane.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const days = Math.max(7, Math.min(90, Number(url.searchParams.get("days") || 14)));
  const idsParam = url.searchParams.get("ids") || "";
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (!ids.length) {
    return NextResponse.json({ error: "ids query param required" }, { status: 400 });
  }
  if (ids.length > 200) {
    return NextResponse.json({ error: "max 200 customer ids per request" }, { status: 400 });
  }
  try {
    const data = await readMultipleCustomerTrends(ids, days);
    return NextResponse.json(
      { days, count: ids.length, data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
