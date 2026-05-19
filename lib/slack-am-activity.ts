/**
 * Phase Beacon — Slack AM activity stream.
 *
 * Posts a real-time message to the AM activity channel whenever an AM takes
 * a high-signal action (mark_contacted, note_saved, snooze_set, coaching_acted).
 * Lower-signal events flow into the hourly digest cron — see
 * app/api/cron/slack-activity-digest/route.ts.
 *
 * Fire-and-forget. Never blocks the caller. Slack failures are swallowed.
 */

import type { ActivityEvent, LogActivityInput } from "./activity";

const REALTIME_EVENTS: ReadonlySet<ActivityEvent> = new Set<ActivityEvent>([
  "mark_contacted",
  "note_saved",
  "snooze_set",
  "coaching_acted",
]);

const ACTION_LABEL: Partial<Record<ActivityEvent, string>> = {
  mark_contacted: "marked contacted",
  note_saved: "saved a note",
  snooze_set: "snoozed customer",
  coaching_acted: "acted on coaching loop",
};

const EMOJI: Partial<Record<ActivityEvent, string>> = {
  mark_contacted: ":white_check_mark:",
  note_saved: ":memo:",
  snooze_set: ":zzz:",
  coaching_acted: ":dart:",
};

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

function summarizeMetadata(input: LogActivityInput): string {
  const m = input.metadata || {};
  const bits: string[] = [];

  // Choice (mark_contacted)
  if (m.choice && typeof m.choice === "string") {
    bits.push(`Outcome: *${m.choice}*`);
  }

  // Reason (mark_contacted or coaching_acted)
  if (m.reason && typeof m.reason === "string" && m.reason.trim()) {
    const r = m.reason.trim();
    bits.push(`Reason: ${r.length > 80 ? r.slice(0, 80) + "…" : r}`);
  }

  // Days (snooze_set)
  if (typeof m.days === "number" && Number.isFinite(m.days)) {
    bits.push(`Days: ${m.days}`);
  }

  // Metric + AM (coaching_acted)
  if (m.metric && typeof m.metric === "string") {
    bits.push(`Metric: ${m.metric}`);
  }

  // Note length (note_saved)
  if (typeof m.note_length === "number" && Number.isFinite(m.note_length)) {
    bits.push(`Note length: ${m.note_length} chars`);
  }

  return bits.join(" · ");
}

function buildText(input: LogActivityInput): string | null {
  if (!REALTIME_EVENTS.has(input.event_name)) return null;
  const am = input.am_name || input.email || "unknown";
  const verb = ACTION_LABEL[input.event_name] || String(input.event_name);
  const emoji = EMOJI[input.event_name] || ":bell:";
  const entityShort = input.entity_id ? input.entity_id.slice(0, 8) : "—";
  const meta = summarizeMetadata(input);
  const surface = input.surface ? `_${input.surface}_` : "";
  return [
    `${emoji} *${am}* ${verb} (${entityShort}) ${surface}`.trim(),
    meta ? `   ${meta}` : null,
  ].filter(Boolean).join("\n");
}

/**
 * Post a real-time message about an AM action to Slack. Never throws.
 * Called fire-and-forget from logActivity after the Postgres INSERT.
 */
export async function postRealtimeAmActivity(input: LogActivityInput): Promise<void> {
  try {
    if (!REALTIME_EVENTS.has(input.event_name)) return;
    const url = process.env.SLACK_AM_ACTIVITY_WEBHOOK_URL;
    if (!url) return;
    const text = buildText(input);
    if (!text) return;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch(() => {});
  } catch {
    // Never break the activity logger. Silent failure.
  }
}

export { REALTIME_EVENTS };
export { fmtMoney };
