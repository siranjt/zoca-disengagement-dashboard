"use client";

import { useEffect, useMemo, useState } from "react";
import type { SnapshotV2, ScoredCustomerV2 } from "@/lib/types";
import type { Stoplight } from "@/lib/config";
import { ACTIVE_AMS, INCOMING_AMS, POD_MAP } from "@/lib/config";

type Props = {
  snapshot: SnapshotV2;
  initialPod?: string;
  onJumpToAm: (am: string) => void;
};

type SortKey =
  | "am"
  | "pod"
  | "total"
  | "red"
  | "yellow"
  | "green"
  | "action"
  | "pctRed"
  | "mrr"
  | "mrrAtRisk"
  | "avg";
type SortDir = "asc" | "desc";

type AmRow = {
  am: string;
  pod: string;
  total: number;
  RED: number;
  YELLOW: number;
  GREEN: number;
  action: number;
  pctRed: number; // 0..100
  mrr: number;
  mrrAtRisk: number; // sum of plan_amount for RED customers
  avgComposite: number;
  topSignal: string;
};

const POD_OPTIONS = ["All", "Pod 1", "Pod 2", "Pod 3", "Pod 4", "Pod 5", "Floating"];

const POD_COLOR_DOT: Record<string, string> = {
  "Pod 1": "bg-violet-400",
  "Pod 2": "bg-cyan-400",
  "Pod 3": "bg-emerald-400",
  "Pod 4": "bg-amber-400",
  "Pod 5": "bg-pink-400",
  Floating: "bg-slate-400",
};

const SIGNAL_HELP =
  "Most common strong signal (≥70) across this AM's book. Numbers: how many customers carry that signal. Signals: We silent (we haven't reached out), Client silent (they've gone dark), Resp drop (their reply rate fell), Vol collapse (conversation volume dropped), Usage low (app activity tanked), Billing (unpaid invoices).";

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return n > 0 ? `$${Math.round(n).toLocaleString()}` : "$0";
}

function classifyTopSignal(customers: ScoredCustomerV2[]): string {
  const tally = { we: 0, client: 0, drop: 0, vol: 0, usage: 0, billing: 0 };
  for (const c of customers) {
    const s = c.signals_v2;
    if (s.sig_we_silent >= 70) tally.we += 1;
    if (s.sig_client_silent >= 70) tally.client += 1;
    if (s.sig_response_drop >= 70) tally.drop += 1;
    if (s.sig_volume_collapse >= 70) tally.vol += 1;
    if (s.sig_usage >= 70) tally.usage += 1;
    if (s.sig_billing >= 70) tally.billing += 1;
  }
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  if (!ranked[0] || ranked[0][1] === 0) return "—";
  const label: Record<string, string> = {
    we: "We silent",
    client: "Client silent",
    drop: "Resp drop",
    vol: "Vol collapse",
    usage: "Usage low",
    billing: "Billing",
  };
  return `${label[ranked[0][0]]} (${ranked[0][1]})`;
}

function exportCsv(rows: AmRow[], filename: string) {
  const headers = [
    "AM",
    "Pod",
    "Total",
    "Action_RED",
    "%_RED",
    "RED",
    "YELLOW",
    "GREEN",
    "Avg_Composite",
    "MRR",
    "MRR_at_Risk",
    "Top_Signal",
  ];
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        escape(r.am),
        escape(r.pod),
        String(r.total),
        String(r.action),
        r.total ? r.pctRed.toFixed(0) : "0",
        String(r.RED),
        String(r.YELLOW),
        String(r.GREEN),
        String(r.avgComposite),
        String(Math.round(r.mrr)),
        String(Math.round(r.mrrAtRisk)),
        escape(r.topSignal),
      ].join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function TierSpreadBar({
  red,
  yellow,
  green,
  total,
}: {
  red: number;
  yellow: number;
  green: number;
  total: number;
}) {
  if (total === 0) return <span className="text-[10px] text-zoca-text-soft">—</span>;
  const r = (red / total) * 100;
  const y = (yellow / total) * 100;
  const g = (green / total) * 100;
  return (
    <div
      className="flex h-1.5 w-20 overflow-hidden rounded-full bg-zoca-bg-3/40"
      role="img"
      aria-label={`Tier spread: ${red} red, ${yellow} yellow, ${green} green`}
      title={`${red} RED · ${yellow} YEL · ${green} GRN`}
    >
      {r > 0 && <div className="bg-rose-400" style={{ width: `${r}%` }} />}
      {y > 0 && <div className="bg-amber-400" style={{ width: `${y}%` }} />}
      {g > 0 && <div className="bg-emerald-400" style={{ width: `${g}%` }} />}
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-zoca-pink-cta/30 px-0.5 text-zoca-text-primary">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export default function V2Rollup({ snapshot, initialPod, onJumpToAm }: Props) {
  const [podFilter, setPodFilter] = useState<string>(initialPod || "All");
  const [search, setSearch] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("action");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showZeroBooks, setShowZeroBooks] = useState<boolean>(true);

  // Sync pod filter when the parent switches view (Leadership ↔ Pod view changes initialPod)
  useEffect(() => {
    if (initialPod) setPodFilter(initialPod);
  }, [initialPod]);

  const rows = useMemo<AmRow[]>(() => {
    const byAm = new Map<string, ScoredCustomerV2[]>();
    for (const c of snapshot.customers) {
      const am = c.am_name || "";
      if (!am) continue;
      if (!byAm.has(am)) byAm.set(am, []);
      byAm.get(am)!.push(c);
    }
    const allAms = new Set<string>([...ACTIVE_AMS, ...INCOMING_AMS]);
    for (const a of byAm.keys()) allAms.add(a);

    const result: AmRow[] = [];
    for (const am of allAms) {
      const list = byAm.get(am) || [];
      const counts: Record<Stoplight, number> = { RED: 0, YELLOW: 0, GREEN: 0 };
      let mrr = 0;
      let mrrAtRisk = 0;
      let scoreSum = 0;
      for (const c of list) {
        const sl = c.signals_v2.stoplight;
        counts[sl] += 1;
        const plan = c.plan_amount || 0;
        mrr += plan;
        if (sl === "RED") mrrAtRisk += plan;
        scoreSum += c.signals_v2.composite || 0;
      }
      result.push({
        am,
        pod: POD_MAP[am] || "Floating",
        total: list.length,
        RED: counts.RED,
        YELLOW: counts.YELLOW,
        GREEN: counts.GREEN,
        action: counts.RED,
        pctRed: list.length ? (counts.RED / list.length) * 100 : 0,
        mrr,
        mrrAtRisk,
        avgComposite: list.length ? Math.round(scoreSum / list.length) : 0,
        topSignal: classifyTopSignal(list),
      });
    }
    return result;
  }, [snapshot]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (podFilter !== "All" && r.pod !== podFilter) return false;
      if (q && !r.am.toLowerCase().includes(q)) return false;
      if (!showZeroBooks && r.total === 0) return false;
      return true;
    });
  }, [rows, podFilter, search, showZeroBooks]);

  const sorted = useMemo(() => {
    const cp = [...filtered];
    cp.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case "am":
          av = a.am.toLowerCase();
          bv = b.am.toLowerCase();
          break;
        case "pod":
          av = a.pod;
          bv = b.pod;
          break;
        case "total":
          av = a.total;
          bv = b.total;
          break;
        case "red":
          av = a.RED;
          bv = b.RED;
          break;
        case "yellow":
          av = a.YELLOW;
          bv = b.YELLOW;
          break;
        case "green":
          av = a.GREEN;
          bv = b.GREEN;
          break;
        case "action":
          av = a.action;
          bv = b.action;
          break;
        case "pctRed":
          av = a.pctRed;
          bv = b.pctRed;
          break;
        case "mrr":
          av = a.mrr;
          bv = b.mrr;
          break;
        case "mrrAtRisk":
          av = a.mrrAtRisk;
          bv = b.mrrAtRisk;
          break;
        case "avg":
          av = a.avgComposite;
          bv = b.avgComposite;
          break;
      }
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = av as number;
      const bn = bv as number;
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return cp;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    return sorted.reduce(
      (acc, r) => {
        acc.total += r.total;
        acc.RED += r.RED;
        acc.YELLOW += r.YELLOW;
        acc.GREEN += r.GREEN;
        acc.action += r.action;
        acc.mrr += r.mrr;
        acc.mrrAtRisk += r.mrrAtRisk;
        return acc;
      },
      { total: 0, RED: 0, YELLOW: 0, GREEN: 0, action: 0, mrr: 0, mrrAtRisk: 0 },
    );
  }, [sorted]);

  const filtersActive =
    podFilter !== "All" || search.trim().length > 0 || !showZeroBooks;

  const clearFilters = () => {
    setPodFilter("All");
    setSearch("");
    setShowZeroBooks(true);
  };

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "am" || key === "pod" ? "asc" : "desc");
    }
  };

  const handleExportCsv = () => {
    const date = new Date(snapshot.generatedAt).toISOString().slice(0, 10);
    const podSuffix = podFilter !== "All" ? `_${podFilter.replace(/\s+/g, "-")}` : "";
    exportCsv(sorted, `zoca_rollup_${date}${podSuffix}.csv`);
  };

  const liveLabel = `Showing ${sorted.length} AMs, ${totals.total} customers, ${totals.RED} red`;

  return (
    <section aria-label="Cross-AM rollup">
      {/* Header */}
      <header className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-zoca-text-primary">
            Manager rollup
          </h2>
          <p className="mt-1 text-xs text-zoca-text-soft">
            {totals.total} customers across {sorted.length} AM
            {sorted.length === 1 ? "" : "s"}
            {podFilter !== "All" ? ` · filtered to ${podFilter}` : ""}
            {search.trim() ? ` · search "${search}"` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Search AM…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearch("");
            }}
            aria-label="Search account managers by name"
            className="w-44 rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-2/60 px-3 py-1.5 text-[13px] text-zoca-text-primary placeholder:text-zoca-text-soft focus:border-zoca-border-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
          />
          <button
            onClick={handleExportCsv}
            disabled={sorted.length === 0}
            aria-label="Download current view as CSV"
            title="Download current view as CSV"
            className="inline-flex items-center gap-1.5 rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-2/60 px-3 py-1.5 text-[12px] font-medium text-zoca-text-soft transition hover:border-zoca-border-3 hover:text-zoca-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden>↓</span> CSV
          </button>
        </div>
      </header>

      {/* Pod filter chips + secondary controls */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Pod filter">
          {POD_OPTIONS.map((p) => {
            const active = podFilter === p;
            const dot = POD_COLOR_DOT[p];
            return (
              <button
                key={p}
                onClick={() => setPodFilter(p)}
                aria-pressed={active}
                aria-label={`Filter to ${p}`}
                className={`inline-flex items-center gap-1.5 rounded-zoca-pill border px-3 py-1 text-[12px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40 ${
                  active
                    ? "border-zoca-pink-cta bg-zoca-pink-cta/20 text-zoca-text-primary"
                    : "border-zoca-border-2 bg-zoca-bg-2/60 text-zoca-text-soft hover:border-zoca-border-3 hover:text-zoca-text-primary"
                }`}
              >
                {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />}
                {p}
              </button>
            );
          })}
        </div>
        <label
          className="ml-1 inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-zoca-text-soft hover:text-zoca-text-primary"
          title="Hide AMs with no active customers (e.g. incoming AMs)"
        >
          <input
            type="checkbox"
            checked={showZeroBooks}
            onChange={(e) => setShowZeroBooks(e.target.checked)}
            className="h-3 w-3 cursor-pointer accent-zoca-pink-cta"
            aria-label="Show AMs with empty books"
          />
          Show empty books
        </label>
        {filtersActive && (
          <button
            onClick={clearFilters}
            className="ml-auto text-[11px] text-zoca-text-soft underline-offset-2 hover:text-zoca-pink-cta hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
            aria-label="Clear all filters"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Aggregate strip */}
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/40 px-4 py-3 text-[12px] sm:grid-cols-6">
        <div>
          <div className="text-zoca-text-soft">Customers</div>
          <div className="mt-0.5 font-display text-lg font-bold text-zoca-text-primary">
            {totals.total}
          </div>
        </div>
        <div>
          <div className="text-zoca-text-soft">RED</div>
          <div className="mt-0.5 font-display text-lg font-bold text-rose-400">
            {totals.RED}
          </div>
        </div>
        <div>
          <div className="text-zoca-text-soft">YELLOW</div>
          <div className="mt-0.5 font-display text-lg font-bold text-amber-400">
            {totals.YELLOW}
          </div>
        </div>
        <div>
          <div className="text-zoca-text-soft">GREEN</div>
          <div className="mt-0.5 font-display text-lg font-bold text-emerald-400">
            {totals.GREEN}
          </div>
        </div>
        <div title="Total MRR across the customers shown">
          <div className="text-zoca-text-soft">MRR</div>
          <div className="mt-0.5 font-display text-lg font-bold text-zoca-text-primary">
            {formatMoney(totals.mrr)}
          </div>
        </div>
        <div title="MRR carried by customers currently RED — the dollars actively at risk this week">
          <div className="text-zoca-text-soft">MRR at risk</div>
          <div className="mt-0.5 font-display text-lg font-bold text-rose-300">
            {formatMoney(totals.mrrAtRisk)}
          </div>
        </div>
      </div>

      {/* Aria-live region for sorted/filtered changes */}
      <div className="sr-only" role="status" aria-live="polite">
        {liveLabel}
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-zoca border border-zoca-border-2">
        <table className="min-w-full divide-y divide-zoca-border-2 text-[13px]">
          <thead className="bg-zoca-bg-2/60 text-left text-[11px] uppercase tracking-wider text-zoca-text-soft">
            <tr>
              <Th label="AM" col="am" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <Th label="Pod" col="pod" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <Th
                label="Total"
                col="total"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <th className="px-3 py-2 text-left font-semibold" scope="col">
                Spread
              </th>
              <Th
                label="Action"
                col="action"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
                tooltip="Customers needing action today (RED stoplight). Click to sort."
              />
              <Th
                label="% RED"
                col="pctRed"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
                tooltip="RED as a percentage of the AM's book. Compares fairly across books of different sizes."
              />
              <Th
                label="RED"
                col="red"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <Th
                label="YEL"
                col="yellow"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <Th
                label="GRN"
                col="green"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <Th
                label="Avg"
                col="avg"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
                tooltip="Average composite score (0-100, higher = healthier)"
              />
              <Th
                label="MRR"
                col="mrr"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <Th
                label="MRR @ risk"
                col="mrrAtRisk"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
                tooltip="Sum of plan_amount for RED-stoplight customers in this book."
              />
              <th
                className="px-3 py-2 text-left font-semibold"
                scope="col"
                title={SIGNAL_HELP}
              >
                <span className="inline-flex items-center gap-1">
                  Top signal
                  <span
                    className="text-zoca-text-soft"
                    aria-label="Help: top signal definitions"
                  >
                    ⓘ
                  </span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zoca-border bg-zoca-bg-2/20">
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={13}
                  className="px-4 py-10 text-center text-sm text-zoca-text-soft"
                >
                  {search.trim()
                    ? `No AMs match "${search}".`
                    : podFilter !== "All"
                      ? `No AMs in ${podFilter}.`
                      : "No customers in snapshot."}
                </td>
              </tr>
            )}
            {sorted.map((r) => (
              <tr key={r.am} className="group transition hover:bg-zoca-bg-3/40">
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => onJumpToAm(r.am)}
                    className="text-left font-medium text-zoca-text-primary underline-offset-4 hover:text-zoca-pink-cta hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
                    aria-label={`Open ${r.am}'s book`}
                    title={`Open ${r.am}'s book`}
                  >
                    <Highlight text={r.am} query={search} />
                  </button>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-zoca-text-soft">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${POD_COLOR_DOT[r.pod] || "bg-slate-400"}`}
                      aria-hidden
                    />
                    {r.pod}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zoca-text-primary">
                  {r.total || <span className="text-zoca-text-soft">·</span>}
                </td>
                <td className="px-3 py-2.5">
                  <TierSpreadBar
                    red={r.RED}
                    yellow={r.YELLOW}
                    green={r.GREEN}
                    total={r.total}
                  />
                </td>
                <td
                  className="px-3 py-2.5 text-right tabular-nums"
                  title={r.total ? `${r.pctRed.toFixed(0)}% of ${r.total}` : "No customers"}
                >
                  {r.action > 0 ? (
                    <span className="rounded-zoca-pill bg-rose-500/15 px-2 py-0.5 font-semibold text-rose-300">
                      {r.action}
                    </span>
                  ) : (
                    <span className="text-zoca-text-soft">0</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zoca-text-muted">
                  {r.total ? (
                    `${r.pctRed.toFixed(0)}%`
                  ) : (
                    <span className="text-zoca-text-soft">·</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-rose-300">
                  {r.RED || <span className="text-zoca-text-soft">·</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-amber-300">
                  {r.YELLOW || <span className="text-zoca-text-soft">·</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-emerald-300">
                  {r.GREEN || <span className="text-zoca-text-soft">·</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zoca-text-muted">
                  {r.avgComposite || <span className="text-zoca-text-soft">·</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zoca-text-muted">
                  {r.mrr ? formatMoney(r.mrr) : <span className="text-zoca-text-soft">·</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-rose-300">
                  {r.mrrAtRisk ? (
                    formatMoney(r.mrrAtRisk)
                  ) : (
                    <span className="text-zoca-text-soft">·</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-zoca-text-muted">{r.topSignal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-zoca-text-soft">
        Click an AM name to drill into their book. Click any column header to sort. Pod filter,
        search, and "show empty books" all stack.
      </p>
    </section>
  );
}

function Th({
  label,
  col,
  sortKey,
  sortDir,
  onClick,
  align,
  tooltip,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
  tooltip?: string;
}) {
  const active = sortKey === col;
  const arrow = active ? (sortDir === "asc" ? "↑" : "↓") : "";
  return (
    <th
      className={`px-3 py-2 font-semibold ${align === "right" ? "text-right" : "text-left"}`}
      scope="col"
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        onClick={() => onClick(col)}
        className={`inline-flex items-center gap-1 transition hover:text-zoca-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40 ${
          active ? "text-zoca-text-primary" : ""
        }`}
        aria-label={`Sort by ${label}${active ? `, currently ${sortDir === "asc" ? "ascending" : "descending"}` : ""}`}
        title={tooltip || `Sort by ${label}`}
      >
        {label}
        {arrow && <span aria-hidden>{arrow}</span>}
      </button>
    </th>
  );
}
