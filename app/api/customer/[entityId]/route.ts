import { NextRequest, NextResponse } from "next/server";
import { readSnapshot } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/customer/:entityId
 *   → returns the single customer record from the latest snapshot.
 *     Used by the drill-down modal.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: { entityId: string } },
) {
  const { entityId } = ctx.params;
  const snap = await readSnapshot();
  if (!snap) return NextResponse.json({ error: "no snapshot yet" }, { status: 404 });
  const c = snap.customers.find(
    (x) => x.entity_id === entityId || x.customer_id === entityId,
  );
  if (!c) return NextResponse.json({ error: "customer not found" }, { status: 404 });
  return NextResponse.json({ customer: c, generatedAt: snap.generatedAt });
}
