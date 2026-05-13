import type { SnapshotV2 } from "@/lib/types";

/**
 * Phase 13.1 (light-themed in 17.D): thin strip at the top of /v2 and
 * /v2/manager surfacing the data-scope of the dashboard — total
 * customers, distinct Chargebee customer_ids, and multi-location count.
 * Hover for the active-sub universe explainer.
 *
 * Phase 17.D — restyled to a Zoca brand light card matching V2RefreshBar.
 */
export default function ScopeStrip({ scope }: { scope?: SnapshotV2["scope"] }) {
  if (!scope) return null;
  const statusLabel = scope.statuses.map((s) => s.replace(/_/g, "-")).join(", ");
  const tooltip =
    `The dashboard only includes customers with an active Chargebee subscription ` +
    `(${statusLabel}). Multi-location customers contribute one row per entity_id. ` +
    `Customers without an active subscription do not appear here.`;
  return (
    <div
      className="mx-6 mt-4 mb-2 rounded-2xl px-5 py-2.5 text-[11px] text-zoca-text-2 flex items-center gap-1 flex-wrap"
      style={{
        background: "#ffffff",
        border: "1px solid var(--zoca-border)",
        boxShadow: "0 1px 2px rgba(11,5,29,0.03)",
      }}
      title={tooltip}
    >
      <span className="zoca-micro-label mr-2">Scope</span>
      Showing{" "}
      <span className="font-semibold text-zoca-text">
        {scope.customer_count.toLocaleString()}
      </span>{" "}
      customers across{" "}
      <span className="font-semibold text-zoca-text">
        {scope.customer_id_count.toLocaleString()}
      </span>{" "}
      Chargebee customer_ids
      {scope.multi_location_count > 0 && (
        <>
          {" · "}
          <span className="font-semibold text-zoca-text">
            {scope.multi_location_count}
          </span>{" "}
          multi-location
        </>
      )}
      {" · Active-sub universe only ("}
      {statusLabel}
      {")"}
    </div>
  );
}
