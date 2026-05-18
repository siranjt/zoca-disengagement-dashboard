# Beacon

A Next.js 14 App Router dashboard that scores Zoca's live Chargebee customer book against four disengagement signals — refreshed nightly by Vercel Cron, cached in Vercel KV, served hot to the UI.

Shares the Zoca dark-mode theme, Basic-Auth gate, and shape with the AM Ticket Journey dashboard.

---

## Architecture

```
                 ┌──────────────────── Vercel Cron (22:00 UTC) ────────────────────┐
                 │                                                                  │
                 ▼                                                                  │
Chargebee  ─► /api/cron/refresh  ──►  buildSnapshot()  ──►  writeSnapshot() ──► Vercel KV
   │                                         ▲                                      │
   └─ Metabase (5 public CSVs) ──────────────┘                                      │
                                                                                    │
                                           UI page load ◄── /api/snapshot ◄─────────┘
```

**Live data sources**
- Chargebee REST v2 — `active`, `non_renewing`, `in_trial` subscriptions
- Metabase public CSV endpoints (stable UUIDs, hard-coded in `lib/config.ts`):
  - BaseSheet — `customer_id → entity_id` bridge, AM/biz data
  - App Chat, Email, Phone, Video (Fireflies), SMS — 120 days of comms

**Scoring (identical to the original analyze.py)**
- 5 rolling windows: 7 / 14 / 30 / 60 / 90 days
- 4 signals scored 0–100:
  - **We went silent** — days since our last outbound
  - **Client went silent** — days since inbound, gated on prior activity
  - **Response drop** — in/out ratio recent vs. days 30–90
  - **Volume/channel collapse** — total volume + channel breadth decline
- Composite = 30%·WeSilent + 30%·ClientSilent + 25%·ResponseDrop + 15%·VolumeCollapse
- Tier cuts: HIGH ≥ 65 (or zero comms in 90d), MEDIUM 35–64, LOW 15–34, HEALTHY < 15

## Tech stack

- **Framework:** Next.js 14.2.x (App Router, TypeScript, Node runtime)
- **Styling:** Tailwind CSS + Zoca dark-mode tokens (copied verbatim from the AM dashboard)
- **Fonts:** Inter (body) + Montserrat (display) via `next/font/google`
- **Charts:** Chart.js v4 + react-chartjs-2 (Bar, Line, Doughnut)
- **Hosting:** Vercel (Pro recommended — cron route is capped at 10s on Hobby; refresh routinely runs ~20–30s)
- **Auth:** HTTP Basic Auth via middleware (shared password, same pattern as AM dashboard)
- **Storage:** Vercel KV — single `disengagement:snapshot:latest` blob; splits into two keys automatically if payload > 900 KB
- **Cron auth:** Bearer token via `CRON_SECRET`

## File layout

```
zoca-disengagement-dashboard/
├── app/
│   ├── layout.tsx                  Inter + Montserrat fonts
│   ├── page.tsx                    Sticky nav + hero + Dashboard + footer
│   ├── globals.css                 Zoca theme, motion, button classes
│   └── api/
│       ├── health/route.ts         GET /api/health (unauthed)
│       ├── snapshot/route.ts       GET /api/snapshot [?rebuild=1]
│       ├── customer/[entityId]/route.ts   drill-down fetch
│       └── cron/refresh/route.ts   Vercel Cron target (Bearer auth)
├── components/
│   ├── Dashboard.tsx               The big client component — tabs, charts, filters, modal
│   └── ZocaLogo.tsx                Inline SVG wordmark (lavender #F3EDFD)
├── lib/
│   ├── config.ts                   Metabase URLs, tier cutoffs, signal weights
│   ├── types.ts                    Shared TS types (Snapshot, ScoredCustomer, ...)
│   ├── chargebee.ts                Paginated /subscriptions pull (serialized across statuses)
│   ├── metabase.ts                 BaseSheet + 5 comms CSVs, with channel directionality rules
│   ├── scoring.ts                  Port of analyze.py: computeMetrics() + scoreCustomer()
│   ├── refresh.ts                  Orchestrator: fetch + score → Snapshot
│   └── store.ts                    Vercel KV wrapper (with in-memory fallback)
├── middleware.ts                   HTTP Basic Auth — skips /api/health + /api/cron/*
├── tailwind.config.ts              Zoca dark-mode brand tokens (identical to AM dashboard)
├── vercel.json                     Cron schedule `0 22 * * *`
├── .env.example
└── README.md
```

## Local development

```bash
cp .env.example .env.local
# Fill in CHARGEBEE_API_KEY, DASHBOARD_USER, DASHBOARD_PASSWORD, CRON_SECRET
npm install
npm run dev
# → http://localhost:3000 (Basic Auth: DASHBOARD_USER / DASHBOARD_PASSWORD)
```

First load will hit `/api/snapshot` with no KV configured → falls back to in-memory snapshot and does a live rebuild (~20s).

## Deploy

### 1. Push to GitHub

```bash
git init -b main
git add .
git commit -m "Initial commit"
gh repo create <owner>/zoca-disengagement-dashboard --private --source=. --remote=origin --push
```

### 2. Create the Vercel project

1. https://vercel.com/new → Import the repo.
2. **Before clicking Deploy**, expand **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `CHARGEBEE_SITE` | `zoca` |
   | `CHARGEBEE_API_KEY` | your live Chargebee key |
   | `DASHBOARD_USER` | shared username |
   | `DASHBOARD_PASSWORD` | strong shared password |
   | `CRON_SECRET` | `openssl rand -hex 32` |

3. Deploy. (On Hobby, set **Function Region** somewhere close to Chargebee's API for slightly faster pulls.)

### 3. Attach Vercel KV

1. Project → Storage → **Connect Database** → KV → pick region → Connect.
2. Vercel automatically injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` as env vars.
3. Redeploy (or wait for the next push) so the build picks them up.

### 4. Seed the snapshot

The UI calls `/api/snapshot` on every load. On the very first load, KV is empty and the route rebuilds live. For a warm start, hit the cron route manually once:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-project>.vercel.app/api/cron/refresh
```

### 5. Cron

`vercel.json` schedules `/api/cron/refresh` at `0 22 * * *` (22:00 UTC, ~3:30 AM IST). Vercel manages the cron automatically — no config needed beyond that file.

## Refresh cadence & on-demand rebuilds

- **Nightly (Vercel Cron)** — `/api/cron/refresh` re-scores everything and writes to KV.
- **On-demand** — the dashboard has a **↻ Refresh** button that calls `/api/snapshot?rebuild=1`. Same pipeline, cached result.
- **Manual cron hit** — `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/refresh` (useful for redeploys).

## Gotchas

- **Vercel Hobby 10s timeout.** The first build will pull ~1100 subs + 5 CSVs (~80 MB total) and score ~900 customers. That's 20–30s. Upgrade to Pro ($20/mo) for the 60s ceiling, or let the cron do it off-peak and only read cached results in the UI (the default).
- **Metabase endpoint freshness.** The 5 CSV UUIDs in `lib/config.ts` are stable, but if a Metabase admin deletes/rewrites a card, those URLs break. The refresh surfaces per-source errors in the Snapshot; they're shown in the Overview methodology card.
- **Chargebee pagination safety cap.** `lib/chargebee.ts` stops at 80 pages per status (8000 subs per status). Zoca's book is well below that; raise if you grow.
- **Customers without an entity_id mapping** (i.e., not in BaseSheet) are still surfaced but get zero comms events and land in HIGH as "Zero comms in 90d". They're worth triaging — usually means the BaseSheet hasn't caught up with a new signup.
- **KV size limits.** A single snapshot with 900 customers is ~700 KB JSON. `store.ts` auto-splits into two keys if it crosses 900 KB; don't need to worry unless the book 4x's.
- **Channel directionality — easy to flip.** `Received_By_Client` means the client received it, which means *we* sent it → `out`. Opposite for SMS/email. See `lib/metabase.ts`.
- **Video events are counted as mutual.** A Fireflies meeting produces one `in` event and one `out` event — it's a two-way touch, not a ticket.
- **Middleware skip for cron.** The cron route uses Bearer auth, so the Basic Auth middleware explicitly excludes `/api/cron/*`. Don't add it back.

## Visual theme

Identical to the AM Ticket Journey dashboard — deep purple background (`#0a0422`), white text, pink+purple accent glows, Montserrat black displays, Inter body. See the AM replication guide §4 for the full token list. **Do not change the look.**

## Extending

- Add a new signal: score in `lib/scoring.ts`, surface in `lib/types.ts` + `refresh.ts` (signalCounts), add a card in `Dashboard.tsx` Signals tab.
- Add a new tab: append to `TABS` in `Dashboard.tsx`, write the component, wire it up in the tab-body switch.
- Switch tiers / weights: all in `lib/config.ts` — no other changes required.
- Filter by MRR or plan: the `ScoredCustomer` carries `plan_amount` and `mrr_basesheet`; add a filter and a UI control.
