import { NextRequest, NextResponse } from "next/server";
import { listViews, createView } from "@/lib/saved-views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * GET /api/v2/views?am=<am_name>
 *   → { ok: true, views: SavedView[] }
 *
 * Lists saved filter/search/sort views for an AM.
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
    const views = await listViews(am);
    return NextResponse.json({ ok: true, views });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * POST /api/v2/views
 *   body: { am: string; name: string; filter_config: object }
 *   → { ok: true, view: SavedView }
 *   → 409 { ok: false, error } if (am, name) already exists.
 *
 * Creates a new saved view. Names are unique per AM.
 */
export async function POST(req: NextRequest) {
  let body:
    | {
        am?: string;
        name?: string;
        filter_config?: Record<string, unknown>;
      }
    | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  const { am, name, filter_config } = body || {};
  if (!am || typeof am !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing am" },
      { status: 400 },
    );
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { ok: false, error: "Missing or empty name" },
      { status: 400 },
    );
  }
  if (!filter_config || typeof filter_config !== "object") {
    return NextResponse.json(
      { ok: false, error: "Missing filter_config" },
      { status: 400 },
    );
  }
  try {
    const result = await createView(am, name.trim(), filter_config);
    if (result.ok) {
      return NextResponse.json({ ok: true, view: result.view });
    }
    if ("conflict" in result && result.conflict) {
      return NextResponse.json(
        { ok: false, error: "A view with this name already exists" },
        { status: 409 },
      );
    }
    const errMsg = "error" in result ? result.error : "Unknown error";
    return NextResponse.json(
      { ok: false, error: errMsg },
      { status: 500 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
