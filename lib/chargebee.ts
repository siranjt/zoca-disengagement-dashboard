import type { ChargebeeSub } from "./types";

/**
 * Paginate Chargebee /subscriptions across `active`, `non_renewing`, `in_trial`
 * and return a deduped list keyed by customer_id. Calls are made serially
 * (one per status, 100 per page) to respect Chargebee's rate limits.
 */
export async function fetchAllLiveSubs(): Promise<ChargebeeSub[]> {
  const site = process.env.CHARGEBEE_SITE || "zoca";
  const key = process.env.CHARGEBEE_API_KEY;
  if (!key) throw new Error("CHARGEBEE_API_KEY is not set");

  const base = `https://${site}.chargebee.com/api/v2`;
  const authHeader = "Basic " + Buffer.from(`${key}:`).toString("base64");

  const out: ChargebeeSub[] = [];
  const seen = new Set<string>();

  for (const status of ["active", "non_renewing", "in_trial"] as const) {
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
      // safety — at 100/page and ~4k live subs we'll finish in ~40 pages per status
      if (page > 80) break;
    } while (offset);
  }

  return out;
}
