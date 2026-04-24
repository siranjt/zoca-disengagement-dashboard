import {
  SIG_WEIGHTS,
  TIER_CUTS,
  WE_SILENT_DAYS,
  CLIENT_SILENT_DAYS,
  ZERO_COMMS_BASELINE_SCORE,
} from "./config";
import type { CommsEvent, CustomerMetrics, CustomerSignals } from "./types";
import type { Tier } from "./config";

const DAY_MS = 86400 * 1000;

/** Compute per-window comms metrics for a customer given their events */
export function computeMetrics(events: CommsEvent[], todayMs: number): CustomerMetrics {
  const windowCuts = [7, 14, 30, 60, 90] as const;
  const counts: Record<number, { total: number; in: number; out: number; chs: Set<string> }> = {};
  for (const w of windowCuts) {
    counts[w] = { total: 0, in: 0, out: 0, chs: new Set<string>() };
  }

  let lastAny: number | null = null;
  let lastIn: number | null = null;
  let lastOut: number | null = null;

  for (const e of events) {
    if (lastAny === null || e.ts > lastAny) lastAny = e.ts;
    if (e.direction === "in" && (lastIn === null || e.ts > lastIn)) lastIn = e.ts;
    if (e.direction === "out" && (lastOut === null || e.ts > lastOut)) lastOut = e.ts;

    const ageDays = (todayMs - e.ts) / DAY_MS;
    for (const w of windowCuts) {
      if (ageDays < w) {
        counts[w].total += 1;
        counts[w][e.direction] += 1;
        counts[w].chs.add(e.channel);
      }
    }
  }

  const daysSince = (t: number | null) =>
    t === null ? 9999 : Math.max(0, Math.floor((todayMs - t) / DAY_MS));

  const ch30 = Array.from(counts[30].chs).sort();
  const ch90 = Array.from(counts[90].chs).sort();

  return {
    total_7d: counts[7].total,  in_7d: counts[7].in,  out_7d: counts[7].out,  channels_7d: counts[7].chs.size,
    total_14d: counts[14].total, in_14d: counts[14].in, out_14d: counts[14].out, channels_14d: counts[14].chs.size,
    total_30d: counts[30].total, in_30d: counts[30].in, out_30d: counts[30].out, channels_30d: counts[30].chs.size,
    total_60d: counts[60].total, in_60d: counts[60].in, out_60d: counts[60].out, channels_60d: counts[60].chs.size,
    total_90d: counts[90].total, in_90d: counts[90].in, out_90d: counts[90].out, channels_90d: counts[90].chs.size,
    channels_used_30d: ch30.join(","),
    channels_used_90d: ch90.join(","),
    last_any_iso: lastAny !== null ? new Date(lastAny).toISOString() : null,
    last_in_iso: lastIn !== null ? new Date(lastIn).toISOString() : null,
    last_out_iso: lastOut !== null ? new Date(lastOut).toISOString() : null,
    days_since_in: daysSince(lastIn),
    days_since_out: daysSince(lastOut),
  };
}

function tierFor(score: number, total90d: number): Tier {
  if (total90d === 0) return "HIGH";
  if (score >= TIER_CUTS.high) return "HIGH";
  if (score >= TIER_CUTS.medium) return "MEDIUM";
  if (score >= TIER_CUTS.low) return "LOW";
  return "HEALTHY";
}

/**
 * Score the 4 signals and produce a composite + tier, mirroring analyze.py exactly.
 */
export function scoreCustomer(m: CustomerMetrics): CustomerSignals {
  const notes: string[] = [];

  // Signal 3: We went silent (days since we last reached out)
  let sWeSilent = 0;
  const dso = m.days_since_out;
  if (dso >= WE_SILENT_DAYS.high) {
    sWeSilent = 100;
    notes.push(`We haven't reached out in ${dso === 9999 ? "ever" : dso + "d"}`);
  } else if (dso >= WE_SILENT_DAYS.med) {
    sWeSilent = 70;
    notes.push(`We haven't reached out in ${dso}d`);
  } else if (dso >= WE_SILENT_DAYS.low) {
    sWeSilent = 30;
  }

  // Signal 2: Client went silent (only if historically active)
  let sClientSilent = 0;
  const dsi = m.days_since_in;
  const hadHistory = m.in_90d - m.in_30d > 0; // inbound in days 30..90
  if (hadHistory) {
    if (dsi >= CLIENT_SILENT_DAYS.high) {
      sClientSilent = 100;
      notes.push(`Client silent ${dsi}d (was active before)`);
    } else if (dsi >= CLIENT_SILENT_DAYS.med) {
      sClientSilent = 70;
      notes.push(`Client silent ${dsi}d`);
    } else if (dsi >= CLIENT_SILENT_DAYS.low) {
      sClientSilent = 30;
    }
  }

  // Signal 1: Response rate dropped (last 30d vs days 30..90)
  let sResponseDrop = 0;
  const in30 = m.in_30d;
  const out30 = m.out_30d;
  const inPrior = m.in_90d - m.in_30d;
  const outPrior = m.out_90d - m.out_30d;
  const rate = (i: number, o: number) => (o > 0 ? i / Math.max(o, 1) : null);
  const rRecent = rate(in30, out30);
  const rPrior = rate(inPrior, outPrior);
  if (rPrior !== null && rPrior > 0.05 && rRecent !== null) {
    const drop = (rPrior - rRecent) / rPrior;
    if (drop >= 0.75 && out30 >= 2) {
      sResponseDrop = 100;
      notes.push(`Response rate collapsed (${rPrior.toFixed(2)}→${rRecent.toFixed(2)})`);
    } else if (drop >= 0.5 && out30 >= 2) {
      sResponseDrop = 70;
      notes.push(`Response rate down ${Math.round(drop * 100)}%`);
    } else if (drop >= 0.3 && out30 >= 2) {
      sResponseDrop = 40;
    }
  }

  // Signal 4: Volume collapse + channel narrowing
  let sVolumeCollapse = 0;
  const t30 = m.total_30d;
  const t90 = m.total_90d;
  const baseline = (t90 - t30) / 2.0; // avg per 30d over the prior 60d
  if (baseline >= 4) {
    if (t30 <= 0.2 * baseline) {
      sVolumeCollapse = 100;
      notes.push(`Comms volume crashed (${Math.round(baseline)}→${t30} per 30d)`);
    } else if (t30 <= 0.4 * baseline) {
      sVolumeCollapse = 60;
      notes.push(`Comms volume down (${Math.round(baseline)}→${t30})`);
    } else if (t30 <= 0.6 * baseline) {
      sVolumeCollapse = 30;
    }
  }
  if (m.channels_90d >= 3 && m.channels_30d <= 1) {
    sVolumeCollapse = Math.max(sVolumeCollapse, 60);
    notes.push(`Channels narrowed ${m.channels_90d}→${m.channels_30d}`);
  }

  // Composite
  let composite = Math.round(
    SIG_WEIGHTS.weSilent * sWeSilent +
      SIG_WEIGHTS.clientSilent * sClientSilent +
      SIG_WEIGHTS.responseDrop * sResponseDrop +
      SIG_WEIGHTS.volumeCollapse * sVolumeCollapse,
  );

  // Zero-comms auto-promote
  if (m.total_90d === 0) {
    composite = Math.max(composite, ZERO_COMMS_BASELINE_SCORE);
    notes.push("Zero comms in 90d");
  }

  return {
    score: composite,
    tier: tierFor(composite, m.total_90d),
    sig_we_silent: sWeSilent,
    sig_client_silent: sClientSilent,
    sig_response_drop: sResponseDrop,
    sig_volume_collapse: sVolumeCollapse,
    notes: notes.join("; "),
  };
}
