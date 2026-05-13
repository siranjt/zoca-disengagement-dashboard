"use client";

import { useEffect, useMemo, useState } from "react";
import type { ScoredCustomerV2 } from "@/lib/types";
import V2CustomerCard from "./V2CustomerCard";
import V2AMBookTrendStrip from "./V2AMBookTrendStrip";

type CustomerTrendPoint = { date: string; composite: number };

type Props = {
  amName: string;
  pod: string;
  customers: ScoredCustomerV2[];
  generatedAt: string;
  pinnedSet?: Set<string>;
  onTogglePinned?: (
    entityId: string,
    meta: { customer_id: string | null; bizname: string | null },
  ) => void;
};

type FilterKey = "pinned" | "act" | "improving" | "quiet" | "all";
type SortKey = "urgency" | "plan" | "lasttouch";

const ACT_TODAY_TOP_N = 10;

export default function V2AMTriage({ amName, pod, customers, generatedAt, pinnedSet, onTogglePinned }: Props) {
  const [filter, setFilter] = useState<FilterKey>("act");
  const [sort, setSort] = useState<SortKey>("urgency");
  const [query, setQuery] = useState<string>("");
  const [customerTrends, setCustomerTrends] = useState<Record<string, CustomerTrendPoint[]>>({});
  const [contactedRecently, setContactedRecently] = useState<Set<string>>(new Set());

  // Fetch the set of entities this AM has contacted in the last 7 days so we
  // can dim those cards and show a 'Contacted Xd ago' chip.
  useEffect(() => {
    if (!amName) {
      setContactedRecently(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v2/am/${encodeURIComponent(amName)}/contacted-recently?days=7`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const json = (await res.json()) as { entity_ids: string[] };
        if (cancelled) return;
        setContactedRecently(new Set(json.entity_ids || []));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [amName]);

  useEffect(() => {
    if (customers.length === 0) {
      setCustomerTrends({});
      return;
    }
    let cancelled = false;
    const ids = customers.map((c) => c.entity_id).slice(0, 200);
    (async () => {
      try {
        const params = new URLSearchParams({ days: "14", ids: ids.join(",") });
        const res = await fetch(`/api/v2/trends/customers?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          data: { entity_id: string; points: CustomerTrendPoint[] }[];
        };
        if (cancelled) return;
        const map: Record<string, CustomerTrendPoint[]> = {};
        for (const b of json.data || []) map[b.entity_id] = b.points;
        setCustomerTrends(map);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customers]);

  // ---------------------------------------------------------------------------
  // Bucketing logic
  // ---------------------------------------------------------------------------
  const baseBuckets = useMemo(() => {
    // Phase 17.B.2: align "Need to call today" lane with the "Need to call"
    // KPI tile (which counts strictly RED). Previously this bucket included
    // YELLOW capped at top-N, which caused a visible mismatch ("10 to act on"
    // vs KPI "3"). Now both are RED-only — pre-launch RED still excluded.
    const act = customers
      .filter(
        (c) =>
          !c.signals_v2.pre_launch && c.signals_v2.stoplight === "RED",
      )
      .sort((a, b) => b.signals_v2.composite - a.signals_v2.composite);

    const improving = customers
      .filter((c) => c.signals_v2.stoplight === "GREEN" && c.signals_v2.composite < 20)
      .sort((a, b) => a.signals_v2.composite - b.signals_v2.composite)
      .slice(0, 15);

    const quiet30 = customers
      .filter(
        (c) =>
          c.metrics.days_since_in >= 30 ||
          (c.metrics.last_any_iso === null && c.signals_v2.tier !== "HEALTHY"),
      )
      .sort((a, b) => b.metrics.days_since_in - a.metrics.days_since_in)
      .slice(0, 20);

    // 'all' bucket: the full book sorted by composite desc; pre-launch
    // customers retained (the AM still wants to see them, they just don't
    // appear in 'Act today').
    const all = [...customers].sort(
      (a, b) => b.signals_v2.composite - a.signals_v2.composite,
    );

    const pinned = pinnedSet
      ? customers
          .filter((c) => pinnedSet.has(c.entity_id))
          .sort((a, b) => b.signals_v2.composite - a.signals_v2.composite)
      : [];

    return { pinned, act, improving, quiet: quiet30, all };
  }, [customers, pinnedSet]);

  const filterCounts = {
    pinned: baseBuckets.pinned.length,
    act: baseBuckets.act.length,
    improving: baseBuckets.improving.length,
    quiet: baseBuckets.quiet.length,
    all: baseBuckets.all.length,
  };

  // If the user is on the "pinned" filter and their pinned count drops to
  // 0 (e.g. they just unpinned everything), fall back to the default lane.
  useEffect(() => {
    if (filter === "pinned" && filterCounts.pinned === 0) {
      setFilter("act");
    }
  }, [filter, filterCounts.pinned]);

  // Apply search + sort to current filter's customers
  const filtered = useMemo(() => {
    let list = baseBuckets[filter];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((c) => (c.company || "").toLowerCase().includes(q));
    }
    // Sort within filter
    const sorted = [...list];
    switch (sort) {
      case "plan":
        sorted.sort((a, b) => b.plan_amount - a.plan_amount);
        break;
      case "lasttouch":
        sorted.sort(
          (a, b) => b.metrics.days_since_in - a.metrics.days_since_in,
        );
        break;
      case "urgency":
      default:
        if (filter === "improving") {
          sorted.sort((a, b) => a.signals_v2.composite - b.signals_v2.composite);
        } else {
          sorted.sort((a, b) => b.signals_v2.composite - a.signals_v2.composite);
        }
        break;
    }
    return sorted;
  }, [baseBuckets, filter, query, sort]);

  // Hero — count + label
  const heroCount = filtered.length;
  const heroLabelRich = (() => {
    if (filter === "pinned") {
      if (query.trim()) {
        return `${heroCount} match${heroCount === 1 ? "" : "es"} in pinned`;
      }
      if (heroCount === 0) {
        return "Nothing pinned yet. Click the pin icon on any customer card to add it here.";
      }
      return `You have ${heroCount} pinned customer${heroCount === 1 ? "" : "s"}`;
    }
    if (filter === "act") {
      if (query.trim()) {
        return `${heroCount} match${heroCount === 1 ? "" : "es"} for "${query.trim()}"`;
      }
      if (heroCount === 0) return "All clear — nobody urgent in your book today";
      return null; // use rich rendering below
    }
    if (filter === "improving") {
      if (heroCount === 0) return "No one's clearly improving this week";
      return `${heroCount} customer${heroCount === 1 ? "" : "s"} doing well`;
    }
    if (filter === "quiet") {
      if (heroCount === 0) return "No one's been quiet for 30+ days";
      return `${heroCount} customer${heroCount === 1 ? "" : "s"} you haven't heard from in 30+ days`;
    }
    // 'all' filter
    if (query.trim()) {
      return `${heroCount} match${heroCount === 1 ? "" : "es"} for "${query.trim()}" in your book`;
    }
    return `${heroCount} customer${heroCount === 1 ? "" : "s"} in your book`;
  })();

  return (
    <section className="mt-2">
      {/* Book trend strip — last 14 days */}
      {amName && <V2AMBookTrendStrip amName={amName} days={14} />}
      {/* Hero */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        {heroLabelRich !== null ? (
          <h1
            className="text-zoca-text"
            style={{
              fontSize: "clamp(22px, 2.8vw, 28px)",
              fontWeight: 800,
              letterSpacing: "-0.025em",
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            {heroLabelRich}
          </h1>
        ) : (
          <h1
            className="text-zoca-text"
            style={{
              fontSize: "clamp(22px, 2.8vw, 28px)",
              fontWeight: 800,
              letterSpacing: "-0.025em",
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            Today, you have{" "}
            <span className="zoca-num-gradient" style={{ fontVariantNumeric: "tabular-nums" }}>
              {heroCount}
            </span>{" "}
            customer{heroCount === 1 ? "" : "s"} to act on
          </h1>
        )}
        <p className="text-[12px] text-zoca-text-2">
          {amName}
          {pod && ` · ${pod}`}
        </p>
      </div>

      {/* Controls row: filter chips + search + sort */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {filterCounts.pinned > 0 && (
          <FilterChip
            label="📌 Pinned"
            count={filterCounts.pinned}
            active={filter === "pinned"}
            onClick={() => setFilter("pinned")}
          />
        )}
        <FilterChip
          label="Need to call today"
          count={filterCounts.act}
          active={filter === "act"}
          onClick={() => setFilter("act")}
        />
        <FilterChip
          label="Doing well"
          count={filterCounts.improving}
          active={filter === "improving"}
          onClick={() => setFilter("improving")}
        />
        <FilterChip
          label="Haven't talked to in 30+ days"
          count={filterCounts.quiet}
          active={filter === "quiet"}
          onClick={() => setFilter("quiet")}
        />
        <FilterChip
          label="Full book"
          count={filterCounts.all}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Search */}
          <label className="relative inline-flex items-center">
            <span className="absolute left-3 text-zoca-text-soft" aria-hidden>
              ⌕
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search business name…"
              aria-label="Search business name"
              className="rounded-full border py-1.5 pl-8 pr-3 text-[12px] focus:outline-none"
              style={{
                borderColor: "var(--zoca-border)",
                background: "#ffffff",
                color: "var(--zoca-text)",
                minWidth: 200,
              }}
            />
          </label>

          {/* Sort dropdown */}
          <label className="inline-flex items-center gap-1 text-[11px] text-zoca-text-soft">
            <span className="hidden md:inline">Sort:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort customers"
              className="rounded-full border px-2.5 py-1.5 text-[12px] focus:outline-none"
              style={{
                borderColor: "var(--zoca-border)",
                background: "#ffffff",
                color: "var(--zoca-text)",
              }}
            >
              <option value="urgency">By urgency</option>
              <option value="plan">By plan amount</option>
              <option value="lasttouch">By last touch</option>
            </select>
          </label>
        </div>
      </div>

      {/* Cards or empty state */}
      {filtered.length === 0 ? (
        <V2EmptyState filter={filter} hasQuery={query.trim().length > 0} />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((c) => (
            <V2CustomerCard
              key={c.entity_id}
              customer={c}
              trend={customerTrends[c.entity_id]}
              recentlyContacted={contactedRecently.has(c.entity_id)}
              isPinned={pinnedSet?.has(c.entity_id) ?? false}
              onTogglePinned={
                onTogglePinned
                  ? () =>
                      onTogglePinned(c.entity_id, {
                        customer_id: c.customer_id ?? null,
                        bizname: c.company ?? null,
                      })
                  : undefined
              }
              amName={amName}
            />
          ))}
        </div>
      )}

      {/* Footer info — link to Full book view when we're showing a partial bucket */}
      {customers.length > filtered.length && filtered.length > 0 && filter !== "all" && (
        <p className="mt-8 text-center text-[12px] text-zoca-text-soft">
          Showing {filtered.length} of {customers.length} in your book.{" "}
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="text-zoca-purple underline-offset-2 hover:text-zoca-pink-cta hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
          >
            Open full book →
          </button>
        </p>
      )}

      <p className="mt-6 text-center text-[10px] text-zoca-text-soft">
        Generated at {new Date(generatedAt).toLocaleString()}
      </p>
    </section>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label} — ${count} customers`}
      className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2"
      style={
        active
          ? {
              borderColor: "var(--zoca-pink)",
              background:
                "linear-gradient(180deg, rgba(255,86,187,0.06), rgba(255,168,205,0.08))",
              color: "var(--zoca-text)",
            }
          : {
              borderColor: "var(--zoca-border)",
              background: "#ffffff",
              color: "var(--zoca-text-2)",
            }
      }
    >
      <span>{label}</span>
      <span
        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={
          active
            ? { background: "rgba(255,86,187,0.14)", color: "#c026d3" }
            : { background: "var(--zoca-bg-soft)", color: "var(--zoca-text-2)" }
        }
      >
        {count}
      </span>
    </button>
  );
}

function V2EmptyState({ filter, hasQuery }: { filter: FilterKey; hasQuery: boolean }) {
  if (hasQuery) {
    return (
      <div className="rounded-zoca border border-dashed border-zoca-border-2 px-6 py-10 text-center">
        <p className="font-display text-lg font-bold text-zoca-text-primary">
          No customers match your search.
        </p>
        <p className="mt-2 text-sm text-zoca-text-muted">
          Try a different name, or clear the search to see the full filter.
        </p>
      </div>
    );
  }
  const messages: Record<FilterKey, { title: string; body: string }> = {
    pinned: {
      title: "Nothing pinned yet.",
      body: "Click the pin icon on any customer card to add it here.",
    },
    act: {
      title: "You're caught up.",
      body: "No customers in your book need urgent attention right now. Nice work.",
    },
    improving: {
      title: "Nothing clearly improving yet.",
      body: "Trend data needs a few days of history. Check back later this week.",
    },
    quiet: {
      title: "No one's gone silent.",
      body: "Every customer in your book has been in touch within the last 30 days.",
    },
    all: {
      title: "Your book is empty.",
      body: "No customers in your book — either you're brand new or your accounts haven't loaded.",
    },
  };
  const m = messages[filter];
  return (
    <div className="rounded-zoca border border-dashed border-zoca-border-2 px-6 py-10 text-center">
      <p className="font-display text-lg font-bold text-zoca-text-primary">{m.title}</p>
      <p className="mt-2 text-sm text-zoca-text-muted">{m.body}</p>
    </div>
  );
}
