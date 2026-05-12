"use client";

import type { PerformanceMetrics } from "@/lib/types";

type Props = {
  performance: PerformanceMetrics | null;
};

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Math.round(n).toLocaleString();
}

function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(0)}%`;
}

function PctBadge({
  value,
  lowerIsBetter,
  title,
}: {
  value: number | null | undefined;
  lowerIsBetter?: boolean;
  title?: string;
}) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return (
      <span className="text-[10px] text-zoca-text-soft" title={title}>
        —
      </span>
    );
  }
  if (value === 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-zoca-pill bg-zoca-bg-3/40 px-1.5 py-0.5 text-[10px] font-medium text-zoca-text-soft"
        title={title}
      >
        0%
      </span>
    );
  }
  const positive = value > 0;
  const isGood = lowerIsBetter ? !positive : positive;
  const tone = isGood
    ? "bg-emerald-500/15 text-emerald-300"
    : "bg-rose-500/15 text-rose-300";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-zoca-pill px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${tone}`}
      title={title}
    >
      {positive ? "▲" : "▼"} {Math.abs(value).toFixed(0)}%
    </span>
  );
}

function DistributionBar({
  top3,
  top10,
  outside,
}: {
  top3: number | null;
  top10: number | null;
  outside: number | null;
}) {
  const a = top3 ?? 0;
  const b = top10 ?? 0;
  const c = outside ?? 0;
  const total = a + b + c;
  if (total === 0) return <span className="text-[10px] text-zoca-text-soft">—</span>;
  const pA = (a / total) * 100;
  const pB = (b / total) * 100;
  const pC = (c / total) * 100;
  return (
    <div
      className="flex h-1.5 w-32 overflow-hidden rounded-full bg-zoca-bg-3/40"
      role="img"
      aria-label={`Keyword rank distribution: ${a} top-3, ${b} top-10, ${c} outside`}
      title={`${a} top-3 · ${b} top-10 · ${c} outside-10`}
    >
      {pA > 0 && <div className="bg-emerald-400" style={{ width: `${pA}%` }} />}
      {pB > 0 && <div className="bg-amber-400" style={{ width: `${pB}%` }} />}
      {pC > 0 && <div className="bg-rose-400" style={{ width: `${pC}%` }} />}
    </div>
  );
}

export default function V2PerformancePanel({ performance }: Props) {
  if (!performance) {
    return (
      <div className="mt-3 rounded-zoca border border-dashed border-zoca-border-2 bg-zoca-bg-2/20 px-3 py-2 text-[11px] text-zoca-text-soft">
        Performance signals unavailable for this entity (no Metabase row).
      </div>
    );
  }

  const p = performance;

  return (
    <div className="mt-3 rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/20 px-3 py-2.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zoca-text-soft">
          Performance signals
        </h4>
        {p.flag && (
          <span
            className="rounded-zoca-pill bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-300"
            title={p.flag_reasons.join(" · ") || "Performance trajectory flagged"}
          >
            ⚑ Trajectory concern
          </span>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 text-[12px]">
        {/* GBP profile clicks */}
        <dt className="text-zoca-text-soft" title="Google Business Profile profile-click count, complete months only">
          GBP clicks
        </dt>
        <dd className="flex items-center gap-2 text-zoca-text-muted">
          <span
            className="font-medium tabular-nums text-zoca-text-primary"
            title="Current complete month"
          >
            {formatNumber(p.gbp_clicks_current_complete_month)}
          </span>
          <span className="text-zoca-text-soft" aria-hidden>
            /
          </span>
          <span
            className="text-zoca-text-soft tabular-nums"
            title="Peak complete month"
          >
            peak {formatNumber(p.gbp_clicks_peak_complete_month)}
          </span>
          {p.gbp_clicks_in_progress_month !== null && (
            <span
              className="text-[10px] text-zoca-text-soft tabular-nums"
              title="In-progress month (partial — not used for peak/dip)"
            >
              · running {formatNumber(p.gbp_clicks_in_progress_month)}
            </span>
          )}
        </dd>
        <dd className="text-right">
          <PctBadge
            value={p.gbp_clicks_drop_pct === null ? null : -p.gbp_clicks_drop_pct}
            lowerIsBetter={false}
            title="GBP profile-click change from peak complete month to current complete month"
          />
        </dd>

        {/* Keyword rankings */}
        <dt className="text-zoca-text-soft" title="Active keyword rankings from local SEO tracking">
          Keywords
        </dt>
        <dd className="flex items-center gap-2 text-zoca-text-muted">
          <span
            className="font-medium tabular-nums text-zoca-text-primary"
            title="Total active rankings"
          >
            {formatNumber(p.active_ranking_count)}
          </span>
          <DistributionBar
            top3={p.rankings_top_3}
            top10={p.rankings_top_10}
            outside={p.rankings_outside_10}
          />
          <span className="text-[10px] text-zoca-text-soft tabular-nums">
            <span className="text-emerald-300">{p.rankings_top_3 ?? 0}</span> /{" "}
            <span className="text-amber-300">{p.rankings_top_10 ?? 0}</span> /{" "}
            <span className="text-rose-300">{p.rankings_outside_10 ?? 0}</span>
          </span>
        </dd>
        <dd className="text-right text-[10px] text-zoca-text-soft">top-3 / top-10 / out</dd>

        {/* Reviews 12w */}
        <dt className="text-zoca-text-soft" title="Reviews collected in last 12 weeks">
          Reviews 12w
        </dt>
        <dd className="flex items-center gap-2 text-zoca-text-muted">
          <span
            className="font-medium tabular-nums text-zoca-text-primary"
            title="Reviews in last 12 weeks"
          >
            {formatNumber(p.reviews_last_12_weeks_total)}
          </span>
          {p.weeks_with_zero_reviews !== null && p.weeks_with_zero_reviews > 0 && (
            <span
              className={`text-[10px] tabular-nums ${
                p.weeks_with_zero_reviews >= 4 ? "text-rose-300" : "text-zoca-text-soft"
              }`}
              title={`${p.weeks_with_zero_reviews} weeks with no reviews collected`}
            >
              · {p.weeks_with_zero_reviews}wk zero
            </span>
          )}
          {p.review_target_weekly !== null && (
            <span
              className="text-[10px] text-zoca-text-soft tabular-nums"
              title="Recommended weekly review target"
            >
              · target {formatNumber(p.review_target_weekly)}/wk
            </span>
          )}
        </dd>
        <dd />

        {/* YTD leads */}
        <dt className="text-zoca-text-soft" title="Year-to-date booking enquiries from GBP">
          YTD leads
        </dt>
        <dd className="flex items-center gap-2 text-zoca-text-muted">
          <span
            className="font-medium tabular-nums text-zoca-text-primary"
            title="YTD leads"
          >
            {formatNumber(p.ytd_leads)}
          </span>
          {p.prior_ytd_leads !== null && (
            <span
              className="text-[10px] text-zoca-text-soft tabular-nums"
              title="Prior-year YTD leads"
            >
              · prior {formatNumber(p.prior_ytd_leads)}
            </span>
          )}
        </dd>
        <dd className="text-right">
          <PctBadge
            value={p.ytd_leads_change_pct}
            lowerIsBetter={false}
            title="YTD lead-count change vs prior year"
          />
        </dd>
      </dl>

      {p.flag && p.flag_reasons.length > 0 && (
        <details className="mt-2 group">
          <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-rose-300/80 hover:text-rose-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40">
            Why flagged? ({p.flag_reasons.length})
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11px] text-zoca-text-muted">
            {p.flag_reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
