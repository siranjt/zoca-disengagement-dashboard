# Usage Tracking — Developer Guide

Internal docs for the activity-log system that powers `/admin/usage`. Read this before adding new event types, changing the schema, or debugging "why isn't my event showing up".

---

## Schema

```sql
CREATE TABLE am_activity_log (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL,          -- 'admin' | 'manager' | 'am'
  am_name     TEXT,                   -- null for admin/manager
  event_name  TEXT NOT NULL,          -- see Event Taxonomy below
  surface     TEXT,                   -- see Surface Taxonomy below
  entity_id   TEXT,                   -- customer entity_id when relevant
  metadata    JSONB,                  -- flex slot; see Metadata Conventions
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Lives in the Neon `disengagement-pg` DB.

Indexes worth adding once the table gets large (currently unindexed; first ~100K rows are fine without):

```sql
CREATE INDEX am_activity_log_email_ts_idx ON am_activity_log (email, ts DESC);
CREATE INDEX am_activity_log_event_ts_idx ON am_activity_log (event_name, ts DESC);
CREATE INDEX am_activity_log_ts_idx       ON am_activity_log (ts DESC);
```

---

## Event taxonomy

Every event_name value lives in `lib/activity.ts` as the `ActivityEvent` union. Don't write a row with an `event_name` that isn't in the union — keep the type and the data in lock-step.

| event_name | Where it fires | Notes |
|---|---|---|
| `sign_in` | `lib/auth-options.ts` → `events.signIn` | Fires once per fresh JWT. NextAuth doesn't refire on session reuse. |
| `sign_in_rejected` | (reserved, not yet wired) | For when we want to log rejected sign-ins (currently console.warn only). |
| `api_call` | `lib/api-auth.ts` → `requireRole()` | Every authorized API hit. `metadata.path` carries the route. |
| `page_view` | Client — `useActivityLogger()` on mount | Wire in each top-level page. |
| `refresh_clicked` | Client — V2Header refresh button | |
| `filter_changed` | Client — V2Header filter UI | `metadata.filter` carries the new value. |
| `sort_changed` | Client — V2Header sort UI | `metadata.sort` carries the new key. |
| `am_switched` | Client — Manager's AM picker | `metadata.to_am` carries the destination AM name. |
| `view_switched` | Client — AM/Manager view toggle | `metadata.to_view` carries the destination. |
| `customer_opened` | Client — V2CustomerCard click | `entity_id` populated; `metadata.tier` optional. |
| `mark_contacted` | Client — V2CustomerDetail | `metadata.action_type` + `metadata.reason_code`. |
| `note_saved` | Client — V2CustomerDetail note field | |
| `snooze_set` | Client — V2CustomerDetail snooze button | `metadata.snooze_until`. |
| `one_on_one_opened` | Client — V2Manager1on1 mount | `metadata.am_name` carries the AM in focus. |
| `coaching_acted` | Client — V2CoachingLoops act button | `metadata.signal_type` + `metadata.entity_id`. |
| `coaching_dismissed` | Client — V2CoachingLoops dismiss | Same metadata as `coaching_acted`. |

---

## Surface taxonomy

`surface` is the high-level "where in the app" dimension. Stable values:

| surface | Used by |
|---|---|
| `v2_dashboard` | The main /v2 page + most clicks within it |
| `v2_customer_detail` | `/v2/customer/[entityId]` |
| `v2_manager_1on1` | `/v2/manager/1on1` |
| `v2_coaching` | The coaching loops panel (wherever it renders) |
| `v2_timeline` | The snapshot timeline page |
| `admin_usage` | `/admin/usage` itself (rare — admins don't generate that much) |
| `auth` | NextAuth sign-in flow |

For `api_call` rows, `surface` is always null — `metadata.path` carries the equivalent info more precisely.

---

## Metadata conventions

`metadata` is JSONB so it can hold anything, but in practice we keep these keys consistent:

- `path` — request URL path (set automatically for `api_call` rows by Phase 33.B.6)
- `filter` / `sort` — current filter/sort values for those events
- `to_am` / `to_view` — destination for switch events
- `tier` — `"RED"` | `"YELLOW"` | `"GREEN"`
- `action_type` — for `mark_contacted`: `"contacted_connected" | "contacted_vm" | "contacted_noreach"`
- `reason_code` — `"renewal" | "performance" | "billing" | ...`
- `signal_type` — for coaching events
- `snooze_until` — ISO date

Don't dump huge objects into metadata. Keep it under a few hundred bytes per row. JSONB query performance is fine for the scale we're at; just don't be silly.

---

## Adding a new event type

1. Add the literal to the `ActivityEvent` union in `lib/activity.ts`.
2. Add the same literal to `VALID_EVENTS` in `app/api/v2/activity/route.ts` (the array that whitelists what the client can send).
3. Mirror the union in `hooks/use-activity-logger.ts` (`ActivityEventName`).
4. Wire the event at the call site:
   - Server: `void logActivity({ ... });` inside the relevant function.
   - Client: `logEvent("your_new_event", { ... })` from `useActivityLogger()`.
5. Add a row to the Event taxonomy table above.
6. If you want it visible on `/admin/usage`, add a column to the per-user query in `lib/usage-queries.ts:getPerUserStats()`.

Don't write event names with mixed case or special characters — stick to lowercase snake_case.

---

## Useful queries

### Daily active users this week

```sql
SELECT DATE_TRUNC('day', ts) AS day, COUNT(DISTINCT email) AS dau
FROM am_activity_log
WHERE ts > NOW() - INTERVAL '7 days'
GROUP BY 1 ORDER BY 1;
```

### Who hasn't signed in this month (on the allowlist but absent)

```sql
-- Quick proxy: anyone in am_activity_log who hasn't been seen in 14+ days.
-- For a true "haven't signed in once" answer, join against the allowlist
-- in lib/config.ts (no DB table for that yet — pasted manually if needed).
SELECT email, MAX(ts) AS last_seen
FROM am_activity_log
GROUP BY 1
HAVING MAX(ts) < NOW() - INTERVAL '14 days'
ORDER BY last_seen ASC;
```

### Top API routes by hit count

```sql
SELECT metadata->>'path' AS path,
       COUNT(*)             AS hits,
       COUNT(DISTINCT email) AS unique_users
FROM am_activity_log
WHERE event_name = 'api_call'
  AND ts > NOW() - INTERVAL '7 days'
  AND metadata->>'path' IS NOT NULL
GROUP BY 1
ORDER BY hits DESC
LIMIT 20;
```

### Funnel: customer card opens → mark_contacted

```sql
WITH opens AS (
  SELECT email, COUNT(*) AS opens
  FROM am_activity_log
  WHERE event_name = 'customer_opened'
    AND ts > NOW() - INTERVAL '7 days'
  GROUP BY 1
),
contacted AS (
  SELECT email, COUNT(*) AS contacts
  FROM am_activity_log
  WHERE event_name = 'mark_contacted'
    AND ts > NOW() - INTERVAL '7 days'
  GROUP BY 1
)
SELECT o.email,
       o.opens,
       COALESCE(c.contacts, 0) AS contacts,
       ROUND(100.0 * COALESCE(c.contacts, 0) / o.opens, 1) AS pct_contacted
FROM opens o LEFT JOIN contacted c USING (email)
ORDER BY o.opens DESC;
```

### Time-of-day usage heatmap (PostgreSQL crosstab not required)

```sql
SELECT EXTRACT(DOW FROM ts)::int  AS dow_0sun,
       EXTRACT(HOUR FROM ts)::int AS hour,
       COUNT(*)
FROM am_activity_log
WHERE ts > NOW() - INTERVAL '30 days'
GROUP BY 1, 2
ORDER BY 1, 2;
```

---

## Operational notes

### Fire-and-forget

`logActivity()` never throws and never blocks. If the DB is down, the row is dropped and `console.warn` fires. Requests stay snappy.

### Client robustness

`useActivityLogger()` prefers `navigator.sendBeacon()` (survives page unload), falls back to `fetch({ keepalive: true })`. Failures are silently swallowed.

### Retention

No automatic retention policy yet. Plan: prune rows older than 180 days via a daily cron (TODO). At current volume (~100 events/user/day × 25 users × 180 days = 450K rows) we don't need pruning urgently.

### Privacy

- Email + role + AM book is captured; that's enough to identify individuals.
- We do NOT capture: note content, customer names beyond entity_id, IP, user agent, geolocation.
- Only admins can view `/admin/usage`. The data is gated by:
  1. NextAuth allowlist (must be Zoca + on list)
  2. Middleware (`/admin/*` → admin role only)
  3. The page itself double-checks role in the server component

See `docs/privacy-tracking.md` for the user-facing version.

---

## Phase numbers (for archaeology)

- **33.B** — Plumbing: `lib/activity.ts`, `/api/v2/activity`, `useActivityLogger()`, sign-in + api_call wiring.
- **33.B.6** — Path capture: middleware injects `x-request-path`, `requireRole()` reads it into `metadata.path`.
- **33.B.7** — `ashish@zoca.com` added to managers (unrelated, just chronologically adjacent).
- **33.C** — `/admin/usage` reporting page + this doc.

Future:
- **33.C.1** — index columns on `am_activity_log` once row count crosses 100K.
- **33.C.2** — retention cron (prune rows older than 180 days).
- **33.D** — wire `useActivityLogger()` into the remaining 6 client components (see `phase33b-usage-tracking/INSTRUCTIONS.md` for the patterns).
