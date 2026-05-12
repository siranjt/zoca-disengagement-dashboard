"use client";

import { useMemo, useState } from "react";
import type { ScoredCustomerV2 } from "@/lib/types";
import V2CustomerCard from "./V2CustomerCard";

type Props = {
  amName: string;
  pod: string;
  customers: ScoredCustomerV2[];
  generatedAt: string;
};

type FilterKey = "act" | "improving" | "quiet";

const ACT_TODAY_TOP_N = 10;

export default function V2AMTriage({ amName, pod, customers, generatedAt }: Props) {
  const [filter, setFilter] = useState<FilterKey>("act");

  // ---------------------------------------------------------------------------
  // Bucketing logic
  // ---------------------------------------------------------------------------
  const actToday = useMemo(
    () =>
      customers
        .filter((c) => c.signals_v2.stoplight === "RED" || c.signals_v2.stoplight === "YELLOW")
        .sort((a, b) => b.signals_v2.composite - a.signals_v2.composite)
        .slice(0, ACT_TODAY_TOP_N),
    [customers],
  );

  // "Improving" — without snapshot history yet, use stoplight=GREEN as proxy.
  // Phase 2.B will swap this for real "composite dropped 15+ points in 7d" once
  // we have multiple snapshot rows to compare against.
  const improving = useMemo(
    () =>
      customers
        .filter((c) => c.signals_v2.stoplight === "GREEN" && c.signals_v2.composite < 20)
        .sort((a, b) => a.signals_v2.composite - b.signals_v2.composite)
        .slice(0, 15),
    [customers],
  );

  const quiet30 = useMemo(
    () =>
      customers
        .filter(
          (c) =>
            c.metrics.days_since_in >= 30 ||
            (c.metrics.last_any_iso === null && c.signals_v2.tier !== "HEALTHY"),
        )
        .sort((a, b) => b.metrics.days_since_in - a.metrics.days_since_in)
        .slice(0, 20),
    [customers],
  );

  const filtered =
    filter === "act" ? actToday : filter === "improving" ? improving : quiet30;

  const filterCounts = {
    act: actToday.length,
    improving: improving.length,
    quiet: quiet30.length,
  };

  // Hero label — count varies by selected filter
  const heroCount = filter === "act" ? actToday.length : filtered.length;
  const heroLabel =
    filter === "act"
      ? heroCount === 0
        ? "All clear — nobody urgent in your book today"
        : `Today, you have ${heroCount} customer${heroCount === 1 ? "" : "s"} to act on`
      : filter === "improving"
        ? heroCount === 0
          ? "No one's clearly improving this week"
          : `${heroCount} customer${heroCount === 1 ? "" : "s"} doing well`
        : heroCount === 0
          ? "No one's been quiet for 30+ days"
          : `${heroCount} customer${heroCount === 1 ? "" : "s"} you haven't heard from in 30+ days`;

  return (
    <section className="mt-2">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-extrabold tracking-zoca-tight md:text-3xl">
          {heroLabel.includes("act on") ? (
            <>
              Today, you have{" "}
              <span className="text-zoca-pink-2">{heroCount}</span>{" "}
              customers to act on
            </>
          ) : (
            heroLabel
          )}
        </h1>
        <p className="text-[12px] text-zoca-text-soft">
          {amName}
          {pod && ` · ${pod}`} · Sorted by urgency
        </p>
      </div>

      {/* Filter chips */}
      <div className="mb-5 flex flex-wrap gap-2">
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
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <V2EmptyState filter={filter} />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((c) => (
            <V2CustomerCard key={c.entity_id} customer={c} />
          ))}
        </div>
      )}

      {/* Show full book link */}
      {customers.length > filtered.length && (
        <p className="mt-8 text-center text-[12px] text-zoca-text-soft">
          Showing top {filtered.length} of {customers.length} in your book.{" "}
          <span className="text-zoca-purple">Full book view — Phase 2.D</span>
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
      className={`group inline-flex items-center gap-2 rounded-zoca-pill border px-3.5 py-1.5 text-[12px] font-medium transition ${
        active
          ? "border-zoca-purple bg-zoca-purple/20 text-zoca-text-primary"
          : "border-zoca-border-2 bg-zoca-bg-2/40 text-zoca-text-muted hover:border-zoca-border-3 hover:text-zoca-text-primary"
      }`}
    >
      <span>{label}</span>
      <span
        className={`rounded-zoca-pill px-2 py-0.5 text-[10px] font-semibold ${
          active ? "bg-white/15" : "bg-zoca-bg-1/80"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function V2EmptyState({ filter }: { filter: FilterKey }) {
  const messages: Record<FilterKey, { title: string; body: string }> = {
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
  };
  const m = messages[filter];
  return (
    <div className="rounded-zoca border border-dashed border-zoca-border-2 px-6 py-10 text-center">
      <p className="font-display text-lg font-bold text-zoca-text-primary">{m.title}</p>
      <p className="mt-2 text-sm text-zoca-text-muted">{m.body}</p>
    </div>
  );
}
