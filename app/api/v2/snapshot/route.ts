import { NextRequest, NextResponse } from "next/server";
import { buildSnapshotV2 } from "@/lib/refresh";
import { readLatestSnapshotV2 } from "@/lib/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * GET /api/v2/snapshot
 *   → latest v2 snapshot (from Postgres, or rebuilt if missing)
 *
 * GET /api/v2/snapshot?rebuild=1
 *   → forces a rebuild
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const wantRebuild = url.searchParams.get("rebuild") === "1";

  try {
    let snap = wantRebuild ? null : await readLatestSnapshotV2();
    if (!snap) {
      snap = await buildSnapshotV2();
    }
    return NextResponse.json(snap, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
