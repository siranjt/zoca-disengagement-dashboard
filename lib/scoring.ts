import {
  SIG_WEIGHTS,
  SIG_WEIGHTS_V2,
  TIER_CUTS,
  WE_SILENT_DAYS,
  CLIENT_SILENT_DAYS,
  ZERO_COMMS_BASELINE_SCORE,
  WATCH_LANE_FLAG_COUNT,
  tierToStoplight,
} from "./config";
import type {
  CommsEvent,
  CustomerMetrics,
  CustomerSignals,
  CustomerSignalsV2,
  UsageMetrics,
  BillingMetrics,
  PerformanceMetrics,
  TicketsMetrics,
} from "./types";
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
 * v1 scoring — preserved for backward compat with existing dashboard.
 * Composite of 4 comms signals at original weights (30/30/25/15).
 */
export function scoreCustomer(m: CustomerMetrics): CustomerSignals {
  const notes: string[] = [];

  // Signal 3: We went silent
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

  // Signal 2: Client went silent
  let sClientSilent = 0;
  const dsi = m.days_since_in;
  const hadHistory = m.in_90d - m.in_30d > 0;
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

  // Signal 1: Response rate dropped
  let sResponseDrop = 0;
  const in30 = m.in_30d, out30 = m.out_30d;
  const inPrior = m.in_90d - m.in_30d, outPrior = m.out_90d - m.out_30d;
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
  const t30 = m.total_30d, t90 = m.total_90d;
  const baseline = (t90 - t30) / 2.0;
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

  let composite = Math.round(
    SIG_WEIGHTS.weSilent * sWeSilent +
      SIG_WEIGHTS.clientSilent * sClientSilent +
      SIG_WEIGHTS.responseDrop * sResponseDrop +
      SIG_WEIGHTS.volumeCollapse * sVolumeCollapse,
  );

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

// ---------------------------------------------------------------------------
// v2 — Tickets flag
// ---------------------------------------------------------------------------

export function computeTicketsFlag(
  entityId: string,
  openTickets30d: number,
  unresolvedIssues30d: number,
): TicketsMetrics {
  return {
    entity_id: entityId,
    open_tickets_30d: openTickets30d,
    unresolved_issues_last_30_days: unresolvedIssues30d,
    flag: openTickets30d > 0 || unresolvedIssues30d > 0,
  };
}

// ---------------------------------------------------------------------------
// v2 — Hybrid composite (comms 50% / usage 30% / billing 20% + 2 flags)
// ---------------------------------------------------------------------------

/**
 * Compose the v2 hybrid composite. Reuses scoreCustomer() for the 4 comms
 * sub-signals, then layers in usage + billing scores and the modifier flags.
 *
 * @param commsSignals  v1 scoreCustomer() output (for the 4 sub-scores)
 * @param usageScore    Output of scoreUsage()
 * @param billingScore  Output of scoreBilling()
 * @param performance   Performance metrics for the entity (for flag verdict)
 * @param tickets       Tickets metrics for the entity (for flag verdict)
 * @param commsMetrics  Used for zero-comms-90d auto-promote
 * @param mixpanelHasData  False if entity has no Mixpanel coverage at all
 */
export function composeHybridSignals(args: {
  commsSignals: CustomerSignals;
  usageScore: number;
  billingScore: number;
  performance: PerformanceMetrics | null;
  tickets: TicketsMetrics | null;
  commsMetrics: CustomerMetrics;
  mixpanelHasData: boolean;
}): CustomerSignalsV2 {
  const { commsSignals, usageScore, billingScore, performance, tickets, commsMetrics, mixpanelHasData } = args;

  const composite = Math.round(
    SIG_WEIGHTS_V2.weSilent * commsSignals.sig_we_silent +
      SIG_WEIGHTS_V2.clientSilent * commsSignals.sig_client_silent +
      SIG_WEIGHTS_V2.responseDrop * commsSignals.sig_response_drop +
      SIG_WEIGHTS_V2.volumeCollapse * commsSignals.sig_volume_collapse +
      SIG_WEIGHTS_V2.usage * usageScore +
      SIG_WEIGHTS_V2.billing * billingScore,
  );

  // Modifier flags
  const flagPerformance = !!(performance && performance.flag);
  const flagTickets = !!(tickets && tickets.flag);
  const flagCount = (flagPerformance ? 1 : 0) + (flagTickets ? 1 : 0);

  // Determine tier — same internal model as v1, with WATCH lane awareness
  let tier: Tier;
  // HIGH triggers: composite ≥ 65, zero comms 90d, zero mixpanel 90d
  if (composite >= TIER_CUTS.high || commsMetrics.total_90d === 0 || !mixpanelHasData) {
    tier = "HIGH";
  } else if (composite >= TIER_CUTS.medium) {
    tier = "MEDIUM";
  } else if (composite >= TIER_CUTS.low) {
    tier = "LOW";
  } else {
    tier = "HEALTHY";
  }

  // Effective tier — WATCH lane is HEALTHY/LOW with 2+ flags, displayed as Yellow.
  // We keep the internal `tier` value but the stoplight mapping handles the WATCH lift.
  const stoplight = tierToStoplight(tier, flagCount, billingScore);

  // Reason + suggested action: template-driven from dominant signal
  const { reasonOneLine, suggestedAction, notes } = buildNarrative({
    commsSignals,
    usageScore,
    billingScore,
    performance,
    tickets,
    commsMetrics,
    mixpanelHasData,
  });

  return {
    composite,
    tier,
    stoplight,
    sig_we_silent: commsSignals.sig_we_silent,
    sig_client_silent: commsSignals.sig_client_silent,
    sig_response_drop: commsSignals.sig_response_drop,
    sig_volume_collapse: commsSignals.sig_volume_collapse,
    sig_usage: usageScore,
    sig_billing: billingScore,
    flag_performance: flagPerformance,
    flag_tickets: flagTickets,
    flag_count: flagCount,
    trajectory_7d: "unknown",          // filled by snapshot writer if prev exists
    composite_7d_ago: null,             // filled by snapshot writer
    reason_one_line: reasonOneLine,
    suggested_action: suggestedAction,
    notes: notes.join("; "),
  };
}

// ---------------------------------------------------------------------------
// Narrative + suggested-action templates (deterministic; Haiku-substitutable later)
// ---------------------------------------------------------------------------

type NarrativeArgs = {
  commsSignals: CustomerSignals;
  usageScore: number;
  billingScore: number;
  performance: PerformanceMetrics | null;
  tickets: TicketsMetrics | null;
  commsMetrics: CustomerMetrics;
  mixpanelHasData: boolean;
};

function buildNarrative(a: NarrativeArgs): {
  reasonOneLine: string;
  suggestedAction: string;
  notes: string[];
} {
  const notes: string[] = [];
  // Find dominant signal
  const subs = [
    { name: "billing", score: a.billingScore },
    { name: "usage", score: a.usageScore },
    { name: "weSilent", score: a.commsSignals.sig_we_silent },
    { name: "clientSilent", score: a.commsSignals.sig_client_silent },
    { name: "responseDrop", score: a.commsSignals.sig_response_drop },
    { name: "volumeCollapse", score: a.commsSignals.sig_volume_collapse },
  ].sort((x, y) => y.score - x.score);
  const dominant = subs[0];

  // Edge cases first
  if (!a.mixpanelHasData) {
    return {
      reasonOneLine: "No Zoca app activity tracked in the last 90 days.",
      suggestedAction: "Verify they're set up on the app — onboard if needed.",
      notes: ["Missing Mixpanel data — likely a setup gap or churned user."],
    };
  }
  if (a.commsMetrics.total_90d === 0) {
    return {
      reasonOneLine: "Zero communication across all channels for 90 days.",
      suggestedAction: "Cold-reach: email + phone today.",
      notes: ["Zero comms in 90d → auto-promoted to red."],
    };
  }

  // Template-driven by dominant signal — interpolate real data so each card reads differently.
  if (dominant.name === "billing" && a.billingScore >= 40) {
    return narrateBilling(a);
  }
  if (dominant.name === "usage" && a.usageScore >= 50) {
    return narrateUsage(a);
  }
  if (dominant.name === "weSilent" && a.commsSignals.sig_we_silent >= 70) {
    return narrateWeSilent(a);
  }
  if (dominant.name === "clientSilent" && a.commsSignals.sig_client_silent >= 70) {
    return narrateClientSilent(a);
  }
  if (dominant.name === "responseDrop" && a.commsSignals.sig_response_drop >= 70) {
    return narrateResponseDrop(a);
  }
  if (dominant.name === "volumeCollapse" && a.commsSignals.sig_volume_collapse >= 60) {
    return narrateVolumeCollapse(a);
  }
  // Performance / tickets fallbacks
  if (a.performance && a.performance.flag) {
    return {
      reasonOneLine: a.performance.flag_reasons.join("; "),
      suggestedAction: "Walk through GBP optimizer / discuss recovery plan.",
      notes,
    };
  }
  if (a.tickets && a.tickets.flag) {
    return {
      reasonOneLine: `Open tickets unresolved (${a.tickets.open_tickets_30d}).`,
      suggestedAction: "Resolve tickets first, then send a recap.",
      notes,
    };
  }

  // Doing fine
  return {
    reasonOneLine: "Active across signals — no action needed.",
    suggestedAction: "No action needed.",
    notes,
  };
}


// ---------------------------------------------------------------------------
// Per-signal narrators — each pulls real data from the metrics so cards don't
// read identically across customers. Added in Phase 2.A polish.
// ---------------------------------------------------------------------------

function narrateBilling(a: NarrativeArgs) {
  const notes: string[] = [];
  return {
    reasonOneLine: "Billing issues stacking — unpaid invoices on file.",
    suggestedAction: "Call about the unpaid invoice. Confirm card on file.",
    notes,
  };
}

function narrateUsage(a: NarrativeArgs) {
  const notes: string[] = [];
  // We can't know app-open counts here — only the score. Frame by score band.
  if (a.usageScore >= 90) {
    return {
      reasonOneLine: "No app activity at all in the last 30 days.",
      suggestedAction: "Confirm the team is set up. Onboard if needed.",
      notes,
    };
  }
  if (a.usageScore >= 65) {
    return {
      reasonOneLine: "App usage dropped to Cold — barely opening the app.",
      suggestedAction: "Walk them through Leads or Reviews — re-engage on a feature.",
      notes,
    };
  }
  return {
    reasonOneLine: "App engagement has slipped recently.",
    suggestedAction: "Reach out — quick feature walkthrough.",
    notes,
  };
}

function narrateWeSilent(a: NarrativeArgs) {
  const notes: string[] = [];
  const d = a.commsMetrics.days_since_out;
  const dLabel = d >= 9999 ? "we've never reached out" : d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"} ago`;
  return {
    reasonOneLine: d >= 9999
      ? "We have never reached out to this customer."
      : `Last we reached out: ${dLabel}.`,
    suggestedAction: "Send a check-in — email or quick call.",
    notes,
  };
}

function narrateClientSilent(a: NarrativeArgs) {
  const notes: string[] = [];
  const d = a.commsMetrics.days_since_in;
  const had = a.commsMetrics.in_90d - a.commsMetrics.in_30d;
  const dLabel = d >= 9999 ? "ever" : d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"}`;
  return {
    reasonOneLine: d >= 9999
      ? "Client has not replied — no inbound on record."
      : `Client silent for ${dLabel}${had > 0 ? " — was active before." : "."}`,
    suggestedAction: "Re-open the conversation. Ask how they are doing.",
    notes,
  };
}

function narrateResponseDrop(a: NarrativeArgs) {
  const notes: string[] = [];
  return {
    reasonOneLine: "Response rate has collapsed — we are talking, they are not.",
    suggestedAction: "Switch channels — try a call instead of email.",
    notes,
  };
}

function narrateVolumeCollapse(a: NarrativeArgs) {
  const notes: string[] = [];
  const t30 = a.commsMetrics.total_30d;
  const baseline = Math.round((a.commsMetrics.total_90d - t30) / 2.0);
  return {
    reasonOneLine: baseline > 0
      ? `Comms volume crashed — ${baseline}/30d baseline down to ${t30}.`
      : "Overall comms volume dropped sharply.",
    suggestedAction: "Re-engage with a strategic update or new feature.",
    notes,
  };
}

export { tierFor };
