import { NextRequest, NextResponse } from "next/server";
import { writeAmAction } from "@/lib/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v2/actions/contacted
 * body: {
 *   am_name: string;
 *   entity_id: string;
 *   action_type: "contacted_connected" | "contacted_vm" | "contacted_noreach";
 *   note?: string;
 *   composite_at_action?: number;
 * }
 *   → logs an AM action. Returns the new row id.
 *     Powers the one-click "Mark contacted" flow on each customer card.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { am_name, entity_id, action_type, note, composite_at_action } = body || {};
  if (!am_name || !entity_id || !action_type) {
    return NextResponse.json(
      { error: "am_name, entity_id, action_type required" },
      { status: 400 },
    );
  }
  if (!["contacted_connected", "contacted_vm", "contacted_noreach"].includes(action_type)) {
    return NextResponse.json(
      { error: "action_type must be one of contacted_connected/contacted_vm/contacted_noreach" },
      { status: 400 },
    );
  }
  try {
    const id = await writeAmAction({
      am_name,
      entity_id,
      action_type,
      note: note ?? null,
      composite_at_action: composite_at_action ?? null,
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
