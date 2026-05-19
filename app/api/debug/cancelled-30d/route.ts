import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Phase 33.scope diagnostic — isolate the cancelled-30d Chargebee fetch.
 *
 * Tests whether the Vercel runtime can successfully call Chargebee's
 * /subscriptions endpoint with status[is]=cancelled and cancelled_at[after],
 * independent of lib/chargebee.ts. If this returns non-zero counts, the
 * Chargebee fetch works on Vercel and the bug is downstream in the
 * runStageA universe-merge. If this returns zero counts, the bug is in
 * the fetch itself (URL encoding, auth header, network path, etc).
 *
 * Auth: same bearer as cron routes (CRON_SECRET).
 */
export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const site = process.env.CHARGEBEE_SITE || "zoca";
  const key = process.env.CHARGEBEE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "CHARGEBEE_API_KEY env var is not set" },
      { status: 500 },
    );
  }

  const base = `https://${site}.chargebee.com/api/v2`;
  const authHeader = "Basic " + Buffer.from(`${key}:`).toString("base64");

  const cutoffSec = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const cutoffIso = new Date(cutoffSec * 1000).toISOString();
  const fetchedAtIso = new Date().toISOString();

  type Sub = {
    id?: string;
    customer_id?: string;
    cf_entity_id?: string;
    cancelled_at?: number;
    activated_at?: number;
    status?: string;
  };

  const allSubs: Sub[] = [];
  let offset: string | undefined;
  let pages = 0;
  let lastUrl = "";
  let lastStatus = 0;
  let lastError = "";

  try {
    do {
      const params = new URLSearchParams();
      params.set("limit", "100");
      params.set("status[is]", "cancelled");
      params.set("cancelled_at[after]", String(cutoffSec));
      if (offset) params.set("offset", offset);

      const url = `${base}/subscriptions?${params.toString()}`;
      lastUrl = url;

      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: authHeader },
        cache: "no-store",
      });
      lastStatus = res.status;
      if (!res.ok) {
        const text = await res.text();
        lastError = text.slice(0, 300);
        return NextResponse.json(
          {
            ok: false,
            stage: "chargebee_fetch",
            httpStatus: lastStatus,
            url: lastUrl,
            chargebeeError: lastError,
          },
          { status: 502 },
        );
      }

      const data = (await res.json()) as {
        list: { subscription: Sub }[];
        next_offset?: string;
      };
      for (const item of data.list || []) {
        allSubs.push(item.subscription || {});
      }
      offset = data.next_offset;
      pages++;
      if (pages > 10) break; // bound — 100 * 10 = 1000 subs max, plenty for diag
    } while (offset);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        stage: "exception",
        error: msg,
        lastUrl,
        lastStatus,
      },
      { status: 500 },
    );
  }

  const distinctCustomers = new Set<string>();
  const distinctEntities = new Set<string>();
  let withCfEntityId = 0;
  for (const s of allSubs) {
    if (s.customer_id) distinctCustomers.add(s.customer_id);
    if (s.cf_entity_id) {
      withCfEntityId++;
      distinctEntities.add(s.cf_entity_id);
    }
  }

  const sample = allSubs.slice(0, 5).map((s) => ({
    id: s.id || null,
    customer_id: s.customer_id || null,
    cf_entity_id: s.cf_entity_id || null,
    status: s.status || null,
    cancelled_at: s.cancelled_at
      ? new Date(s.cancelled_at * 1000).toISOString()
      : null,
    activated_at: s.activated_at
      ? new Date(s.activated_at * 1000).toISOString()
      : null,
  }));

  return NextResponse.json({
    ok: true,
    fetchedAtIso,
    cutoffIso,
    pagesFetched: pages,
    totalSubs: allSubs.length,
    withCfEntityId,
    distinctCustomers: distinctCustomers.size,
    distinctEntities: distinctEntities.size,
    sample,
  });
}

export const POST = GET;
