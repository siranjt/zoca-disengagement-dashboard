import { NextResponse } from "next/server";
import { readLatestSnapshotV2 } from "@/lib/postgres";
import { getCoachingPerAm, type CoachingRow } from "@/lib/coaching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 27 — Coaching loops rollup.
 *
 * GET /api/v2/coaching          → rows for every AM
 * GET /api/v2/coaching?am=Foo   → single-element rows array filtered to Foo
 *
 * Response: { ok, generatedAt, rows: CoachingRow[] }.
 * Empty rows array is the expected response when there's no snapshot or DB
 * yet — the UI renders a friendly empty state in that case, NOT an error.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const amFilter = url.searchParams.get("am");

  try {
    const snapshot = await readLatestSnapshotV2();
    if (!snapshot) {
      return NextResponse.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        rows: [] as CoachingRow[],
      });
    }
    const allRows = await getCoachingPerAm(snapshot);
    const rows = amFilter
      ? allRows.filter((r) => r.am_name === amFilter)
      : allRows;
    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      rows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg, rows: [] as CoachingRow[] },
      { status: 500 },
    );
  }
}
