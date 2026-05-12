"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ZocaLogo from "@/components/ZocaLogo";
import type { SnapshotV2 } from "@/lib/types";
import { POD_MAP } from "@/lib/config";
import V2PodSummaryGrid from "./V2PodSummaryGrid";
import V2SignalHeatmap from "./V2SignalHeatmap";
import V2Rollup from "./V2Rollup";

type SnapshotState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; snapshot: SnapshotV2 };

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return n > 0 ? `$${Math.round(n).toLocaleString()}` : "$0";
}

export default function V2ManagerDashboard() {
  const [snapshot, setSnapshot] = useState<SnapshotState>({ status: "loading" });
  const [selectedPod, setSelectedPod] = useState<string>("All");

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

  const handleJumpToAm = useCallback((am: string) => {
    if (typeof window !== "undefined") {
      window.location.href = `/v2?am=${encodeURIComponent(am)}`;
    }
  }, []);

  return (
    <div className="min-h-screen bg-zoca-body text-zoca-text-primary">
      {/* Slim topbar with link back to AM view */}
      <nav className="sticky top-0 z-50 border-b border-zoca-border bg-zoca-bg-nav backdrop-blur-xl">
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
            <span className="text-[11px] text-zoca-text-soft">{freshnessLabel}</span>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-6 md:px-6">
        <header className="mb-5">
          <h1 className="font-display text-2xl font-bold text-zoca-text-primary">
            Manager dashboard
          </h1>
          <p className="mt-1 text-sm text-zoca-text-muted">
            Cross-AM and cross-pod view of customer health. Click a pod card to filter the rollup;
            click a heatmap cell to drill into that pod-signal pair.
          </p>
        </header>

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
            {/* KPI strip */}
            <section
              aria-label="Top-line KPIs"
              className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
            >
              <Kpi label="Customers" value={String(kpis.total)} />
              <Kpi label="RED" value={String(kpis.RED)} tone="rose" sub={`${kpis.pctRed.toFixed(0)}%`} />
              <Kpi label="YELLOW" value={String(kpis.YELLOW)} tone="amber" />
              <Kpi label="GREEN" value={String(kpis.GREEN)} tone="emerald" />
              <Kpi label="MRR @ risk" value={formatMoney(kpis.mrrAtRisk)} tone="rose" />
              <Kpi
                label="AMs w/ action"
                value={String(kpis.amsWithAction)}
                sub={`across ${kpis.podsRepresented} pods`}
              />
            </section>

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

      <footer className="border-t border-zoca-border py-8 text-center">
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
    <div className="rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/40 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-zoca-text-soft">{label}</div>
      <div className={`mt-0.5 font-display text-2xl font-bold tabular-nums ${valueClass}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-zoca-text-soft">{sub}</div>}
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
