import type { Tier } from "./config";

/** Raw Chargebee subscription (slimmed) */
export type ChargebeeSub = {
  subscription_id: string;
  customer_id: string;
  status: string;
  plan_amount: number;      // in cents
  created_at: number | null;
  activated_at: number | null;
  auto_collection: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  phone: string | null;
};

/** Metabase BaseSheet row (slimmed — only the fields we use) */
export type BaseSheetRow = {
  entity_id: string;
  customer_id: string;
  bizname: string;
  am_name: string;
  ae_name: string;
  sp_name: string;
  app_email: string;
  phone_number: string;
  total_monthly_revenue: string;
  chrone_zoca_status: string;
  churn_potential_flag: string;
  churn_potential_status: string;
  ob_date: string;
};

/** A single comms event (after normalization across all 5 channels) */
export type CommsEvent = {
  entityId: string;
  ts: number;                      // epoch ms
  channel: "chat" | "email" | "phone" | "video" | "sms";
  direction: "in" | "out";
};

/** Per-window metrics for a single customer */
export type CustomerMetrics = {
  total_7d: number;  in_7d: number;  out_7d: number;  channels_7d: number;
  total_14d: number; in_14d: number; out_14d: number; channels_14d: number;
  total_30d: number; in_30d: number; out_30d: number; channels_30d: number;
  total_60d: number; in_60d: number; out_60d: number; channels_60d: number;
  total_90d: number; in_90d: number; out_90d: number; channels_90d: number;
  channels_used_30d: string;
  channels_used_90d: string;
  last_any_iso: string | null;
  last_in_iso: string | null;
  last_out_iso: string | null;
  days_since_in: number;    // 9999 = never
  days_since_out: number;   // 9999 = never
};

/** Scored signals for a single customer */
export type CustomerSignals = {
  score: number;
  tier: Tier;
  sig_we_silent: number;
  sig_client_silent: number;
  sig_response_drop: number;
  sig_volume_collapse: number;
  notes: string;
};

/** Full scored customer row (joined Chargebee + BaseSheet + metrics + signals) */
export type ScoredCustomer = {
  // identity
  customer_id: string;
  entity_id: string;
  subscription_id: string;
  company: string;
  email: string;
  phone: string;
  am_name: string;
  ae_name: string;
  sp_name: string;
  // commercial
  cb_status: string;
  auto_collection: string | null;
  plan_amount: number;
  mrr_basesheet: string;
  zoca_status: string;
  churn_potential_flag: string;
  activated_at: string | null;
  ob_date: string;
  // metrics
  metrics: CustomerMetrics;
  // signals
  signals: CustomerSignals;
};

/** Snapshot stored in KV */
export type Snapshot = {
  generatedAt: string;      // ISO
  todayIso: string;         // ISO, used as the "as-of" anchor for windows
  totalActive: number;
  tierCounts: Record<Tier, number>;
  signalCounts: {
    we_silent_any: number;
    client_silent_any: number;
    response_drop_any: number;
    volume_collapse_any: number;
  };
  channelCounts: {
    d30: Record<string, number>;
    d90: Record<string, number>;
  };
  amExposure: { am: string; high: number; total: number }[];
  customers: ScoredCustomer[];
  stats: {
    total_comms_90d: number;
    median_30d: number;
    mean_30d: number;
    median_90d: number;
    mean_90d: number;
    fetch_duration_ms: number;
  };
  errors?: string[];
};

/** Refresh result (what cron returns) */
export type RefreshResult = {
  ok: boolean;
  generatedAt: string;
  totalActive: number;
  durationMs: number;
  errors: string[];
};
