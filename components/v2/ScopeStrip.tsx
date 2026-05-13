import type { SnapshotV2 } from "@/lib/types";

/**
 * Phase 13.1: thin strip at the top of /v2 and /v2/manager surfacing the
 * data-scope of the dashboard — total customers, distinct Chargebee
 * customer_ids, and multi-location count. Hover for the active-sub universe
 * explainer.
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
      className="border-b border-zoca-border bg-zoca-bg-2/30 px-4 py-2 text-[11px] text-zoca-text-soft md:px-6"
      title={tooltip}
    >
      Showing{" "}
      <span className="font-semibold text-zoca-text-primary">
        {scope.customer_count.toLocaleString()}
      </span>{" "}
      customers across{" "}
      <span className="font-semibold text-zoca-text-primary">
        {scope.customer_id_count.toLocaleString()}
      </span>{" "}
      Chargebee customer_ids
      {scope.multi_location_count > 0 && (
        <>
          {" · "}
          <span className="font-semibold text-zoca-text-primary">
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
