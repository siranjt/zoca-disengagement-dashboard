import Papa from "papaparse";
import { METABASE_ENDPOINTS, COMMS_RETAIN_DAYS } from "./config";
import type { BaseSheetRow, CommsEvent } from "./types";

async function fetchCsvText(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    cache: "no-store",
    // Metabase public CSV is stable; 60s revalidate is fine for cron retries
    headers: { Accept: "text/csv" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Metabase CSV ${url} ${res.status}: ${text.slice(0, 200)}`);
  }
  return await res.text();
}

function parseRows<T extends Record<string, string>>(csv: string): T[] {
  const out = Papa.parse<T>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  return (out.data || []).filter((r) => r && typeof r === "object");
}

/** Fetch BaseSheet and return rows + lookup-by-customer_id + lookup-by-entity_id */
export async function fetchBaseSheet(): Promise<{
  rows: BaseSheetRow[];
  byCustomerId: Record<string, BaseSheetRow>;
  byEntityId: Record<string, BaseSheetRow>;
}> {
  const csv = await fetchCsvText(METABASE_ENDPOINTS.baseSheet);
  const raw = parseRows<Record<string, string>>(csv);
  const rows: BaseSheetRow[] = raw.map((r) => ({
    entity_id: (r["entity_id"] || "").trim(),
    customer_id: (r["customer_id"] || "").trim(),
    bizname: r["bizname"] || "",
    am_name: r["am_name"] || "",
    ae_name: r["ae_name"] || "",
    sp_name: r["sp_name"] || "",
    app_email: r["app_email"] || "",
    phone_number: r["phone_number"] || "",
    total_monthly_revenue: r["total_monthly_revenue"] || "",
    chrone_zoca_status: r["chrone_zoca_status"] || "",
    churn_potential_flag: r["churn_potential_flag"] || "",
    churn_potential_status: r["churn_potential_status"] || "",
    ob_date: r["ob_date"] || "",
  }));
  const byCustomerId: Record<string, BaseSheetRow> = {};
  const byEntityId: Record<string, BaseSheetRow> = {};
  for (const r of rows) {
    if (r.customer_id) byCustomerId[r.customer_id] = r;
    if (r.entity_id) byEntityId[r.entity_id] = r;
  }
  return { rows, byCustomerId, byEntityId };
}

function parseTs(s: string | undefined): number | null {
  if (!s) return null;
  const clean = s.trim();
  if (!clean) return null;
  const t = Date.parse(clean.endsWith("Z") ? clean : clean.includes("+") ? clean : clean + "Z");
  return Number.isFinite(t) ? t : null;
}

/**
 * Fetch + normalize all 5 comms feeds into a single array of CommsEvent.
 * Filters to the last COMMS_RETAIN_DAYS days to keep memory sane.
 *
 * Directionality rules:
 *  - Chat:  Member Type = "Team Member" → out, "User" → in (Assistant/bot skipped)
 *  - Email: Sender = "Received_By_Client" → out (we sent), "Sent_By_Client" → in
 *  - Phone: Sender = "Initiated_By_Us" → out, "Initiated_By_Client" → in
 *  - Video: counted as mutual — one in + one out per meeting
 *  - SMS:   Sender = "Received_By_Client" → out, "Sent_By_Client" → in
 */
export async function fetchAllComms(todayMs: number): Promise<CommsEvent[]> {
  const cutoff = todayMs - COMMS_RETAIN_DAYS * 86400 * 1000;

  const [chatCsv, emailCsv, phoneCsv, videoCsv, smsCsv] = await Promise.all([
    fetchCsvText(METABASE_ENDPOINTS.chat),
    fetchCsvText(METABASE_ENDPOINTS.email),
    fetchCsvText(METABASE_ENDPOINTS.phone),
    fetchCsvText(METABASE_ENDPOINTS.video),
    fetchCsvText(METABASE_ENDPOINTS.sms),
  ]);

  const out: CommsEvent[] = [];
  const push = (eid: string, ts: number | null, channel: CommsEvent["channel"], direction: CommsEvent["direction"]) => {
    if (!eid || ts === null || ts < cutoff) return;
    out.push({ entityId: eid, ts, channel, direction });
  };

  // Chat
  for (const r of parseRows<Record<string, string>>(chatCsv)) {
    const eid = (r["Entity ID"] || "").trim();
    const ts = parseTs(r["Created At"]);
    const mt = r["Member Type"];
    if (mt === "Team Member") push(eid, ts, "chat", "out");
    else if (mt === "User") push(eid, ts, "chat", "in");
    // Assistant etc. → skip
  }
  // Email
  for (const r of parseRows<Record<string, string>>(emailCsv)) {
    const eid = (r["Entity ID"] || "").trim();
    const ts = parseTs(r["Created At"]);
    const s = r["Sender"];
    if (s === "Received_By_Client") push(eid, ts, "email", "out");
    else if (s === "Sent_By_Client") push(eid, ts, "email", "in");
  }
  // Phone
  for (const r of parseRows<Record<string, string>>(phoneCsv)) {
    const eid = (r["Entity ID"] || "").trim();
    const ts = parseTs(r["Created At"]);
    const s = r["Sender"];
    if (s === "Initiated_By_Us") push(eid, ts, "phone", "out");
    else if (s === "Initiated_By_Client") push(eid, ts, "phone", "in");
  }
  // Video — mutual engagement
  for (const r of parseRows<Record<string, string>>(videoCsv)) {
    const eid = (r["Entity ID"] || "").trim();
    const ts = parseTs(r["Created At"]);
    push(eid, ts, "video", "in");
    push(eid, ts, "video", "out");
  }
  // SMS
  for (const r of parseRows<Record<string, string>>(smsCsv)) {
    const eid = (r["Entity ID"] || "").trim();
    const ts = parseTs(r["Created At"]);
    const s = r["Sender"];
    if (s === "Received_By_Client") push(eid, ts, "sms", "out");
    else if (s === "Sent_By_Client") push(eid, ts, "sms", "in");
  }

  return out;
}

/**
 * Group comms events by entity_id for quick per-customer lookup.
 */
export function groupCommsByEntity(events: CommsEvent[]): Map<string, CommsEvent[]> {
  const m = new Map<string, CommsEvent[]>();
  for (const e of events) {
    const arr = m.get(e.entityId);
    if (arr) arr.push(e);
    else m.set(e.entityId, [e]);
  }
  return m;
}
