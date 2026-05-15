"use client";

import type { ScoredCustomerV2 } from "@/lib/types";
import type { Stoplight } from "@/lib/config";
import { buildMailto, buildTelLink, buildHubspotLocationUrl} from "@/lib/contact-links";
import V2SnapshotTimeline from "./V2SnapshotTimeline";

type TrendPoint = { date: string; composite: number };

type Props = {
  customer: ScoredCustomerV2;
  trend: TrendPoint[];
};

const STOPLIGHT_LABEL: Record<Stoplight, string> = {
  RED: "Needs attention",
  YELLOW: "Keep an eye on",
  GREEN: "Doing fine",
};

const STOPLIGHT_TONE: Record<Stoplight, string> = {
  RED: "bg-rose-500/18 text-rose-700 border-rose-300/60",
  YELLOW: "bg-amber-500/18 text-amber-700 border-amber-300/60",
  GREEN: "bg-emerald-500/18 text-emerald-700 border-emerald-300/60",
};

const STOPLIGHT_BORDER: Record<Stoplight, string> = {
  RED: "border-rose-300/60",
  YELLOW: "border-amber-300/60",
  GREEN: "border-emerald-300/60",
};

function trajectoryArrow(t: ScoredCustomerV2["signals_v2"]["trajectory_7d"]): {
  symbol: string;
  className: string;
  title: string;
} {
  if (t === "improving") {
    return {
      symbol: "▲",
      className: "text-emerald-700",
      title: "Composite improving vs. 7 days ago",
    };
  }
  if (t === "worsening") {
    return {
      symbol: "▼",
      className: "text-rose-700",
      title: "Composite worsening vs. 7 days ago",
    };
  }
  if (t === "stable") {
    return {
      symbol: "•",
      className: "text-zoca-text-2",
      title: "Composite stable vs. 7 days ago",
    };
  }
  return {
    symbol: "—",
    className: "text-zoca-text-2",
    title: "No prior composite to compare",
  };
}

function daysSinceIso(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 86400_000));
}

function V2DetailHeader({ customer, trend }: Props) {
  const s = customer.signals_v2;
  const traj = trajectoryArrow(s.trajectory_7d);
  const recentlyContacted = (() => {
    const d = daysSinceIso(customer.metrics?.last_out_iso ?? null);
    return d !== null && d <= 7;
  })();

  // The trend prop is still accepted for backward compatibility with the
  // existing client wrapper, but the rich timeline now drives the visual.
  void trend;

  return (
    <section
      className={`rounded-zoca-lg border bg-white p-5 md:p-6 ${STOPLIGHT_BORDER[s.stoplight]}`}
      aria-label="Customer detail header"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            {(() => {
              const loc = (customer.hubspot as any)?.hubspot_location_record_id as string | undefined;
              const label = customer.company || customer.entity_id.slice(0, 8);
              const titleText = `Open ${label} in HubSpot Locations (new tab)`;
              if (!loc) {
                return (
                  <h1 className="text-2xl font-semibold text-zoca-text">{label}</h1>
                );
              }
              return (
                <a
                  href={buildHubspotLocationUrl(loc)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={titleText}
                  className="group/biztitle inline-flex items-baseline gap-1 text-2xl font-semibold text-zoca-text no-underline hover:text-zoca-pink-cta"
                >
                  <h1 className="m-0 inline">{label}</h1>
                  <i
                    className="ti ti-external-link opacity-0 transition-opacity group-hover/biztitle:opacity-100"
                    aria-hidden
                    style={{ fontSize: "14px" }}
                  />
                </a>
              );
            })()}
            <span
              className={`rounded-zoca-pill border px-2 py-0.5 text-[11px] font-semibold ${STOPLIGHT_TONE[s.stoplight]}`}
              title={STOPLIGHT_LABEL[s.stoplight]}
            >
              {s.stoplight} · {STOPLIGHT_LABEL[s.stoplight]}
            </span>
            {customer.hubspot?.icp_tier && (
              <span
                className={`rounded-zoca-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  customer.hubspot.icp_tier === "Tier 1"
                    ? "bg-emerald-500/18 text-emerald-700"
                    : customer.hubspot.icp_tier === "Tier 2"
                      ? "bg-amber-500/18 text-amber-700"
                      : "bg-rose-500/18 text-rose-700"
                }`}
                title={`HubSpot ICP rating: ${customer.hubspot.icp_tier}`}
              >
                ICP {customer.hubspot.icp_tier.replace("Tier ", "")}
              </span>
            )}
            {customer.hubspot?.open_deal_count !== undefined &&
              customer.hubspot.open_deal_count > 0 && (
                <span
                  className="rounded-zoca-pill bg-violet-500/18 px-2 py-0.5 text-[10px] font-medium text-violet-700"
                  title={`${customer.hubspot.open_deal_count} open deal${
                    customer.hubspot.open_deal_count === 1 ? "" : "s"
                  }${
                    customer.hubspot.open_deal_stages
                      ? ` · ${customer.hubspot.open_deal_stages.join(", ")}`
                      : ""
                  }`}
                >
                  💼 {customer.hubspot.open_deal_count} deal
                  {customer.hubspot.open_deal_count === 1 ? "" : "s"}
                </span>
              )}
            {recentlyContacted && (
              <span
                className="rounded-zoca-pill bg-emerald-500/18 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
                title="An outbound contact has been logged in the last 7 days"
              >
                ✓ Contacted recently
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-zoca-text-2">
            {customer.am_name && (
              <a
                href={`/v2?am=${encodeURIComponent(customer.am_name)}`}
                className="font-medium text-zoca-text hover:text-zoca-pink-cta"
                title={`Filter dashboard to ${customer.am_name}'s book`}
              >
                {customer.am_name}
              </a>
            )}
            {customer.plan_amount > 0 && (
              <span className="tabular-nums">
                ${customer.plan_amount.toFixed(0)}/mo
              </span>
            )}
            {customer.pod && <span>· {customer.pod}</span>}
            {customer.entity_id && (
              <span
                className="inline-flex items-center gap-1 font-mono text-[10px] text-zoca-text-2"
                title="Location entity_id (BaseSheet / HubSpot Locations record link)"
              >
                · <span className="select-all">{customer.entity_id}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.clipboard) {
                      void navigator.clipboard.writeText(customer.entity_id);
                    }
                  }}
                  className="rounded-zoca-pill border border-zoca-border bg-white px-1.5 py-0 text-[9px] font-medium text-zoca-text-2 hover:bg-zoca-bg-tint hover:text-zoca-text"
                  title="Copy entity_id"
                  aria-label="Copy entity_id"
                >
                  copy
                </button>
              </span>
            )}
          </div>

          {s.reason_one_line && (
            <p className="mt-3 text-[13px] leading-relaxed text-zoca-text">
              {stripBold(s.reason_one_line)}
            </p>
          )}

          {/* Contact direct actions */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {customer.email && (
              <a
                href={buildMailto(customer.email, {
                  bizname: customer.company || undefined,
                  amName: customer.am_name || undefined,
                })}
                className="inline-flex items-center gap-1 rounded-zoca-pill border border-zoca-border bg-white px-2.5 py-1 text-[11px] font-medium text-zoca-text hover:bg-zoca-bg-tint"
                title={`Email ${customer.email}`}
              >
                <i className="ti ti-mail" aria-hidden />
                Email
              </a>
            )}
            {customer.phone && (
              <a
                href={buildTelLink(customer.phone)}
                className="inline-flex items-center gap-1 rounded-zoca-pill border border-zoca-border bg-white px-2.5 py-1 text-[11px] font-medium text-zoca-text hover:bg-zoca-bg-tint"
                title={`Call ${customer.phone}`}
              >
                <i className="ti ti-phone" aria-hidden />
                Call
              </a>
            )}
          </div>
        </div>

        {/* Right-side composite cluster */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-baseline gap-2">
            <span
              className="text-3xl font-semibold tabular-nums text-zoca-text"
              title="Current composite score"
            >
              {s.composite}
            </span>
            <span
              className={`text-[14px] font-semibold ${traj.className}`}
              title={traj.title}
            >
              {traj.symbol}
              {s.composite_7d_ago !== null && s.composite_7d_ago !== undefined
                ? ` ${Math.abs(s.composite - s.composite_7d_ago)}`
                : ""}
            </span>
          </div>
          <div
            className="text-[10px] uppercase tracking-wider text-zoca-text-2"
            title="Composite score weights comms · usage · billing with performance/tickets modifiers"
          >
            composite · 0–100
          </div>
        </div>
      </div>

      {/* Phase 30 — Inline snapshot timeline (replaces the tiny sparkline). */}
      <div className="mt-4 rounded-zoca-lg border border-zoca-border bg-white p-3 md:p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-zoca-text-2 font-semibold">
            Composite over last 90 days
          </span>
          <a
            href={`/v2/customer/${encodeURIComponent(customer.entity_id)}/timeline`}
            className="text-[11px] font-medium text-zoca-pink-cta hover:underline"
            title="Open the full-page timeline view"
          >
            Expand ↗
          </a>
        </div>
        <V2SnapshotTimeline
          entityId={customer.entity_id}
          variant="inline"
          days={90}
          bizname={customer.company ?? undefined}
        />
      </div>
    </section>
  );
}

/** Strip <b>...</b> markup down to plain text for the header summary line. */
function stripBold(text: string): string {
  if (!text) return "";
  return text
    .replace(/<\s*\/?\s*b\s*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export default V2DetailHeader;
