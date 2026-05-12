import { NextRequest, NextResponse } from "next/server";
import { readCustomerActions } from "@/lib/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/customer/:entityId/actions
 *   → returns the AM action log for this customer (most recent 20).
 *     Powers the drill-down modal's "Notes" tab.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: { entityId: string } },
) {
  const { entityId } = ctx.params;
  try {
    const rows = await readCustomerActions(entityId);
    return NextResponse.json({ entityId, rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
