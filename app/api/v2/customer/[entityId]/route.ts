import { NextRequest, NextResponse } from "next/server";
import { readLatestSnapshotV2 } from "@/lib/postgres";
import { getApiUser, requireAmScope } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/customer/:entityId
 *   → returns the full ScoredCustomerV2 for one entity by looking it up in
 *     the latest snapshot. 404 if the entity isn't in the current snapshot.
 *
 * Phase 33.B — admin + manager bypass; AMs can only view customers in their
 * own book. The customer's am_name is sourced from the latest snapshot.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: { entityId: string } },
) {
  const user = await getApiUser();
  const { entityId } = ctx.params;
  try {
    const snap = await readLatestSnapshotV2();
    if (!snap) {
      return NextResponse.json(
        {
          ok: false,
          error: "No snapshot available yet",
          customer: null,
        },
        { status: 503 },
      );
    }
    const customer =
      snap.customers.find((c) => c.entity_id === entityId) || null;
    if (!customer) {
      return NextResponse.json(
        {
          ok: false,
          error: "Customer not found in latest snapshot",
          customer: null,
        },
        { status: 404 },
      );
    }
    const denied = requireAmScope(user, customer.am_name);
    if (denied) return denied;
    return NextResponse.json(
      {
        ok: true,
        generatedAt: snap.generatedAt,
        customer,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        customer: null,
      },
      { status: 500 },
    );
  }
}
