import { NextRequest, NextResponse } from "next/server";
import { getNote, upsertNote } from "@/lib/customer-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type Ctx = { params: { entityId: string } };

/**
 * GET /api/v2/notes/:entityId?am=<am_name>
 *   → { ok: true, note: string, updated_at: string | null }
 *
 * Returns the saved note for (am, entityId), or empty string if none.
 * Inherits basic-auth from middleware.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const am = req.nextUrl.searchParams.get("am");
  if (!am) {
    return NextResponse.json(
      { ok: false, error: "Missing 'am' query param" },
      { status: 400 },
    );
  }
  const { entityId } = ctx.params;
  if (!entityId) {
    return NextResponse.json(
      { ok: false, error: "Missing entityId" },
      { status: 400 },
    );
  }
  try {
    const note = await getNote(am, entityId);
    return NextResponse.json({
      ok: true,
      note: note?.note ?? "",
      updated_at: note?.updated_at ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * PUT /api/v2/notes/:entityId
 *   body: { am: string; note: string; customer_id?: string; bizname?: string }
 *   → { ok: true, note: string, updated_at: string }
 *
 * Upserts the note for (am, entityId).
 */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { entityId } = ctx.params;
  if (!entityId) {
    return NextResponse.json(
      { ok: false, error: "Missing entityId" },
      { status: 400 },
    );
  }
  let body: {
    am?: string;
    note?: unknown;
    customer_id?: string | null;
    bizname?: string | null;
  } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  const { am, note, customer_id, bizname } = body || {};
  if (!am) {
    return NextResponse.json(
      { ok: false, error: "Missing am" },
      { status: 400 },
    );
  }
  if (typeof note !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid note" },
      { status: 400 },
    );
  }
  try {
    const saved = await upsertNote(am, entityId, note, {
      customer_id: customer_id ?? null,
      bizname: bizname ?? null,
    });
    return NextResponse.json({
      ok: true,
      note: saved.note,
      updated_at: saved.updated_at,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
