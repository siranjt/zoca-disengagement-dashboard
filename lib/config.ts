// Static config: Metabase public CSV endpoints + scoring constants.
// These UUIDs come from Zoca's Metabase and are stable.

export const METABASE_ENDPOINTS = {
  baseSheet: "https://metabase.zoca.ai/public/question/87763e8c-8084-442e-891a-df1b11e81b47.csv",
  chat:      "https://metabase.zoca.ai/public/question/10a52e37-04fa-4422-b840-803b66e033bf.csv",
  email:     "https://metabase.zoca.ai/public/question/7a5aa1f6-9205-4e83-be51-3e585aa0f4a8.csv",
  phone:     "https://metabase.zoca.ai/public/question/60797a27-c546-450d-b00b-a51b7e490143.csv",
  video:     "https://metabase.zoca.ai/public/question/d95d9354-7c84-4a57-8af5-e700580c6ecb.csv",
  sms:       "https://metabase.zoca.ai/public/question/bbaad2fb-5f9d-4249-af59-c7812851437c.csv",
  // Phase 31.v2 — single Metabase CSV maintained by the Zoca team. Replaces
  // the HubSpot Service Hub + Linear GraphQL adapters that v1 used. The CSV
  // already filters to "active states + closed/canceled in last 30 days".
  tickets:   "https://metabase.zoca.ai/public/question/a80bac40-c055-4867-a778-9ee1f29053ca.csv",
} as const;

// ---------------------------------------------------------------------------
// v2 rework — new Metabase cards backing product-usage + performance signals
// All 6 cards live as of 2026-05-12. See docs/v2-design.md Appendix A.
// ---------------------------------------------------------------------------
export const METABASE_V2_ENDPOINTS = {
  mixpanelRollup:    "https://metabase.zoca.ai/public/question/b0809829-84ed-4e15-9857-2a54bf6d6e10.csv",
  gbpClicksMonthly:  "https://metabase.zoca.ai/public/question/fbed2414-174f-4d0d-9742-9d916447b4c1.csv",
  rankings:          "https://metabase.zoca.ai/public/question/fb6cd09f-e6f2-4a33-b7c8-d9cca1e10252.csv",
  reviews12w:        "https://metabase.zoca.ai/public/question/291e294a-2b9a-48e6-8952-35d6ba9a49e4.csv",
  locationInsights:  "https://metabase.zoca.ai/public/question/2da65c3d-2cda-406a-984c-ef4730cdb027.csv",
  bookingEnquiries:  "https://metabase.zoca.ai/public/question/1aa92a55-824d-4606-a26e-6239353beb93.csv",
} as const;

export const WINDOWS_DAYS = [7, 14, 30, 60, 90] as const;
export const COMMS_RETAIN_DAYS = 120;

// ---------------------------------------------------------------------------
// Phase 31.v2 — tickets staleness threshold + per-customer record cap.
// "Stale" applies only to open tickets (is_closed=false). The cap keeps the
// snapshot payload bounded in customers with runaway ticket volume.
// ---------------------------------------------------------------------------
export const TICKETS_STALE_DAYS = 7;
export const TICKETS_MAX_RECORDS_PER_CUSTOMER = 20;

// ---------------------------------------------------------------------------
// v1 composite weights (kept for backward compatibility with existing dashboard)
// ---------------------------------------------------------------------------
export const SIG_WEIGHTS = {
  weSilent:       0.30,
  clientSilent:   0.30,
  responseDrop:   0.25,
  volumeCollapse: 0.15,
} as const;

// ---------------------------------------------------------------------------
// v2 hybrid composite weights — Comms 50% / Usage 30% / Billing 20%
// Internal comms sub-weights sum to 0.5; absolute weights when flattened.
// ---------------------------------------------------------------------------
export const SIG_WEIGHTS_V2 = {
  // Comms pillar (sums to 0.50)
  weSilent:       0.15,
  clientSilent:   0.15,
  responseDrop:   0.12,
  volumeCollapse: 0.08,
  // Product usage (Mixpanel)
  usage:          0.30,
  // Billing health (Chargebee invoices + transactions)
  billing:        0.20,
} as const;

// Sanity: weights must sum to 1.0
export const SIG_WEIGHTS_V2_SUM = Object.values(SIG_WEIGHTS_V2).reduce((a, b) => a + b, 0);

export const TIER_CUTS = {
  high:   65,
  medium: 35,
  low:    15,
} as const;

export type Tier = "HIGH" | "MEDIUM" | "LOW" | "HEALTHY";
export const TIER_ORDER: Tier[] = ["HIGH", "MEDIUM", "LOW", "HEALTHY"];

// ---------------------------------------------------------------------------
// v2 AM-facing stoplight (3 colors). Internal 5-tier model still exists in
// lib/scoring.ts; this is the display-layer compression for AM-facing UI.
// ---------------------------------------------------------------------------
export type Stoplight = "RED" | "YELLOW" | "GREEN";
export const STOPLIGHT_LABELS: Record<Stoplight, string> = {
  RED:    "Needs attention",
  YELLOW: "Keep an eye on",
  GREEN:  "Doing fine",
};

/** Map internal 5-tier (+ WATCH lane + billing override) to AM-facing 3-color stoplight */
export function tierToStoplight(
  tier: Tier,
  flagCount: number,
  billingScore: number = 0,
): Stoplight {
  if (tier === "HIGH") return "RED";
  if (tier === "MEDIUM") return "YELLOW";
  // Billing crisis override: stacked unpaid invoices always surface, even with
  // otherwise-active comms/usage. Phase 1.2 finding from cohort validation.
  if (billingScore >= BILLING_YELLOW_OVERRIDE) return "YELLOW";
  // WATCH lane: HEALTHY/LOW with 2+ modifier flags surfaces as Yellow
  if ((tier === "LOW" || tier === "HEALTHY") && flagCount >= 2) return "YELLOW";
  return "GREEN";
}

export const TIER_COLORS: Record<Tier, string> = {
  HIGH:    "#ff4fa8",
  MEDIUM:  "#ffb74d",
  LOW:     "#7868f4",
  HEALTHY: "#76FF03",
};

export const STOPLIGHT_COLORS: Record<Stoplight, string> = {
  RED:    "#ef4444",
  YELLOW: "#f59e0b",
  GREEN:  "#10b981",
};

export const CHANNEL_COLORS: Record<string, string> = {
  chat:  "#7868f4",
  phone: "#00E5FF",
  video: "#ff86e1",
  sms:   "#FFD54F",
  email: "#c8cafe",
};

export const SNAPSHOT_KEY = "disengagement:snapshot:latest";

export const WE_SILENT_DAYS = { high: 60, med: 30, low: 14 };
export const CLIENT_SILENT_DAYS = { high: 45, med: 30, low: 14 };
export const ZERO_COMMS_BASELINE_SCORE = 85;

// ---------------------------------------------------------------------------
// v2 — Product-usage scoring (Mixpanel-derived)
// Engagement tier thresholds based on 30-day event counts + last-open recency
// ---------------------------------------------------------------------------
export type EngagementTier = "Active" | "Light" | "Cold" | "Dormant";

export const USAGE_TIER_THRESHOLDS = {
  // Active: opened app on 10+ distinct days in last 30
  activeDistinctDaysMin: 10,
  // Light: opened on 3-9 days in last 30
  lightDistinctDaysMin: 3,
  // Cold: opened on 1-2 days OR no opens but other events in last 30
  // Dormant: zero events in last 30 days
} as const;

// Map engagement tier → 0-100 usage signal risk score
export const USAGE_TIER_TO_SCORE: Record<EngagementTier, number> = {
  Active:  10,
  Light:   35,
  Cold:    65,
  Dormant: 95,
};

export const ZERO_MIXPANEL_BASELINE_SCORE = 100;

// ---------------------------------------------------------------------------
// v2 — Billing health scoring
// ---------------------------------------------------------------------------
export const BILLING_THRESHOLDS = {
  // Unpaid invoice count thresholds (sub-score 0-100)
  unpaidCount: { high: 3, med: 2, low: 1 },
  // Days past oldest unpaid invoice
  daysOverdue: { high: 30, med: 15, low: 7 },
  // Auto-debit-off with recent failures → bonus risk
  autoDebitOffWithFailuresBonus: 25,
  // ACH in-progress → negative modifier (payment on the way)
  achInProgressDiscount: 15,
} as const;

// ---------------------------------------------------------------------------
// v2 — Performance trajectory flag thresholds
// ---------------------------------------------------------------------------
export const PERFORMANCE_FLAG_THRESHOLDS = {
  gbpClicksDropPctMin: 25,    // GBP clicks down ≥25% on complete-month basis
  ytdLeadsDropPctMin:  20,    // YTD leads trailing same period last year ≥20%
  // Note: rankings-degradation flag requires a rank-when-joined baseline which
  // the current Metabase card doesn't carry. Removed to avoid implying a
  // signal that doesn't fire. Re-add when the baseline lands.
  weeksWithZeroReviewsMin: 4, // 4+ weeks with zero reviews in last 12 weeks
} as const;

// ---------------------------------------------------------------------------
// v2 — WATCH lane: HEALTHY/LOW with 2+ modifier flags → AM-facing Yellow
// ---------------------------------------------------------------------------
export const WATCH_LANE_FLAG_COUNT = 2;

// v2 — Billing crisis override: any customer with billing_score >= this threshold
// surfaces at least YELLOW in the stoplight regardless of composite/tier.
// Catches the 'fresh comms + active app + stacked unpaid invoices' edge case.
export const BILLING_YELLOW_OVERRIDE = 40;

// ---------------------------------------------------------------------------
// v2 — Pods (per AM Transition Toolkit, hardcoded May 2026)
// ---------------------------------------------------------------------------
export const POD_MAP: Record<string, string> = {
  "Kanak sharma":   "Pod 1",
  "Sudha Goutami":  "Pod 1",
  "Santhosh V":     "Pod 1",
  "Hubern C":       "Pod 2",
  "Sakshi Mamgain": "Pod 2",
  "Bikash Mishra":  "Pod 3",
  "Anu Srivastava": "Pod 3",
  "Apurvaa Biswas": "Pod 4",
  "Atharv Y":       "Pod 4",
  "Shruti Sinha":   "Pod 4",
  "Taanya Solanki": "Pod 4",
  "Siddhi Shetty":  "Pod 5",
  "Kripali Suri":   "Pod 5",
  "Nikita Singh":   "Floating",
};

// Active AM list (May 2026)
export const ACTIVE_AMS = [
  "Sudha Goutami", "Sakshi Mamgain", "Hubern C", "Bikash Mishra", "Anu Srivastava",
  "Kanak sharma", "Atharv Y", "Santhosh V", "Shruti Sinha", "Apurvaa Biswas",
  "Siddhi Shetty", "Nikita Singh", "Kripali Suri",
] as const;

export const INCOMING_AMS = ["Taanya Solanki"] as const;

// ---------------------------------------------------------------------------
// Postgres (Neon) — for v2 snapshot history + AM actions + signal feedback
// POSTGRES_URL is auto-injected by Vercel when Neon is connected as Storage
// ---------------------------------------------------------------------------
export function pgConfigured(): boolean {
  return !!process.env.POSTGRES_URL;
}

export const SNAPSHOT_RETENTION_DAYS = 90;

// ---------------------------------------------------------------------------
// Entity-level exclude list
// ---------------------------------------------------------------------------
export const EXCLUDED_ENTITIES: Record<string, string> = {
  "7a82fdbb-f519-4d38-b3f9-b8dfd5760d0b": "Slayishhh Blast (test account)",
  "d2c8625f-fb4a-4376-973c-b02b36593b05": "Beauty by Hailey (orphan; customer_id links to other businesses)",
  "e2ac8f53-d1d9-4bce-b61d-9b4d14d0c4cc": "Image Sun Tanning Center (orphan; customer_id links to Fortitude CrossFit)",
  "8643a977-6dc5-4fcc-a957-cbb37062eccc": "Hollywood Skin Atlanta Sugar Hill (orphan; customer_id links to Hollywood Skin Atlanta)",
};
