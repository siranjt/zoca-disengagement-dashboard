// Static config: Metabase public CSV endpoints + scoring constants.
// These UUIDs come from Zoca's Metabase and are stable.

export const METABASE_ENDPOINTS = {
  baseSheet: "https://metabase.zoca.ai/public/question/87763e8c-8084-442e-891a-df1b11e81b47.csv",
  chat:      "https://metabase.zoca.ai/public/question/10a52e37-04fa-4422-b840-803b66e033bf.csv",
  email:     "https://metabase.zoca.ai/public/question/7a5aa1f6-9205-4e83-be51-3e585aa0f4a8.csv",
  phone:     "https://metabase.zoca.ai/public/question/60797a27-c546-450d-b00b-a51b7e490143.csv",
  video:     "https://metabase.zoca.ai/public/question/d95d9354-7c84-4a57-8af5-e700580c6ecb.csv",
  sms:       "https://metabase.zoca.ai/public/question/bbaad2fb-5f9d-4249-af59-c7812851437c.csv",
} as const;

export const WINDOWS_DAYS = [7, 14, 30, 60, 90] as const;
export const COMMS_RETAIN_DAYS = 120; // how far back we keep raw events

// Composite score weights (must sum to 1.0)
export const SIG_WEIGHTS = {
  weSilent:       0.30,
  clientSilent:   0.30,
  responseDrop:   0.25,
  volumeCollapse: 0.15,
} as const;

// Tier cutoffs (composite score)
export const TIER_CUTS = {
  high:   65,
  medium: 35,
  low:    15,
} as const;

export type Tier = "HIGH" | "MEDIUM" | "LOW" | "HEALTHY";
export const TIER_ORDER: Tier[] = ["HIGH", "MEDIUM", "LOW", "HEALTHY"];

export const TIER_COLORS: Record<Tier, string> = {
  HIGH:    "#ff4fa8", // zoca bright pink
  MEDIUM:  "#ffb74d", // amber
  LOW:     "#7868f4", // zoca purple
  HEALTHY: "#76FF03", // lime green
};

export const CHANNEL_COLORS: Record<string, string> = {
  chat:  "#7868f4",
  phone: "#00E5FF",
  video: "#ff86e1",
  sms:   "#FFD54F",
  email: "#c8cafe",
};

export const SNAPSHOT_KEY = "disengagement:snapshot:latest";

// Scoring sub-constants
export const WE_SILENT_DAYS = { high: 60, med: 30, low: 14 };
export const CLIENT_SILENT_DAYS = { high: 45, med: 30, low: 14 };
export const ZERO_COMMS_BASELINE_SCORE = 85; // score applied when total_90d === 0

// ---------------------------------------------------------------------------
// Entity-level exclude list — entities that should NEVER appear in the dashboard
// regardless of their Chargebee status. Add to this when you find more orphan /
// test rows in BaseSheet. The exclusion is logged in the Data Health strip so
// you can see how many were dropped on each refresh.
// Format: { entity_id: "human-readable reason" }
// ---------------------------------------------------------------------------
export const EXCLUDED_ENTITIES: Record<string, string> = {
  "7a82fdbb-f519-4d38-b3f9-b8dfd5760d0b": "Slayishhh Blast (test account)",
  "d2c8625f-fb4a-4376-973c-b02b36593b05": "Beauty by Hailey (orphan; customer_id links to other businesses)",
  "e2ac8f53-d1d9-4bce-b61d-9b4d14d0c4cc": "Image Sun Tanning Center (orphan; customer_id links to Fortitude CrossFit)",
  "8643a977-6dc5-4fcc-a957-cbb37062eccc": "Hollywood Skin Atlanta Sugar Hill (orphan; customer_id links to Hollywood Skin Atlanta)",
};
