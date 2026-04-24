import { NextRequest, NextResponse } from "next/server";
import { readSnapshot, writeSnapshot } from "@/lib/store";
import { buildSnapshot } from "@/lib/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/snapshot
 *   → returns the latest scored snapshot from KV (or the in-memory fallback).
 *
 * GET /api/snapshot?rebuild=1
 *   → forces an on-demand rebuild (useful when KV is empty, e.g. first deploy).
 *     Still respects the shared Basic Auth gate from middleware.ts.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const wantRebuild = url.searchParams.get("rebuild") === "1";

  try {
    let snap = await readSnapshot();
    if (!snap || wantRebuild) {
      snap = await buildSnapshot();
      await writeSnapshot(snap);
    }
    return NextResponse.json(snap, {
      headers: {
        // Tell the browser not to cache — the page always asks for fresh.
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
