"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ZocaLogo from "@/components/ZocaLogo";
import type { SnapshotV2, ScoredCustomerV2 } from "@/lib/types";
import { POD_MAP } from "@/lib/config";
import V2PodSummaryGrid from "./V2PodSummaryGrid";
import V2SignalHeatmap from "./V2SignalHeatmap";
import V2Rollup from "./V2Rollup";

const STORAGE_POD_KEY = "zoca_v2_manager_pod";

type SnapshotState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; snapshot: SnapshotV2 };

const POD_COLOR_DOT: Record<string, string> = {
  "Pod 1": "bg-violet-400",
  "Pod 2": "bg-cyan-400",
  "Pod 3": "bg-emerald-400",
  "Pod 4": "bg-amber-400",
  "Pod 5": "bg-pink-400",
  Floating: "bg-slate-400",
};

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return n > 0 ? `$${Math.round(n).toLocaleString()}` : "$0";
}

function formatSnapshotDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export default function V2ManagerDashboard() {
  const [snapshot, setSnapshot] = useState<SnapshotState>({ status: "loading" });
  const [selectedPod, setSelectedPod] = useState<string>("All");
  const [mounted, setMounted] = useState<boolean>(false);

  // Hydration-safe: read localStorage after mount
  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_POD_KEY);
    if (stored) setSelectedPod(stored);
  }, []);

  // Persist pod selection
  useEffect(() => {
    if (!mounted) return;
    if (typeof window === "undefined") return;
    if (selectedPod === "All") {
      window.localStorage.removeItem(STORAGE_POD_KEY);
    } else {
      window.localStorage.setItem(STORAGE_POD_KEY, selectedPod);
    }
  }, [selectedPod, mounted]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v2/snapshot", { cache: "no-store" });
        if (!res.ok) {
          const msg = await res.text().catch(() => res.statusText);
          if (!cancelled) {
            setSnapshot({ status: "error", message: `${res.status}: ${msg.slice(0, 200)}` });
          }
          return;
        }
        const snap: SnapshotV2 = await res.json();
        if (!cancelled) setSnapshot({ status: "ready", snapshot: snap });
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setSnapshot({ status: "error", message: msg });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const kpis = useMemo(() => {
    if (snapshot.status !== "ready") return null;
    let total = 0;
    let RED = 0;
    let YELLOW = 0;
    let GREEN = 0;
    let mrr = 0;
    let mrrAtRisk = 0;
    const actionAmsSet = new Set<string>();
    const podSet = new Set<string>();
    for (const c of snapshot.snapshot.customers) {
      total += 1;
      const sl = c.signals_v2.stoplight;
      if (sl === "RED") RED += 1;
      else if (sl === "YELLOW") YELLOW += 1;
      else GREEN += 1;
      mrr += c.plan_amount || 0;
      if (sl === "RED") {
        mrrAtRisk += c.plan_amount || 0;
        if (c.am_name) actionAmsSet.add(c.am_name);
      }
      const pod = POD_MAP[c.am_name] || "Floating";
      podSet.add(pod);
    }
    return {
      total,
      RED,
      YELLOW,
      GREEN,
      mrr,
      mrrAtRisk,
      pctRed: total ? (RED / total) * 100 : 0,
      amsWithAction: actionAmsSet.size,
      podsRepresented: podSet.size,
    };
  }, [snapshot]);

  const topMovers = useMemo(() => {
    if (snapshot.status !== "ready") return [];
    const byAm = new Map<string, ScoredCustomerV2[]>();
    for (const c of snapshot.snapshot.customers) {
      if (!c.am_name) continue;
      if (!byAm.has(c.am_name)) byAm.set(c.am_name, []);
      byAm.get(c.am_name)!.push(c);
    }
    const rows = Array.from(byAm.entries()).map(([am, customers]) => {
      let red = 0;
      let mrrAtRisk = 0;
      for (const c of customers) {
        if (c.signals_v2.stoplight === "RED") {
          red += 1;
          mrrAtRisk += c.plan_amount || 0;
        }
      }
      return {
        am,
        pod: POD_MAP[am] || "Floating",
        total: customers.length,
        red,
        pctRed: customers.length ? (red / customers.length) * 100 : 0,
        mrrAtRisk,
      };
    });
    return rows
      .filter((r) => r.red > 0)
      .sort((a, b) => {
        if (b.red !== a.red) return b.red - a.red;
        return b.mrrAtRisk - a.mrrAtRisk;
      })
      .slice(0, 5);
  }, [snapshot]);

  const freshnessLabel = useMemo(() => {
    if (snapshot.status !== "ready") return "loading…";
    const generatedAt = new Date(snapshot.snapshot.generatedAt).getTime();
    const now = Date.now();
    const diffMin = Math.max(0, Math.floor((now - generatedAt) / 60000));
    if (diffMin < 1) return "Updated just now";
    if (diffMin < 60) return `Updated ${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `Updated ${diffHr} hr ago`;
    return `Updated ${Math.floor(diffHr / 24)} days ago`;
  }, [snapshot]);

  const snapshotDate = useMemo(() => {
    if (snapshot.status !== "ready") return "";
    return formatSnapshotDate(snapshot.snapshot.generatedAt);
  }, [snapshot]);

  const handleJumpToAm = useCallback((am: string) => {
    if (typeof window !== "undefined") {
      window.location.href = `/v2?am=${encodeURIComponent(am)}`;
    }
  }, []);

  return (
    <div className="min-h-screen bg-zoca-body text-zoca-text-primary print:bg-white print:text-black">
      {/* Skip-to-content for keyboard users */}
      <a
        href="#manager-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-zoca focus:border focus:border-zoca-pink-cta focus:bg-zoca-bg-2 focus:px-3 focus:py-1.5 focus:text-[12px] focus:text-zoca-text-primary"
      >
        Skip to dashboard content
      </a>

      {/* Slim sticky topbar */}
      <nav className="sticky top-0 z-50 border-b border-zoca-border bg-zoca-bg-nav backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3 md:gap-4 md:px-6">
          <a
            href="/v2"
            className="flex items-center gap-2 text-zoca-light-purple-2"
            aria-label="Customer Health home"
          >
            <ZocaLogo height={20} />
            <span className="hidden text-[11px] font-medium uppercase tracking-wider text-zoca-text-soft sm:inline">
              Customer Health · Manager
            </span>
          </a>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="/v2"
              className="rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-2/60 px-3 py-1.5 text-[12px] font-medium text-zoca-text-soft transition hover:border-zoca-border-3 hover:text-zoca-text-primary"
            >
              ← AM view
            </a>
            <span className="text-[11px] text-zoca-text-soft" title={snapshotDate}>
              {freshnessLabel}
            </span>
          </div>
        </div>
      </nav>

      <main
        id="manager-content"
        className="mx-auto max-w-[1400px] px-4 pb-24 pt-6 md:px-6"
      >
        <header className="mb-5">
          <h1 className="font-display text-2xl font-bold text-zoca-text-primary">
            Manager dashboard
          </h1>
          <p className="mt-1 text-sm text-zoca-text-muted">
            Cross-AM and cross-pod view of customer health. Click a pod card to filter the
            rollup; click a heatmap cell to drill into that pod-signal pair.
          </p>
          {snapshotDate && (
            <p className="mt-1 text-[11px] text-zoca-text-soft">
              Snapshot · {snapshotDate}
            </p>
          )}
        </header>

        {/* Aria-live announces pod-selection changes for SR users */}
        <div className="sr-only" role="status" aria-live="polite">
          {selectedPod === "All"
            ? "Showing all pods"
            : `Filtered to ${selectedPod}`}
        </div>

        {snapshot.status === "loading" && <ManagerSkeleton />}
        {snapshot.status === "error" && (
          <div
            role="alert"
            className="rounded-zoca border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-200"
          >
            <p className="font-semibold">Couldn't load the snapshot.</p>
            <p className="mt-1 text-[12px] text-rose-200/80">{snapshot.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 rounded-zoca-pill border border-rose-400/40 bg-rose-500/15 px-3 py-1 text-[12px] font-medium text-rose-200 transition hover:bg-rose-500/25"
            >
              Retry
            </button>
          </div>
        )}

        {snapshot.status === "ready" && kpis && (
          <>
            {/* Sticky KPI strip — stays visible while scrolling the long page */}
            <section
              aria-label="Top-line KPIs"
              className="sticky top-[60px] z-40 -mx-4 mb-6 border-y border-zoca-border-2 bg-zoca-body/90 px-4 py-3 backdrop-blur-xl md:-mx-6 md:px-6 print:static print:border-none print:bg-transparent print:p-0"
            >
              <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Kpi label="Customers" value={String(kpis.total)} />
                <Kpi
                  label="RED"
                  value={String(kpis.RED)}
                  tone="rose"
                  sub={`${kpis.pctRed.toFixed(0)}% of book`}
                />
                <Kpi label="YELLOW" value={String(kpis.YELLOW)} tone="amber" />
                <Kpi label="GREEN" value={String(kpis.GREEN)} tone="emerald" />
                <Kpi label="MRR @ risk" value={formatMoney(kpis.mrrAtRisk)} tone="rose" />
                <Kpi
                  label="AMs w/ action"
                  value={String(kpis.amsWithAction)}
                  sub={`across ${kpis.podsRepresented} pod${kpis.podsRepresented === 1 ? "" : "s"}`}
                />
              </div>
            </section>

            {/* Top movers — "where to focus today" */}
            {topMovers.length > 0 && (
              <section
                aria-label="Top AMs by action items today"
                className="mb-7 rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/30 p-4"
              >
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-zoca-text-primary">
                      Where to focus today
                    </h3>
                    <p className="mt-0.5 text-[11px] text-zoca-text-soft">
                      Top {topMovers.length} AM{topMovers.length === 1 ? "" : "s"} by RED-stoplight
                      count, MRR-at-risk tiebreaker.
                    </p>
                  </div>
                </div>
                <ul className="divide-y divide-zoca-border">
                  {topMovers.map((m, i) => (
                    <li
                      key={m.am}
                      className="flex items-center gap-3 py-2 text-[13px]"
                    >
                      <span className="w-5 text-center text-[11px] font-bold text-zoca-text-soft tabular-nums">
                        #{i + 1}
                      </span>
                      <button
                        onClick={() => handleJumpToAm(m.am)}
                        className="font-medium text-zoca-text-primary underline-offset-4 hover:text-zoca-pink-cta hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
                        aria-label={`Open ${m.am}'s book`}
                        title={`Open ${m.am}'s book`}
                      >
                        {m.am}
                      </button>
                      <span className="inline-flex items-center gap-1 text-[11px] text-zoca-text-soft">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${POD_COLOR_DOT[m.pod] || "bg-slate-400"}`}
                          aria-hidden
                        />
                        {m.pod}
                      </span>
                      <span className="ml-auto inline-flex items-center gap-1 rounded-zoca-pill bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-300 tabular-nums">
                        {m.red} RED
                        <span className="font-normal text-zoca-text-soft">
                          ({m.pctRed.toFixed(0)}%)
                        </span>
                      </span>
                      <span
                        className="hidden text-[11px] text-rose-300 tabular-nums sm:inline"
                        title="MRR at risk in this AM's book"
                      >
                        {formatMoney(m.mrrAtRisk)} @ risk
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Pod summary */}
            <div className="mb-7">
              <V2PodSummaryGrid
                snapshot={snapshot.snapshot}
                selectedPod={selectedPod}
                onSelectPod={setSelectedPod}
              />
            </div>

            {/* Signal heatmap */}
            <div className="mb-7">
              <V2SignalHeatmap
                snapshot={snapshot.snapshot}
                onCellClick={(pod) => setSelectedPod(pod)}
              />
            </div>

            {/* Rollup section header with breadcrumb */}
            <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-zoca-text-primary">
                  Full AM rollup
                </h3>
                <p className="mt-0.5 text-[11px] text-zoca-text-soft">
                  {selectedPod === "All"
                    ? "All AMs across all pods."
                    : `Filtered to ${selectedPod}. `}
                  {selectedPod !== "All" && (
                    <button
                      onClick={() => setSelectedPod("All")}
                      className="underline-offset-2 hover:text-zoca-pink-cta hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
                    >
                      Show all pods
                    </button>
                  )}
                </p>
              </div>
            </header>

            {/* Full rollup table */}
            <div>
              <V2Rollup
                snapshot={snapshot.snapshot}
                initialPod={selectedPod}
                onJumpToAm={handleJumpToAm}
              />
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-zoca-border py-8 text-center print:hidden">
        <div className="flex flex-col items-center gap-2 opacity-70">
          <ZocaLogo height={18} />
          <p className="text-xs text-zoca-text-soft">
            Customer Health · v2 manager view · refreshed daily at 22:00 UTC
          </p>
        </div>
      </footer>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: "rose" | "amber" | "emerald";
  sub?: string;
}) {
  const valueClass =
    tone === "rose"
      ? "text-rose-400"
      : tone === "amber"
        ? "text-amber-400"
        : tone === "emerald"
          ? "text-emerald-400"
          : "text-zoca-text-primary";
  return (
    <div className="rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/40 px-4 py-3 print:border-zinc-300 print:bg-white">
      <div className="text-[11px] uppercase tracking-wider text-zoca-text-soft print:text-zinc-600">
        {label}
      </div>
      <div className={`mt-0.5 font-display text-2xl font-bold tabular-nums ${valueClass}`}>
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-[10px] text-zoca-text-soft print:text-zinc-600">{sub}</div>
      )}
    </div>
  );
}

function ManagerSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/30"
          />
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/30" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/30"
          />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/30" />
      <div className="h-96 animate-pulse rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/30" />
    </div>
  );
}
