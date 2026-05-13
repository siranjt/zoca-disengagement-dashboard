/**
 * Metabase Dataset API client — entity_id → place_id resolver.
 *
 * Reads Aurora's `gbp.locations` (database id 7) to map every Chargebee
 * entity_id to a Google place_id. The HubSpot integration in Stage D keys
 * companies by place_id; before Phase 14 we only had bizname to join on,
 * which matched ~84% of customers. place_id should lift that to ~99%.
 *
 * Auth: `x-api-key: ${METABASE_API_KEY}`. When the env var is unset (the
 * common dev case until the key lands in Vercel), this module logs and
 * returns an empty Map — every downstream caller falls back to bizname
 * cleanly, matching the rest of the HubSpot stack's graceful-degrade
 * pattern.
 */

const METABASE_BASE = "https://metabase.zoca.ai";
const AURORA_DB_ID = 7;
const REQUEST_TIMEOUT_MS = 15_000;

export function metabaseDatasetApiConfigured(): boolean {
  return !!process.env.METABASE_API_KEY;
}

type DatasetResponseRow = Record<string, unknown>;

type DatasetResponse = {
  data?: {
    rows?: unknown[][];
    cols?: Array<{ name: string }>;
  };
  error?: string;
};

/**
 * Run a parameterized native SQL query against a Metabase database.
 * Returns an array of row objects keyed by column name (Metabase ships
 * back rows-of-arrays plus a cols array, so we re-shape here).
 *
 * Errors are converted to console warnings + empty result — callers must
 * never crash the snapshot pipeline because the optional Dataset API is
 * down.
 */
async function runDatasetQuery(args: {
  database: number;
  sql: string;
  templateTags?: Record<string, unknown>;
  parameters?: Array<Record<string, unknown>>;
}): Promise<DatasetResponseRow[]> {
  const apiKey = process.env.METABASE_API_KEY;
  if (!apiKey) {
    console.log("[metabase-dataset] METABASE_API_KEY not set — skipping query");
    return [];
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${METABASE_BASE}/api/dataset`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        Accept: "application/json",
      },
      body: JSON.stringify({
        database: args.database,
        type: "native",
        native: {
          query: args.sql,
          "template-tags": args.templateTags ?? {},
        },
        parameters: args.parameters ?? [],
      }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      console.warn(`[metabase-dataset] ${res.status}: ${text.slice(0, 200)}`);
      return [];
    }
    const json = (await res.json()) as DatasetResponse;
    if (json.error) {
      console.warn(`[metabase-dataset] error: ${String(json.error).slice(0, 200)}`);
      return [];
    }
    const rows = json.data?.rows ?? [];
    const cols = (json.data?.cols ?? []).map((c) => c.name);
    return rows.map((row) => {
      const obj: DatasetResponseRow = {};
      for (let i = 0; i < cols.length; i += 1) {
        obj[cols[i]] = (row as unknown[])[i];
      }
      return obj;
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[metabase-dataset] fetch error: ${msg}`);
    return [];
  }
}

/**
 * Resolve a list of entity_ids -> place_ids via Aurora's gbp.locations.
 * Returns a Map keyed by entity_id. Entities without a place_id (no GBP
 * connected yet) are simply absent from the Map — callers should treat
 * missing keys as "fall back to bizname join."
 */
export async function fetchPlaceIdsForEntities(
  entityIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!entityIds.length) return out;
  if (!metabaseDatasetApiConfigured()) return out;

  const sql = `
    SELECT entity_id, place_id
    FROM gbp.locations
    WHERE entity_id = ANY({{entity_ids}}::uuid[])
      AND place_id IS NOT NULL
      AND place_id != ''
  `;

  const rows = await runDatasetQuery({
    database: AURORA_DB_ID,
    sql,
    templateTags: {
      entity_ids: {
        id: "entity_ids",
        name: "entity_ids",
        "display-name": "entity_ids",
        type: "text",
      },
    },
    parameters: [
      {
        type: "category",
        target: ["variable", ["template-tag", "entity_ids"]],
        value: entityIds,
      },
    ],
  });

  for (const r of rows) {
    const eid = String(r.entity_id || "").trim();
    const pid = String(r.place_id || "").trim();
    if (eid && pid) out.set(eid, pid);
  }
  console.log(
    `[metabase-place-id] resolved ${out.size}/${entityIds.length} entity_ids -> place_ids`,
  );
  return out;
}
