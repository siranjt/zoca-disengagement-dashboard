import { NextRequest, NextResponse } from "next/server";
import { deleteView } from "@/lib/saved-views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type Ctx = { params: { id: string } };

/**
 * DELETE /api/v2/views/:id?am=<am_name>
 *   → { ok: true }
 *
 * Removes a saved view by (am, id). No-op if missing.
 * Inherits basic-auth from middleware.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const am = req.nextUrl.searchParams.get("am");
  if (!am) {
    return NextResponse.json(
      { ok: false, error: "Missing 'am' query param" },
      { status: 400 },
    );
  }
  const id = Number(ctx.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json(
      { ok: false, error: "Invalid id" },
      { status: 400 },
    );
  }
  try {
    await deleteView(am, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
