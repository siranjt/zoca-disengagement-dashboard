import { NextRequest, NextResponse } from "next/server";
import { writeAmAction } from "@/lib/postgres";
import { POD_MAP } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v2/actions/escalate
 * body: { am_name, entity_id, note?, composite_at_action?, escalated_to? }
 *
 * Logs an 'escalated' action against an entity. By default the escalation
 * target is derived from the AM's pod (pod lead — first AM in the pod that
 * isn't the escalating AM); callers can override via `escalated_to`.
 *
 * Powers the 'Escalate to pod lead' button on V2CustomerCard.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { am_name, entity_id, note, composite_at_action, escalated_to } = body || {};
  if (!am_name || !entity_id) {
    return NextResponse.json(
      { error: "am_name, entity_id required" },
      { status: 400 },
    );
  }
  // Best-effort pod-lead derivation: first other AM in the same pod
  let target = (escalated_to as string) || "";
  if (!target) {
    const myPod = POD_MAP[am_name];
    if (myPod) {
      const podPeers = Object.entries(POD_MAP)
        .filter(([am, p]) => p === myPod && am !== am_name)
        .map(([am]) => am)
        .sort();
      target = podPeers[0] || "";
    }
  }
  try {
    const id = await writeAmAction({
      am_name,
      entity_id,
      action_type: "escalated",
      note: note ?? null,
      composite_at_action: composite_at_action ?? null,
      escalated_to: target || null,
    });
    return NextResponse.json({ ok: true, id, escalated_to: target || null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
