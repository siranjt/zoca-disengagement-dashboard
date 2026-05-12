import { NextRequest, NextResponse } from "next/server";
import { readFeedbackForEntity } from "@/lib/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/customer/:entityId/feedback
 *   → returns "this is wrong" feedback rows for this customer.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: { entityId: string } },
) {
  const { entityId } = ctx.params;
  try {
    const rows = await readFeedbackForEntity(entityId);
    return NextResponse.json({ entityId, rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
