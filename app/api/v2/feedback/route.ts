import { NextRequest, NextResponse } from "next/server";
import { writeSignalFeedback } from "@/lib/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v2/feedback
 * body: { entity_id, signal_name, am_name, comment? }
 *   → logs "this is wrong" feedback against a signal. Returns new row id.
 *     Powers the thumbs-down inside the why-flagged drawer.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { entity_id, signal_name, am_name, comment } = body || {};
  if (!entity_id || !signal_name || !am_name) {
    return NextResponse.json(
      { error: "entity_id, signal_name, am_name required" },
      { status: 400 },
    );
  }
  try {
    const id = await writeSignalFeedback({
      entity_id,
      signal_name,
      am_name,
      comment: comment ?? null,
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
