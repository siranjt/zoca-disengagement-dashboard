import { NextRequest, NextResponse } from "next/server";
import { listPinned, togglePinned } from "@/lib/pinned-customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/v2/pinned?am=<am_name>
 *   → { ok: true, pinned: PinnedCustomer[] }
 *
 * Returns all pinned customers for the given AM, most recent first.
 * Inherits basic-auth from middleware.
 */
export async function GET(req: NextRequest) {
  const am = req.nextUrl.searchParams.get("am");
  if (!am) {
    return NextResponse.json(
      { ok: false, error: "Missing 'am' query param" },
      { status: 400 },
    );
  }
  try {
    const rows = await listPinned(am);
    return NextResponse.json({ ok: true, pinned: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * POST /api/v2/pinned
 *   body: { am: string; entity_id: string; customer_id?: string; bizname?: string }
 *   → { ok: true, pinned: boolean }
 *
 * Toggles the pin state for (am, entity_id). Returns the new state.
 */
export async function POST(req: NextRequest) {
  let body: { am?: string; entity_id?: string; customer_id?: string; bizname?: string } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  const { am, entity_id, customer_id, bizname } = body || {};
  if (!am || !entity_id) {
    return NextResponse.json(
      { ok: false, error: "Missing am or entity_id" },
      { status: 400 },
    );
  }
  try {
    const result = await togglePinned(am, entity_id, {
      customer_id: customer_id ?? null,
      bizname: bizname ?? null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
