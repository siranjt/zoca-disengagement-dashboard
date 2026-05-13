import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const METABASE_BASE = "https://metabase.zoca.ai";

async function runQuery(database: number, sql: string): Promise<unknown> {
  const apiKey = process.env.METABASE_API_KEY;
  if (!apiKey) return { error: "METABASE_API_KEY not set" };

  try {
    const resp = await fetch(`${METABASE_BASE}/api/dataset`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        database,
        type: "native",
        native: { query: sql },
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { error: `HTTP ${resp.status}: ${text.slice(0, 300)}` };
    }
    const data = await resp.json();
    const rows = data?.data?.rows ?? [];
    const cols = (data?.data?.cols ?? []).map((c: { name: string }) => c.name);
    return {
      rowCount: rows.length,
      columns: cols,
      sample: rows.slice(0, 5),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Phase 14.4 diagnostic — confirms which Aurora tables actually expose
 * a flat entity_id -> place_id mapping. After Metabase inspection we
 * know gbp.locations only has place_id inside metadata JSONB, while
 * local_seo.rank and local_seo.competitors both have place_id as a
 * top-level column. This endpoint sanity-checks all three so future
 * debugging hits the right tables.
 */
export async function GET() {
  const queries = [
    {
      name: "local_seo.rank",
      sql: "SELECT DISTINCT entity_id, place_id FROM local_seo.rank WHERE place_id IS NOT NULL AND place_id != '' LIMIT 5",
    },
    {
      name: "gbp.locations.metadata",
      sql: "SELECT entity_id, metadata->>'place_id' AS place_id FROM gbp.locations WHERE metadata->>'place_id' IS NOT NULL LIMIT 5",
    },
    {
      name: "local_seo.competitors",
      sql: "SELECT DISTINCT entity_id, place_id FROM local_seo.competitors WHERE place_id IS NOT NULL AND place_id != '' LIMIT 5",
    },
  ];

  const results: Record<string, unknown> = {};
  for (const q of queries) {
    results[q.name] = await runQuery(7, q.sql);
  }
  return NextResponse.json(results);
}
