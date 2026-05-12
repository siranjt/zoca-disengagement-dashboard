import type { ChargebeeSub } from "./types";

/**
 * Paginate Chargebee /subscriptions across `active`, `non_renewing`, `in_trial`
 * and return a deduped list. Calls are made serially (one per status,
 * 100 per page) to respect Chargebee's rate limits.
 *
 * v2: also extracts cf_entity_id (the Zoca location bound to each
 * subscription) — exposed via `fetchActiveCustomerEntityMap()`.
 */
export async function fetchAllLiveSubs(): Promise<ChargebeeSub[]> {
  const { subs } = await fetchAllLiveSubsWithEntityMap();
  return subs;
}

/**
 * v2 extension — returns both the deduped subscription list and a
 * customer_id → entity_ids[] map (from cf_entity_id custom fields).
 *
 * Used by Phase 1 to build the active-customer universe (~922 entities)
 * without depending on BaseSheet for the entity link.
 */
export async function fetchAllLiveSubsWithEntityMap(): Promise<{
  subs: ChargebeeSub[];
  customerToEntities: Map<string, string[]>;
}> {
  const site = process.env.CHARGEBEE_SITE || "zoca";
  const key = process.env.CHARGEBEE_API_KEY;
  if (!key) throw new Error("CHARGEBEE_API_KEY is not set");

  const base = `https://${site}.chargebee.com/api/v2`;
  const authHeader = "Basic " + Buffer.from(`${key}:`).toString("base64");

  const out: ChargebeeSub[] = [];
  const seen = new Set<string>();
  const customerToEntities = new Map<string, Set<string>>();

  // v2 — include "future" in addition to v1's active/non_renewing/in_trial
  for (const status of ["active", "non_renewing", "in_trial", "future"] as const) {
    let offset: string | undefined;
    let page = 0;
    do {
      const params = new URLSearchParams();
      params.set("limit", "100");
      params.set("status[is]", status);
      if (offset) params.set("offset", offset);

      const res = await fetch(`${base}/subscriptions?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: authHeader },
        cache: "no-store",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Chargebee ${status} ${res.status}: ${text.slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        list: { subscription: any; customer: any }[];
        next_offset?: string;
      };
      for (const item of data.list || []) {
        const sub = item.subscription || {};
        const cust = item.customer || {};
        const customer_id = sub.customer_id || cust.id;
        if (!customer_id || seen.has(customer_id + "::" + sub.id)) continue;
        seen.add(customer_id + "::" + sub.id);

        // v2 — capture cf_entity_id (entity bound to this subscription)
        const cfEntityId = sub.cf_entity_id || "";
        if (cfEntityId) {
          const set = customerToEntities.get(customer_id) || new Set<string>();
          set.add(cfEntityId);
          customerToEntities.set(customer_id, set);
        }

        out.push({
          subscription_id: sub.id || "",
          customer_id,
          status: sub.status || status,
          plan_amount: Number(sub.plan_amount || sub.mrr || 0),
          created_at: sub.created_at ? Number(sub.created_at) * 1000 : null,
          activated_at: sub.activated_at ? Number(sub.activated_at) * 1000 : null,
          auto_collection: cust.auto_collection || sub.auto_collection || null,
          email: cust.email || null,
          first_name: cust.first_name || null,
          last_name: cust.last_name || null,
          company: cust.company || null,
          phone: cust.phone || null,
        });
      }
      offset = data.next_offset;
      page++;
      if (page > 80) break;
    } while (offset);
  }

  // Convert Set values to sorted arrays for stable output
  const customerToEntitiesArr = new Map<string, string[]>();
  for (const [c, s] of customerToEntities) {
    customerToEntitiesArr.set(c, Array.from(s).sort());
  }

  return { subs: out, customerToEntities: customerToEntitiesArr };
}
