# Beacon — v2 Rework Design

**Author:** Siranjith
**Date:** 2026-05-12
**Status:** Draft for team review
**Repo:** [siranjt/zoca-disengagement-dashboard](https://github.com/siranjt/zoca-disengagement-dashboard)
**Live:** [zoca-disengagement-dashboard.vercel.app](https://zoca-disengagement-dashboard.vercel.app)

---

## TL;DR

The current dashboard scores every active Chargebee customer against four *comms-only* signals (we-silent, client-silent, response-drop, volume-collapse) and surfaces a single composite risk tier. It is internally consistent, but it answers the wrong question for an AM. An AM does not need a number — they need to know "who do I call this morning, what do I say, and is it working?"

This rework widens the data dimensions (product usage, billing health, performance trajectory, tickets), recomposes the scoring into a hybrid model (six signals + two modifier flags), and re-shapes the UI from a passive risk viewer into an AM workflow tool: a daily-inbox landing page with narrative-first cards, suggested next actions, one-click outreach logging, and a 9 AM Slack DM to push the day's priorities into the AM's existing workflow.

Phased delivery: a realistic v1 ships in roughly three to four weeks of focused work, with peer-comparison and Haiku-on-demand polish following over the next two weeks.

A clickable HTML mockup of the simplified UX is being maintained in parallel with this doc as the visual source of truth. See `Disengagement_Dashboard_v2_Mockup.html` in the outputs folder. The mockup is the artifact AMs see; this doc is the artifact engineering builds against.

---

## 0. Design philosophy

Two principles override everything else in this document. If a decision elsewhere conflicts with one of these, the principle wins.

### 0.1 Default to minimum information

If a piece of information is on screen by default, it must help the AM decide what to do next. Composite scores, signal sub-scores, sparklines, percentile rankings, methodology — all of that lives in drawers and modals, never on the default card. The card answers three questions only: how serious is this (color), what's going on (one sentence), and what do you suggest I do (one button). Everything else is one click away, not zero.

### 0.2 No new vocabulary the AM has to learn

If a concept requires a glossary, the design is wrong. The default-view vocabulary the AM sees is plain English: "Needs attention" / "Keep an eye on" / "Doing fine," "Improving / Worsening / Stable," "Call about the unpaid invoice," "Mark as contacted." No tier letters, no "composite," no "WATCH lane," no "modifier flag." Internal scoring uses precise terms — those terms are for the engineering layer, the methodology page, and the data team. They do not appear in the AM-facing UI.

A practical implication of these two principles: the AM-facing tier mapping is three stoplight buckets, not five technical tiers.

| Stoplight (AM-facing) | Internal tier(s) | Meaning to the AM |
| --- | --- | --- |
| Red — "Needs attention" | HIGH | Call today. Something concrete is wrong. |
| Yellow — "Keep an eye on" | MED + WATCH (HEALTHY with 2+ flags) | Watch this week. Pattern is concerning but not urgent. |
| Green — "Doing fine" | LOW + HEALTHY | No action needed. Drop in for warmth, not for fire. |

The five-tier internal model stays in `lib/scoring.ts` for analytical fidelity. The display layer compresses to three. Pod and Leadership views may surface the finer-grained tiers if the audience asks for it; the AM Daily Triage view does not.

---

## 1. Background

### 1.1 What v1 does today

V1 is a Next.js 14 App Router application hosted on Vercel. A nightly cron at 22:00 UTC hits `/api/cron/refresh`, which:

1. Pulls Chargebee subscriptions across `active`, `non_renewing`, `in_trial` statuses (paginated, serialized).
2. Pulls five Metabase public CSVs — BaseSheet (the `customer_id → entity_id` bridge plus AM/biz columns), App Chat, Email, Phone, Video, SMS — 120 days deep.
3. Runs `computeMetrics()` and `scoreCustomer()` per customer over rolling 7/14/30/60/90-day windows.
4. Writes the snapshot to Vercel KV under `disengagement:snapshot:latest`, auto-splitting at 900 KB.

The UI reads the cached snapshot, presents tabs (Overview / By Tier / Signals / Customer Detail), and offers an on-demand `↻ Refresh` button that re-runs the pipeline.

### 1.2 Why we are reworking it

Three observations from running v1:

- **All four signals come from the same data type.** Comms is a useful proxy but it is not the same thing as disengagement. A customer who has stopped using the Zoca app entirely but still emails their AM occasionally looks healthy in v1. A customer whose card auto-debit failed in March and has been getting silence treatment from accounting looks the same as a customer who just went on a two-week vacation.

- **The output is a risk score, not an action.** AMs receiving a list of accounts at "HIGH risk" do not know what to do with it. The score does not tell them *why*, and it does not tell them *what to say*. We have heard secondhand that the dashboard is opened once a week, not daily.

- **There is no workflow loop.** Nothing in v1 captures whether an AM acted on a flagged customer or whether the intervention worked. We are flying blind on tool effectiveness.

### 1.3 What we keep

The v1 chassis is solid. We are keeping:

- The Next.js + Vercel + KV deployment shape
- The Basic-Auth middleware pattern (with a planned upgrade path)
- `lib/chargebee.ts` (paginated subs pull)
- The comms portion of `lib/metabase.ts` (channel directionality rules, sender mapping, dataset URLs)
- `lib/store.ts` (KV wrapper with auto-split + in-memory fallback)
- `middleware.ts` (Basic Auth, cron exemption)
- The Zoca dark-mode visual theme (`tailwind.config.ts`, `globals.css`, fonts, color tokens)

What we are rewriting: `lib/scoring.ts`, `lib/refresh.ts`, `lib/types.ts` (mostly additions), `components/Dashboard.tsx`, and all API routes except `/api/health`.

---

## 2. Goals & non-goals

### 2.1 Goals

The reworked dashboard should answer these questions for an AM, in this order:

1. **Who do I need to act on today?** (the daily inbox)
2. **Why are they flagged?** (the why-flagged breakdown)
3. **What do I say to them?** (the suggested next action + talking points)
4. **Is what I have been doing working?** (the outcome tracking + wins panel)
5. **How is my book doing compared to my pod and the company?** (the peer-comparison overlays)

Secondary goals: pod-lead and leadership rollups, trend-over-time analysis for CS leadership, and a feedback loop that lets AMs flag bad signals so we can improve the scoring over time.

### 2.2 Non-goals (explicitly out of scope for this rework)

- Account-management CRM functionality (notes, tasks, reminders beyond the simple "contacted today" log)
- Real SSO / Google OAuth — deferred to v2; we use a cheap AM-identity dropdown for v1
- Linear / HubSpot ticket enrichment — out of scope; we use BaseSheet ticket fields only
- Mobile-native app — responsive web only
- Predictive churn modeling — the existing performance-prediction work explicitly does not surface to customers, and we are extending the same rule here. The dashboard surfaces current state and trajectory; it does not predict.
- Bidirectional sync to Chargebee, Mixpanel, or any other system. The dashboard is read-only against source systems.

---

## 3. Scope summary

The decisions locked during design discussion:

| Area | Decision |
| --- | --- |
| **New data dimensions** | All four: Product usage (Mixpanel), Billing health, Performance trajectory, Tickets |
| **Composite model** | Hybrid — usage and billing roll into composite; performance and tickets are modifier flags |
| **Composite weights** | Comms 50% / Usage 30% / Billing 20% (initial; iterate after Phase 1 data lands) |
| **Tier cuts** | HIGH ≥ 65 / MED 35–64 / LOW 15–34 / HEALTHY < 15 + WATCH lane for HEALTHY with 2+ flags |
| **Views** | Three views in one app — AM Daily Triage, Pod Rollup, Leadership / Book-wide |
| **Default landing** | AM Daily Triage with daily-inbox layout (Act today / Movers / Wins) |
| **AM identity** | Query-param + cookie dropdown for v1; Google OAuth deferred to v2 |
| **Narrative generation** | Hybrid — deterministic templates by default, Haiku on-demand button |
| **Slack integration** | Personal DMs at 9 AM IST + pod-channel summary post |
| **Refresh infrastructure** | Pre-aggregate at source via two new Metabase cards (data team accessible) |
| **Snapshot history** | Daily-keyed, 90-day retention (`disengagement:snapshot:YYYY-MM-DD`) |

---

## 4. Signal architecture

### 4.1 Six scoring signals

Each signal scores 0–100, where 100 is highest risk. The composite is a weighted sum.

**Comms pillar (50% total composite weight)**

The four existing signals stay, with internal weights rebalanced so they sum to 50:

- **We went silent** — 15% — Days since our last outbound, normalized against the customer's baseline. Outbound = `Sender = "Team Member"` (App Chat), `Received_By_Client` flag for email, and the equivalent for SMS/phone/video per the directionality rules in `lib/metabase.ts`.
- **Client went silent** — 15% — Days since the client's last inbound, gated on whether they had prior activity in the 30–90 day window (so we do not penalize new customers).
- **Response drop** — 12% — Ratio of in/out comms in the recent 30-day window versus the 30–90 day baseline. A collapsing ratio means the conversation is one-sided.
- **Volume/channel collapse** — 8% — Total comms volume + channel breadth in the recent window versus baseline. Catches customers who have shrunk from 5 channels to 1.

**Product usage signal (30% composite weight)**

Source: `mixpanelzocaappdata.export` in Aurora db=7, joined on `"locationEntityId"` (quoted, camelCase — `entityId` and `businessEntityId` both return zero rows). Coverage: 919 of 927 active customers in the last 90 days, meaning the 8 customers with zero Mixpanel activity are themselves a signal.

The canonical events scored over rolling 7/14/30/60/90-day windows:

| Event | What it indicates |
| --- | --- |
| `App/Site Opened` | App-open count + last open date |
| `$ae_session` | Distinct session days |
| `Leads-View-Home`, `Leads-Click-Lead` | Leads engagement |
| `Leads-View-GetLeads` | "Unlock my leads" screen visits |
| `Leads-Select-LeadStatusSheet` | Leads marked (won/lost/contacted) |
| `Leads-Click-LeadContact`, `Leads-Click-ChatCall`, `Leads-Click-DetailCopyNumber` | Outbound contact attempts on a lead |
| `Reviews-Click-ReviewReplyAI`, `Reviews-Done-ReviewReply`, `Review-Click-SendInviteSingle` | Review management actions |

These collapse into an engagement tier (Active / Light / Cold / Dormant) per the AM Transition Toolkit's existing logic, and the tier maps to a 0–100 risk score: Active = 0–15, Light = 25–45, Cold = 50–75, Dormant = 80–100. Customers with zero Mixpanel activity in 90 days score 100 on this signal.

**Billing health signal (20% composite weight)**

Composite of four sub-components, each weighted internally:

- Unpaid invoice count (40% of signal weight) — count of `payment_due` + `not_paid` invoices
- Days past oldest unpaid invoice (30%) — capped at 60 days
- Auto-debit-off with prior failures (20%) — boolean modifier from Chargebee customer `auto_collection` field combined with recent `failed` transactions
- Total amount due as percent of MRR (10%) — captures customers where the unpaid balance is meaningful relative to their plan

In-progress ACH transactions count as a negative modifier (subtract 10 points) — payment is on the way, do not panic.

### 4.2 Two modifier flags

These do not roll into the composite. They surface on every card and can promote a HEALTHY-composite customer to the WATCH lane (2+ flags = WATCH).

**Performance trajectory flag**

Set true if any of:

- GBP profile-click trend down ≥ 25% (computed on complete months only — the in-progress month is shown separately; a 6-day partial-month vs. full-month comparison creates false 92% drops, per the Performance Report project's rule)
- YTD GBP leads trailing same period last year by ≥ 20%
- Top-keyword ranking distribution degraded (fewer active rankings or shift from top-3 toward outside-top-10)

Sources: `gbp.metrics`, `website.booking_enquiries`, `local_seo.rank`, `entities.location_insights` (all via Metabase Dataset API, db=7 except booking_enquiries which is db=2). SQL ported from `zoca-performance-report/lib/report/queries.ts`. The `entities.location_insights` filter is critical:

```sql
AND predicted_6_month_leads IS NOT NULL
AND with_zoca_6_month_profile_clicks IS NOT NULL
AND (monthly_predictions->>'nonIcpReason') IS NULL
ORDER BY created_at DESC LIMIT 1
```

Without this filter, roughly 52% of customers show stale/downgraded rows from old forecast runs.

**Tickets flag**

Set true if either `open_tickets_30d > 0` or `unresolved_issues_last_30_days > 0` (both fields already in BaseSheet — no new pull required).

### 4.3 Tier definitions

Two layers — internal scoring fidelity, external (AM-facing) simplicity. The internal model is for the data + engineering team. The external model is what every AM sees.

**Internal scoring tiers (in `lib/scoring.ts` only):**

| Tier | Composite range | Notes |
| --- | --- | --- |
| HIGH | ≥ 65 OR zero comms in 90 days OR zero Mixpanel activity in 90 days | Hard urgency |
| WATCH | < 35 AND ≥ 2 modifier flags set | Healthy-looking but flagged |
| MED | 35–64 | Active risk |
| LOW | 15–34 | Background |
| HEALTHY | < 15 with 0–1 flags | No action |

**External (AM-facing) stoplight buckets:**

| Stoplight | Maps from | AM label |
| --- | --- | --- |
| Red | HIGH | "Needs attention" |
| Yellow | MED + WATCH | "Keep an eye on" |
| Green | LOW + HEALTHY | "Doing fine" |

The WATCH lane is folded into the Yellow stoplight bucket so AMs do not learn a new label. Internally, WATCH-tier customers carry a flag count that is surfaced inside the why-flagged drawer as "Performance flag · GBP clicks ↓ 28%" and similar chips, which is how the AM sees the concrete reason without being asked to learn taxonomy.

---

## 5. Data sources

### 5.1 Existing (carried over from v1)

- **Chargebee REST v2** — subscriptions across `active`, `non_renewing`, `in_trial`. Same paginated pull as v1.
- **BaseSheet CSV** — `https://metabase.zoca.ai/public/question/87763e8c-8084-442e-891a-df1b11e81b47.csv` — `customer_id → entity_id` bridge, plus AM name, business name, phone, churn flags, ticket counts, MRR.
- **Five comms CSVs** — App Chat, Email, Phone, Video, SMS public-question UUIDs as documented in CLAUDE.md. 120 days deep.

### 5.2 New (added in this rework)

**Mixpanel daily rollup CSV** — new Metabase card to be requested from data team. See Appendix A for the specification. Pre-aggregated to one row per (entity_id, event_type, date), with counts and last-event timestamp. Refreshed nightly.

**Chargebee invoices + transactions** — adds two endpoints to the Chargebee fetcher:

- `GET /api/v2/invoices` filtered to `status[in]=payment_due,not_paid`
- `GET /api/v2/transactions` filtered to `status[in]=in_progress,failure` with `date[after]=<90 days ago>`

Both paginated like the subs pull. Match transactions to invoices via `linked_invoices[].invoice_id` (same logic as the Missed Payments Report).

**Chargebee customer auto_collection field** — already returned by the customer endpoint we are calling for the bridge; just read the field.

**Performance metrics CSV** — new Metabase card, daily-snapshot per entity. See Appendix A. Includes pre-computed GBP click trend (peak month, current complete month, percent change), YTD leads, active ranking count and distribution, and the one-row-per-entity `location_insights` row with the filter rules applied.

**Tickets** — already in BaseSheet under `open_tickets_30d` and `unresolved_issues_last_30_days`. No new pull.

### 5.3 Join keys (the part that breaks if you get it wrong)

| Source | Key | Notes |
| --- | --- | --- |
| Chargebee subs | `customer_id` | The Chargebee handle. Stable. |
| BaseSheet | `customer_id` (Chargebee), `entity_id` (UUID) | This is the bridge. Some customers have multiple `entity_id`s (multi-location businesses share a Chargebee handle); the dashboard treats each entity as a row. |
| Mixpanel | `"locationEntityId"` (quoted, camelCase) | Equals BaseSheet `entity_id`. `entityId` and `businessEntityId` are wrong fields. |
| Performance (Aurora) | `entity_id` (unquoted) | Standard column name in Aurora tables. |
| Comms CSVs | `Entity ID` (column name in the CSV) | Equals BaseSheet `entity_id`. |

Customer-without-entity_id case: a small number of Chargebee customers will not have a BaseSheet row (usually new signups the sheet has not caught up to). They are surfaced as zero-comms HIGH and tagged "Missing BaseSheet" in the why-flagged breakdown.

---

## 6. Views & UX

### 6.1 The three views

The three views are not peer tabs. The AM Daily Triage is the *only* default view — every AM lands there every time. Pod Rollup and Leadership are accessed via top-right view-switcher buttons ("Pod view," "Leadership"), not equal-weight tab navigation. This is per design principle 0.1: minimum information on screen by default. Most AMs will never open the other two views in a typical week.

**View 1 — AM Daily Triage (default landing)**

Scoped to a selected AM (from the dropdown at top, persisted in cookie). Three sections, top to bottom:

- **Act today** — the AM's top 10 priorities. Filtered to HIGH-tier + WATCH-flagged customers in the AM's book, sorted by composite descending, excluding any customer the AM has logged a "contacted today" action against in the last 7 days. Empty state ("You are caught up") is a celebration, not a void.
- **Movers** — customers in the AM's book whose tier changed since yesterday's snapshot. Each row shows old tier → new tier with the driving signal.
- **Wins** — customers in the AM's book whose composite dropped ≥ 15 points in the last 7 days. Positive reinforcement and a chance for the AM to see what worked.

Below the daily-inbox panels: the AM's full book in a tabular view with pre-built filter chips. Hidden by default behind a "Show full book" toggle.

**View 2 — Pod Rollup**

Selected from a top-level pod dropdown (Pod 1 through Pod 5 + Floating, per the AM Transition Toolkit memory). For each pod:

- Tier distribution stacked bar across the pod's AMs
- AM leaderboard within the pod (book size, % HIGH, % WATCH, avg composite, week-over-week change)
- Pod-level signal heatmap — which signals are dominant across the pod this week
- Recent tier-movers across the pod (last 7 days)

**View 3 — Leadership / Book-wide**

All 927 customers. MRR-weighted views. Trend over time (reads from the daily snapshot history). Signal-mix analysis — for each tier, what percentage of customers in that tier are there primarily because of comms vs. usage vs. billing. AM-level distribution table sorted by % at risk.

### 6.2 Customer drill-down modal

Triggered from any customer card across all three views. Extended from v1:

- Top: customer identity (biz name, entity_id, AM, pod, plan amount, MRR)
- Composite score breakdown with all six signals as bars + the two modifier flags
- "Why is this flagged?" plain-language breakdown
- "Suggested next action" panel (template-driven; Haiku button to regenerate as narrative)
- Tabs underneath:
  - **Comms timeline** — last 90 days, one entry per touch, color-coded by direction and channel
  - **Usage timeline** — Mixpanel events per day, sparkline + recent event list
  - **Billing history** — unpaid invoices with age, recent transactions including failures, auto-debit status
  - **Performance trend** — GBP clicks chart (complete months solid, in-progress month dotted), top keywords with rank-when-joined / rank-best / rank-current, YTD leads vs same-period last year
  - **Tickets** — open + last 30 days resolved
  - **AM notes** — last 5 logged actions with date, AM who acted, outcome, and post-action composite change

### 6.3 AM-comprehension features (all v1 scope)

These are interleaved throughout the views — not a separate tab.

1. **Narrative-first cards** — Template-driven by default. Each card surfaces a one-sentence "what's going on" line above the score chip. Example template for usage-dominant: "{biz_name} has not opened the Zoca app in {days_since_last_open} days. Their last team activity was {date_last_event}." Haiku regenerates this as flowing prose on demand.

2. **Why-flagged breakdown** — One-click expand on every card. Shows the actual data points behind each signal score: "Comms: last we-outbound 14 days ago. Last client-inbound 23 days ago. Volume 3.2x lower than 30–90d baseline. Usage: 0 app opens in 7d, 2 in 30d. Engagement tier Dormant. Billing: 1 unpaid invoice ($340, 18 days past due)."

3. **Suggested next action** — Template-driven based on the dominant signal:
   - Usage-dominant → "Walk them through {recently_unused_feature}. Their team stopped using it on {date}."
   - Billing-dominant → "Call about the {invoice_id} invoice. Auto-debit failed on {failure_date} — likely a card update."
   - Comms-dominant → "Re-open conversation. Last topic was {last_message_summary} on {date}."
   - Performance flag → "Their {gbp_clicks/leads/rankings} dropped {pct}% in {month}. Walk through the {relevant_feature}."

4. **Trajectory** — Every signal score shows current + last week + last month + 90-day peak. Sparklines on the card. ↑/↓ arrow on the composite tier with a 7-day delta ("HIGH ↓ improved from 82 last week").

5. **Daily-inbox model** — Default landing is Act today + Movers + Wins, not the full book. Full book is one click behind a toggle.

6. **One-click "Contacted today"** — Button on every card. Click opens a small modal: outcome (Connected / VM / Not connected), optional 1-line note. Logs to KV under `am_actions:<am>:<entity_id>:<timestamp>`. The customer drops off Act today for 7 days.

7. **AM notes carryover** — Last 5 actions visible on the card preview. Click to see full history. Last successful intervention surfaced as a chip ("Last call (Apr 22) seemed to help — composite dropped 28 pts in following week").

8. **"This is wrong" feedback** — Thumbs-down per signal in the why-flagged breakdown. Captures `{entity_id, signal, am, timestamp, optional_comment}` to `signal_feedback:<entity_id>:<signal>:<timestamp>`. We use this to tune thresholds and build an exception list.

9. **Data freshness header** — A small strip at the top: "Snapshot refreshed {n} hours ago. Comms current as of {date}. Mixpanel current as of {date}. Chargebee current as of {time}."

10. **Peer comparison** — Card overlays: "Pod avg composite: 38. AM avg: 42. This customer: 71." Leadership view: AM-level distribution table with book-vs-pod-vs-company averages.

11. **Slack digest** — Personal DM at 9 AM IST to each AM with their top-5 Act-today list, deep-linked into the dashboard. One summary post per pod channel tagging pod members, listing book-level pod health.

12. **Outcome tracking** — AM win-rate panel: of the HIGH-tier customers contacted in the last 30 days, what percent dropped to MED or below. Same for WATCH lane. Requires "contacted today" data to accumulate — placeholder copy in v1 ("Win-rate populating — needs ~30 days of contact data").

13. **Pre-built filter chips** — Above the full book view: "My HIGH-risk I haven't contacted in 7d" / "Billing crisis in my book" / "Customers improving this week" / "Comms gap, usage strong" / "Usage dropping, comms healthy". Each is a saved filter; AMs can chain them.

14. **Tier definitions on hover** — Every tier chip has a tooltip with the formal definition and a link to the methodology card in the Overview tab.

---

## 7. Infrastructure

### 7.1 Refresh pipeline — pre-aggregate at source

The chosen path. Two new Metabase questions take the heavy lifting off the refresh job:

- **Daily Mixpanel rollup per entity** — see Appendix A.1 for SQL spec. Pre-aggregated into a thin CSV (~10 KB per customer per day). Refresh just downloads + joins.
- **Daily performance snapshot per entity** — see Appendix A.2. One row per entity per day with all the performance metrics needed for the trajectory flag. Refresh just downloads + applies threshold rules.

What still hits raw sources every night: Chargebee subs (~20s for 1100 subs), Chargebee invoices + transactions (~10s), Chargebee customer auto-debit field (folded into the customer pull), and the five comms CSVs (~5s each, parallel). Target end-to-end refresh time: 45–60s, fitting inside the Vercel Pro 60s function ceiling with margin.

**Measurement gate:** after Phase 1 lands, we measure end-to-end refresh time over 3 nights. If we are over 50s, we fall back to the split-queue infra pattern (cron triggers a Vercel Queue, workers handle chunks ≤30s each, compose step assembles snapshot). Decision happens at the end of Phase 1, before any UI work.

### 7.2 Snapshot history

V1 stores `disengagement:snapshot:latest`. V2 also writes `disengagement:snapshot:YYYY-MM-DD` with 90-day retention. The `latest` key is kept for backward compatibility — `/api/snapshot` returns `latest` by default.

KV size implication: one snapshot is ~700–900 KB today. With the new fields (per-signal sub-scores, trajectory windows, modifier flags, per-event Mixpanel counts), snapshots will be ~1.5–2 MB each. Ninety days × 2 MB = ~180 MB KV usage. Vercel KV's free tier is 256 MB; we may need to upgrade. Cost: ~$1/GB beyond 256 MB.

A daily snapshot-pruner cron runs at 00:30 UTC to delete snapshots older than 90 days.

### 7.3 AM identity

V1 has none — Basic Auth is anonymous. V2 adds:

- A top-level AM selector dropdown listing all 13 active AMs + "All AMs" (the Leadership view defaults to All)
- Selection persists in a cookie (`zoca_disengagement_am`) for the session
- Query-param override (`?am=Sudha`) for deep-linking, including from the Slack DM
- No real auth boundary — anyone with the Basic Auth password can switch AMs. Acceptable for an internal tool; deferred OAuth in v2 will gate this properly.

### 7.4 Narrative generation — hybrid Haiku

- Default: deterministic templates per dominant signal, filled with customer-specific values
- On-demand: a "Generate narrative" button on each card → one Haiku call → result cached in KV for 24h
- Per-call cost: ~$0.003 (input ~200 tokens, output ~80 tokens). Even at 100 AM clicks/day = $0.30/day.
- Failure mode: if Haiku errors, the template is shown unchanged. No user-facing error.

### 7.5 Slack integration

Slack bot app deployed to Zoca's workspace. Scopes required: `chat:write` (DMs), `chat:write.public` (post to pod channels without joining each one), `users:read.email` (map AM email → Slack user ID).

Two scheduled jobs (Vercel Cron):

- `30 3 * * *` (3:30 AM UTC = 9:00 AM IST) — per-AM personal DM. For each of the 13 active AMs, post their top-5 Act-today list. Deep-link each row to `/?am=<am>&customer=<entity_id>`.
- `35 3 * * *` (9:05 AM IST) — pod summary. For each of the 5 pods, post one summary message to the pod's channel: book size, % HIGH, % WATCH, top 3 movers since yesterday, week-over-week trend.

Slack bot config (workspace channel IDs, AM-email-to-Slack-user-ID map) lives in `lib/slack.ts` with a small JSON map. Hardcoded for v1; configurable via env in v2.

### 7.6 Auth — unchanged in v1

Basic Auth middleware stays. `/api/health` and `/api/cron/*` and `/api/slack/*` excluded. Slack callback endpoints (for the bot if needed) Bearer-authenticated via a new `SLACK_SIGNING_SECRET` env.

---

## 8. Phased delivery plan

Effort estimates are dev-days assuming one focused engineer.

### Phase -1 — mockup validation (built; pending AM feedback)

A clickable HTML mockup (`Disengagement_Dashboard_v2_Mockup.html`) is built and used to validate the simplified AM UX before any code is written. We share it with 2–3 active AMs (one volunteer per pod is ideal) and watch reactions. Anything they find confusing in the mockup gets fixed in the mockup before we commit to the design — revising HTML is cheaper than revising 30+ component files.

Sign-off criterion: at least two of the three AMs can, without prompting, identify the top customer to call and explain in their own words why that customer is flagged. If they cannot, the design needs work before Phase 0.

### Phase 0 — prep (1–2 days, in parallel with Phase 1)

- File Metabase card requests with the data team (Appendix A.1 + A.2). Expected turnaround: ~1 week.
- Submit Slack bot app for workspace admin approval. Expected turnaround: ~3–5 days.
- Confirm Vercel KV tier upgrade path with whoever owns billing (we will need beyond 256 MB once history accumulates).
- Snapshot a known-good list of 20 customers across tiers — these become the regression-test cohort for Phase 1 scoring.

### Phase 1 — data foundation (5–7 days)

- Add Mixpanel fetcher (CSV download + parse) → `lib/mixpanel.ts`
- Add Chargebee invoices + transactions fetcher → extend `lib/chargebee.ts`
- Add performance snapshot fetcher → `lib/performance.ts`
- New scoring: `scoreUsage()`, `scoreBilling()`, `computePerformanceFlag()`, `computeTicketsFlag()` → `lib/scoring.ts`
- Rewrite `composeComposite()` for 50/30/20 weighting + WATCH lane logic
- Extend `lib/types.ts` with new `ScoredCustomer` shape (per-signal sub-scores, flag booleans, trajectory windows)
- Snapshot writer: write both `latest` and `YYYY-MM-DD` keys; add pruner cron route
- **Measurement gate** — run refresh 3 times, log end-to-end time. Decide infra-fallback yes/no.
- Regression test against the Phase 0 cohort — composite scores should be directionally sensible (not necessarily identical to v1)

No UI changes in this phase. The API serves the richer snapshot but Dashboard.tsx still reads v1 fields.

### Phase 2 — core AM-facing views (7–10 days)

- Three-view shell with top-level AM/Pod selector + tab navigation
- AM Daily Triage: Act today / Movers / Wins panels
- Pod Rollup: pod selector + four pod widgets (tier distribution, AM leaderboard, signal heatmap, movers)
- Leadership / Book-wide: distribution overview + AM-level table + signal-mix analysis (trend chart deferred to Phase 5 once history accumulates)
- Card redesign: narrative-first (template), score chip, why-flagged expandable, trajectory sparklines, ↑/↓ arrow
- Drill-down modal extended: comms / usage / billing / performance / tickets / AM-notes tabs
- Data freshness header
- Tier-definition tooltips

### Phase 3 — workflow features (4–5 days)

- One-click "Contacted today" button + modal + KV writer (`am_actions:<am>:<entity_id>:<timestamp>`)
- AM notes carryover on cards (last 5) + drill-down history tab population from `am_actions`
- "This is wrong" thumbs-down per signal + KV writer (`signal_feedback:<entity_id>:<signal>:<timestamp>`)
- Pre-built filter chips
- AM-identity dropdown wired up + cookie persistence + query-param deep-link

### Phase 4 — Slack integration (3–4 days)

- Slack bot app deployed (config: channel IDs, AM-email-to-Slack-ID map)
- `/api/slack/digest-am` cron route — personal DM to each AM with top-5 list
- `/api/slack/digest-pod` cron route — pod-channel summary post
- Deep-link handling in dashboard: `?am=X&customer=Y` opens the right customer modal
- Failure mode: if Slack post fails for one AM, others still run. Errors logged but not surfaced in UI.

### Phase 5 — peer comparison + outcome tracking (3 days, partially deferrable)

- Pod / AM / company average overlays on every customer card
- Leadership view: trend-over-time charts (now that 30+ days of history exist)
- AM win-rate panel with the "data accumulating" placeholder for the first 30 days

### Phase 6 — polish (2–3 days)

- Haiku on-demand button + KV cache + cost monitoring
- Mobile responsive pass — primarily the card layout in AM Daily Triage
- Keyboard navigation (`j`/`k` to move between cards, `Enter` to open modal, `c` to mark contacted)
- Print stylesheet for AM 1:1 prep

### Critical path

Phases 0–4 are the v1 MVP. Phase 5 partially blocked on Phase 3's contact-logging data. Phase 6 is polish. Total v1: ~3–4 weeks of focused work. Full feature scope: ~5–6 weeks including Phases 5 and 6.

---

## 9. Risks

**Vercel 60s function ceiling.** Even with pre-aggregation, the refresh may bump against it once everything is layered in. Mitigation: measurement gate at end of Phase 1 — fall back to split-queue if over 50s. Cost of fallback: ~1 extra day of infra work + Vercel Queues setup.

**Mixpanel join key fragility.** The `"locationEntityId"` (quoted, camelCase) field is the only one that works. If Zoca's mobile-app team renames this field, our usage signal returns zero rows for everyone and we score 100% of customers as Dormant. Mitigation: regression test that asserts non-zero rows for a known sample, fails the refresh if zero, alerts on Slack.

**Slack bot scope approval.** Workspace admin may not approve `chat:write.public`. If denied, the bot can still send personal DMs but cannot post to pod channels without being added to each one. Mitigation: pre-add the bot to all 5 pod channels manually; switch to plain `chat:write` scope.

**AM win-rate is a lagging metric.** It needs 30+ days of "contacted today" data before it is meaningful. If the dashboard is judged on this signal before then, it will look broken. Mitigation: explicit "Win-rate populating — needs N more days" placeholder in UI; surface to leadership in writing during v1 rollout.

**Data team SLA.** We are dependent on two new Metabase cards before Phase 1 can fully leverage the pre-aggregate path. If the data team is slower than a week, Phase 1 falls back to hitting Aurora directly via the Dataset API — measurable refresh-time hit (likely pushes us into Phase 1 fallback infra).

**KV cost as history grows.** Vercel KV is $1/GB beyond 256 MB. At ~2 MB/day × 90 days = ~180 MB, we are inside free tier. But if snapshot size grows (more customers, more fields), we will cross. Monitor monthly.

**Composite weight mis-calibration.** The 50/30/20 weights are a starting point. After Phase 1 lands, the tier distribution may be skewed (too many HIGH, too few). Mitigation: review tier distribution against the Phase 0 cohort, adjust weights in `lib/config.ts` before Phase 2 ships. Treat the weights as a tunable, not a contract.

**Template-narrative monotony.** If every billing-flagged customer sees the same templated suggestion, AMs will tune it out. Mitigation: maintain 5–10 template variations per signal-dominance class, randomize selection. Haiku on-demand button is the escape valve for cases where the template feels stale.

**Existing v1 users may resist the change.** AMs who have built any habits around v1 will need to relearn. Mitigation: brief onboarding video + a "What's new" panel that auto-appears on first visit post-deploy.

---

## 10. Open items deferred to v2

- Google OAuth via NextAuth, with email-to-AM mapping from BaseSheet — replaces the dropdown
- Linear / HubSpot ticket enrichment — richer ticket data than BaseSheet flags
- Bidirectional Chargebee integration (e.g., trigger an invoice retry from the dashboard) — out of scope; dashboard stays read-only
- Mobile-native app
- ML-based churn prediction — the existing performance-prediction rule (do not surface predictions to customer-facing tooling) extends here
- Per-AM customization of which signals matter most — currently the same weights for everyone
- Integration with the AM Transition Toolkit (when an account moves from one AM to another, the new AM should inherit the notes history)

---

## Appendix A: Metabase card specifications

These are the two new Metabase questions we need the data team to create. Both should be configured as public CSV endpoints, refreshing daily at ~01:00 IST so they are fresh by the time our 22:00 UTC cron runs.

### A.1 Mixpanel daily rollup per entity

**Purpose:** pre-aggregate Mixpanel events from `mixpanelzocaappdata.export` so the dashboard's refresh job can pull a thin CSV instead of querying 4.4M events nightly.

**Database:** Aurora (db=7)

**Source table:** `mixpanelzocaappdata.export`

**Output schema (one row per entity_id, event_type, date for the last 90 days):**

| Column | Type | Notes |
| --- | --- | --- |
| `entity_id` | UUID | From `"locationEntityId"` field |
| `event_date` | DATE | Truncated from event timestamp |
| `event_type` | TEXT | One of the canonical event names |
| `event_count` | INT | Count of events for this (entity, event, date) tuple |
| `last_event_at` | TIMESTAMP | Most recent event timestamp in this bucket |

**Filters:**
- Event date ≥ now() - interval '90 days'
- `event_type` in the canonical list (App/Site Opened, $ae_session, Leads-View-Home, Leads-Click-Lead, Leads-View-GetLeads, Leads-Select-LeadStatusSheet, Leads-Click-LeadContact, Leads-Click-ChatCall, Leads-Click-DetailCopyNumber, Reviews-Click-ReviewReplyAI, Reviews-Done-ReviewReply, Review-Click-SendInviteSingle)
- `"locationEntityId"` IS NOT NULL

**Expected row count:** ~927 customers × 12 events × ~30 active days ≈ 330K rows. CSV size ~25 MB.

**Refresh cadence:** daily at 01:00 IST.

### A.2 Performance daily snapshot per entity

**Purpose:** pre-compute the performance trajectory flag inputs so the dashboard does not need to run six SQL queries per customer per night.

**Database:** Aurora (db=7) primarily, with one Postgres (db=2) join for `website.booking_enquiries`. Cross-db joins are not supported in Metabase — split into two cards if needed, or denormalize via a scheduled ETL into a single table the data team owns.

**Output schema (one row per entity_id per day):**

| Column | Type | Notes |
| --- | --- | --- |
| `entity_id` | UUID | |
| `snapshot_date` | DATE | |
| `gbp_clicks_peak_month` | INT | Peak monthly profile-click count in last 6 complete months |
| `gbp_clicks_current_month_complete` | INT | Most recent complete month |
| `gbp_clicks_in_progress_month` | INT | Current partial month, carried separately |
| `gbp_clicks_drop_pct` | FLOAT | (peak - current_complete) / peak * 100 |
| `ytd_leads` | INT | Count from `website.booking_enquiries`, current year |
| `prior_ytd_leads` | INT | Same period last year |
| `ytd_leads_change_pct` | FLOAT | |
| `active_ranking_count` | INT | From `local_seo.rank` where is_active = true |
| `rankings_top_3` | INT | |
| `rankings_top_10` | INT | |
| `rankings_outside_10` | INT | |
| `review_target_weekly` | INT | From filtered `entities.location_insights` |
| `reviews_last_12_weeks_total` | INT | From `reviews.reviews` |
| `weeks_with_zero_reviews` | INT | Out of last 12 |

**Critical filter for `entities.location_insights`:**

```sql
AND predicted_6_month_leads IS NOT NULL
AND with_zoca_6_month_profile_clicks IS NOT NULL
AND (monthly_predictions->>'nonIcpReason') IS NULL
ORDER BY created_at DESC LIMIT 1
```

Without this, ~52% of customers will show stale rows from old forecast runs.

**Complete-month rule for GBP clicks:** the in-progress month must be excluded from peak/current/drop calculations. Only months where the last day has passed count toward `gbp_clicks_peak_month` and `gbp_clicks_current_month_complete`. The partial month is exposed separately in `gbp_clicks_in_progress_month` for the trend chart.

**Expected row count:** ~927 customers × 1 row per day = ~927 rows/day, CSV size ~150 KB.

**Refresh cadence:** daily at 01:30 IST.

---

## Appendix B: Composite scoring reference

For implementation in `lib/scoring.ts` post-Phase-1.

```
composite = 0.15 * we_silent
          + 0.15 * client_silent
          + 0.12 * response_drop
          + 0.08 * volume_collapse
          + 0.30 * usage_decay
          + 0.20 * billing_health

Each component is 0–100. Composite range: 0–100.

flags.performance = (gbp_clicks_drop_pct >= 25 AND complete_month_basis = true)
                 OR (ytd_leads_change_pct <= -20)
                 OR (rankings_top_10_change <= -25%)

flags.tickets = (open_tickets_30d > 0) OR (unresolved_issues_last_30_days > 0)

tier = if composite >= 65 OR no_comms_90d OR no_mixpanel_90d: HIGH
       else if composite < 15 AND flag_count(flags) >= 2: WATCH
       else if composite >= 35: MED
       else if composite >= 15: LOW
       else: HEALTHY
```

The 50/30/20 split is the initial weighting. After Phase 1, review tier distribution against the Phase 0 cohort and adjust before Phase 2 ships.

---

## Appendix C: Repo file changes summary

| File | Status | Notes |
| --- | --- | --- |
| `lib/scoring.ts` | Rewrite | New signal functions + composite + flags + WATCH lane |
| `lib/refresh.ts` | Rewrite | Orchestrator with new data sources, daily snapshot writing |
| `lib/types.ts` | Extend | New `ScoredCustomer` shape, modifier flags, trajectory windows |
| `lib/mixpanel.ts` | New | Fetch + parse Mixpanel daily rollup CSV |
| `lib/performance.ts` | New | Fetch + parse performance daily snapshot CSV |
| `lib/billing.ts` | New | Chargebee invoices + transactions + auto-debit logic |
| `lib/slack.ts` | New | Slack bot client + DM + channel post helpers |
| `lib/templates.ts` | New | Narrative + suggested-action template engine |
| `lib/haiku.ts` | New | Haiku on-demand narrative generation |
| `lib/store.ts` | Extend | Daily-keyed snapshot read/write + 90-day pruner |
| `lib/chargebee.ts` | Extend | Add invoices + transactions endpoints |
| `lib/metabase.ts` | Keep | Comms portion unchanged |
| `lib/config.ts` | Extend | New weights, tier cuts, Slack channel map, AM list |
| `components/Dashboard.tsx` | Rewrite | Three views + cards + drill-down |
| `components/AMTriage.tsx` | New | Daily-inbox layout |
| `components/PodRollup.tsx` | New | Pod widgets |
| `components/Leadership.tsx` | New | Book-wide + trend |
| `components/CustomerCard.tsx` | New | Card with narrative + sparklines + actions |
| `components/CustomerModal.tsx` | New | Drill-down modal with tabs |
| `app/api/snapshot/route.ts` | Extend | Daily-keyed reads, query params for date |
| `app/api/customer/[entityId]/route.ts` | Extend | Include new tabs' data (usage, billing, performance, tickets, AM-notes) |
| `app/api/cron/refresh/route.ts` | Extend | New pipeline, measurement logging |
| `app/api/cron/prune/route.ts` | New | 90-day retention pruner |
| `app/api/cron/slack-digest-am/route.ts` | New | 9 AM IST personal DMs |
| `app/api/cron/slack-digest-pod/route.ts` | New | Pod channel summaries |
| `app/api/action/contacted/route.ts` | New | One-click "contacted today" writer |
| `app/api/action/feedback/route.ts` | New | "This is wrong" feedback writer |
| `app/api/narrative/[entityId]/route.ts` | New | Haiku on-demand narrative |
| `middleware.ts` | Extend | Exclude new cron + Slack endpoints |
| `vercel.json` | Extend | Add 3 new cron schedules |
| `tailwind.config.ts` | Keep | Theme unchanged |
| `app/globals.css` | Keep | Theme unchanged |

---

## Sign-off checklist

Before kicking off Phase 0, confirm:

- [ ] Data team has acknowledged the two card requests in Appendix A
- [ ] Slack workspace admin has accepted the bot app submission
- [ ] Vercel KV upgrade path is approved with whoever owns billing
- [ ] CS leadership has reviewed the AM-comprehension feature list and signed off on the 9 AM IST Slack digest cadence
- [ ] We have agreed which AM (one of the 13 active) will be the v1 dogfood user for Phase 2 review
- [ ] The Phase 0 known-good cohort of 20 customers is identified and saved

Once those are checked, Phase 0 + Phase 1 can start in parallel.
