"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ZocaLogo from "@/components/ZocaLogo";
import { ACTIVE_AMS, INCOMING_AMS, POD_MAP } from "@/lib/config";
import type { SnapshotV2, ScoredCustomerV2 } from "@/lib/types";
import V2WelcomeStrip from "./V2WelcomeStrip";
import V2AMTriage from "./V2AMTriage";
import V2Rollup from "./V2Rollup";
// ScopeStrip render removed from V2Dashboard in Phase 17.B.2 — V2RefreshBar
// already shows the same scope info ("SHOWING N/M · LAST REFRESH · AM · pod").
// ScopeStrip.tsx still lives in the codebase and is rendered by
// V2ManagerDashboard (pending Phase 17.D restyle).
import FreshnessBanner from "./FreshnessBanner";
import { V2Header } from "./V2Header";
import { V2Hero } from "./V2Hero";
import { V2RefreshBar } from "./V2RefreshBar";
import { V2KpiTiles } from "./V2KpiTiles";
import { ToastProvider, useToast } from "./Toast";
import { CustomerCardSkeleton } from "./Skeleton";
import { CursorGlow } from "./CursorGlow";
// Phase 23.A — AM-view interactive charts (book health + signal mix + 30d RED trend).
import { BookHealthDonut } from "./charts/BookHealthDonut";
import { SignalMixPie } from "./charts/SignalMixPie";
import { RedTrendLine } from "./charts/RedTrendLine";
import {
  SIGNAL_LABELS,
  isSignalKey,
  type SignalKey,
} from "@/lib/signal-taxonomy";

const STORAGE_AM_KEY = "zoca_v2_selected_am";
const STORAGE_WELCOME_DISMISSED = "zoca_v2_welcome_dismissed";

type SnapshotState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; snapshot: SnapshotV2 };

export type V2View = "am" | "pod" | "leadership";

export default function V2Dashboard() {
  return (
    <ToastProvider>
      <V2DashboardInner />
    </ToastProvider>
  );
}

function V2DashboardInner() {
  const { showToast } = useToast();
  const [snapshot, setSnapshot] = useState<SnapshotState>({ status: "loading" });
  // Initialize to a stable default. Real value (URL > localStorage > default)
  // gets applied in the useEffect below — avoids "0 customers" flicker.
  const [selectedAm, setSelectedAm] = useState<string>(() => ACTIVE_AMS[0] as string);
  const [view, setView] = useState<V2View>("am");
  // Phase 22.B.1 — active signal filter (bound to ?signal= URL param).
  const [signal, setSignal] = useState<SignalKey | null>(null);
  // Phase 22.B.3 — active pod filter (bound to ?pod= URL param). Driven from
  // the V2ManagerDashboard signal-heatmap cell-click flow that navigates
  // here as /v2?pod=Pod+4&signal=we_silent.
  const [podFilter, setPodFilter] = useState<string | null>(null);
  // Phase 24 — URL-bound filter (?filter=) so KPI-tile clicks + manager-side
  // deep links flip the active V2AMTriage lane on mount.
  const [filterFromUrl, setFilterFromUrl] = useState<string | null>(null);
  const [sortFromUrl, setSortFromUrl] = useState<string | null>(null);
  const [welcomeDismissed, setWelcomeDismissed] = useState<boolean>(true);
  const [mounted, setMounted] = useState<boolean>(false);

  // Hydration-safe: only read browser state after mount
  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get("am");
    const fromStorage = window.localStorage.getItem(STORAGE_AM_KEY);
    const defaultAm = fromQuery || fromStorage || (ACTIVE_AMS[0] as string);
    setSelectedAm(defaultAm);
    const sigFromQuery = url.searchParams.get("signal");
    if (isSignalKey(sigFromQuery)) setSignal(sigFromQuery);
    const podFromQuery = url.searchParams.get("pod");
    if (podFromQuery) setPodFilter(podFromQuery);
    const filterQ = url.searchParams.get("filter");
    if (filterQ) setFilterFromUrl(filterQ);
    const sortQ = url.searchParams.get("sort");
    if (sortQ) setSortFromUrl(sortQ);
    setWelcomeDismissed(window.localStorage.getItem(STORAGE_WELCOME_DISMISSED) === "1");
  }, []);

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

  const handleSelectAm = useCallback((am: string) => {
    setSelectedAm(am);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_AM_KEY, am);
      const url = new URL(window.location.href);
      url.searchParams.set("am", am);
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  // Phase 22.B.1 — keep ?signal= in URL in sync with the signal state. We
  // re-use the same window.history pattern as handleSelectAm above (we're
  // not in App-Router-routing-aware territory here — this dashboard is a
  // client island).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const current = url.searchParams.get("signal");
    const next = signal ?? null;
    if (next === current) return;
    if (next === null) url.searchParams.delete("signal");
    else url.searchParams.set("signal", next);
    window.history.replaceState({}, "", url.toString());
  }, [signal]);

  // Phase 22.B.3 — same mirror, ?pod= edition. Lives alongside the signal
  // URL effect so they share the same `history.replaceState` cadence.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const current = url.searchParams.get("pod");
    const next = podFilter ?? null;
    if (next === current) return;
    if (next === null) url.searchParams.delete("pod");
    else url.searchParams.set("pod", next);
    window.history.replaceState({}, "", url.toString());
  }, [podFilter]);

  // Phase 22.B.1 — chip click handler. Toggles the active signal and
  // surfaces a toast confirming the filter state. Passed down to
  // V2CustomerCard via V2AMTriage so chip clicks route through here.
  const handleSignalChipClick = useCallback(
    (key: SignalKey) => {
      setSignal((prev) => {
        if (prev === key) {
          showToast("Filter cleared", { type: "info", icon: "filter" });
          return null;
        }
        showToast(`Filtered to: ${SIGNAL_LABELS[key]}`, {
          type: "info",
          icon: "filter",
        });
        return key;
      });
    },
    [showToast],
  );

  // Phase 24 — KPI tile click handler. Sets the active filter, syncs URL,
  // and fires a confirmation toast. Used by the four AM-view KPI tiles
  // (Total / Need to call / Watch / Healthy).
  const handleKpiTileClick = useCallback(
    (filter: "all" | "act" | "improving" | "quiet", label: string) => {
      setFilterFromUrl(filter);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("filter", filter);
        window.history.replaceState({}, "", url.toString());
      }
      showToast(`Showing: ${label}`, { type: "info", icon: "filter" });
    },
    [showToast],
  );

    const handleDismissWelcome = useCallback(() => {
    setWelcomeDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_WELCOME_DISMISSED, "1");
    }
  }, []);

  // Phase 18.A: per-AM pinned customer set. Persisted in Postgres via
  // /api/v2/pinned. Toggling is optimistic — flip immediately, revert on
  // error so the UI stays responsive even on a flaky network.
  const [pinnedSet, setPinnedSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedAm) {
      setPinnedSet(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v2/pinned?am=${encodeURIComponent(selectedAm)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          ok: boolean;
          pinned?: { entity_id: string }[];
        };
        if (cancelled || !json.ok) return;
        setPinnedSet(new Set((json.pinned || []).map((p) => p.entity_id)));
      } catch {
        /* ignore — pin set defaults to empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedAm]);

  const handleTogglePinned = useCallback(
    (entityId: string, meta: { customer_id: string | null; bizname: string | null }) => {
      const am = selectedAm;
      if (!am) return;
      // Optimistic update
      const wasPinned = pinnedSet.has(entityId);
      setPinnedSet((prev) => {
        const next = new Set(prev);
        if (wasPinned) next.delete(entityId);
        else next.add(entityId);
        return next;
      });
      (async () => {
        try {
          const res = await fetch("/api/v2/pinned", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              am,
              entity_id: entityId,
              customer_id: meta.customer_id,
              bizname: meta.bizname,
            }),
          });
          if (!res.ok) {
            const txt = await res.text().catch(() => res.statusText);
            // Revert on error
            setPinnedSet((prev) => {
              const next = new Set(prev);
              if (wasPinned) next.add(entityId);
              else next.delete(entityId);
              return next;
            });
            if (typeof window !== "undefined") {
              showToast(`Couldn't update pin: ${res.status} ${txt.slice(0, 200)}`, { type: "error" });
            }
          }
        } catch (e) {
          // Revert on network error
          setPinnedSet((prev) => {
            const next = new Set(prev);
            if (wasPinned) next.add(entityId);
            else next.delete(entityId);
            return next;
          });
          if (typeof window !== "undefined") {
            const msg = e instanceof Error ? e.message : String(e);
            showToast(`Couldn't update pin: ${msg}`, { type: "error" });
          }
        }
      })();
    },
    [selectedAm, pinnedSet],
  );

  // Phase 19: per-AM snoozed customer map (entity_id -> snoozed_until ISO).
  // Persisted in Postgres via /api/v2/snooze. Optimistic toggles with revert
  // on error, mirroring the pinnedSet pattern above.
  const [snoozedSet, setSnoozedSet] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!selectedAm) {
      setSnoozedSet(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v2/snooze?am=${encodeURIComponent(selectedAm)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          ok: boolean;
          snoozed?: { entity_id: string; snoozed_until: string }[];
        };
        if (cancelled || !json.ok) return;
        const m = new Map<string, string>();
        for (const row of json.snoozed || []) m.set(row.entity_id, row.snoozed_until);
        setSnoozedSet(m);
      } catch {
        /* ignore — snooze set defaults to empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedAm]);

  const handleSnooze = useCallback(
    (
      entityId: string,
      days: number,
      meta: { customer_id: string | null; bizname: string | null },
    ) => {
      const am = selectedAm;
      if (!am) return;
      const optimisticUntil = new Date(
        Date.now() + days * 24 * 60 * 60 * 1000,
      ).toISOString();
      const prevValue = snoozedSet.get(entityId);
      setSnoozedSet((prev) => {
        const next = new Map(prev);
        next.set(entityId, optimisticUntil);
        return next;
      });
      (async () => {
        try {
          const res = await fetch("/api/v2/snooze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              am,
              entity_id: entityId,
              days,
              customer_id: meta.customer_id,
              bizname: meta.bizname,
            }),
          });
          if (!res.ok) {
            const txt = await res.text().catch(() => res.statusText);
            setSnoozedSet((prev) => {
              const next = new Map(prev);
              if (prevValue) next.set(entityId, prevValue);
              else next.delete(entityId);
              return next;
            });
            if (typeof window !== "undefined") {
              showToast(`Couldn't snooze: ${res.status} ${txt.slice(0, 200)}`, { type: "error" });
            }
            return;
          }
          const json = (await res.json()) as {
            ok: boolean;
            snoozed?: { snoozed_until: string };
          };
          if (json.ok && json.snoozed?.snoozed_until) {
            setSnoozedSet((prev) => {
              const next = new Map(prev);
              next.set(entityId, json.snoozed!.snoozed_until);
              return next;
            });
          }
        } catch (e) {
          setSnoozedSet((prev) => {
            const next = new Map(prev);
            if (prevValue) next.set(entityId, prevValue);
            else next.delete(entityId);
            return next;
          });
          if (typeof window !== "undefined") {
            const msg = e instanceof Error ? e.message : String(e);
            showToast(`Couldn't snooze: ${msg}`, { type: "error" });
          }
        }
      })();
    },
    [selectedAm, snoozedSet],
  );

  const handleUnsnooze = useCallback(
    (entityId: string) => {
      const am = selectedAm;
      if (!am) return;
      const prevValue = snoozedSet.get(entityId);
      setSnoozedSet((prev) => {
        const next = new Map(prev);
        next.delete(entityId);
        return next;
      });
      (async () => {
        try {
          const res = await fetch(
            `/api/v2/snooze?am=${encodeURIComponent(am)}&entity_id=${encodeURIComponent(entityId)}`,
            { method: "DELETE" },
          );
          if (!res.ok) {
            const txt = await res.text().catch(() => res.statusText);
            setSnoozedSet((prev) => {
              const next = new Map(prev);
              if (prevValue) next.set(entityId, prevValue);
              return next;
            });
            if (typeof window !== "undefined") {
              showToast(`Couldn't unsnooze: ${res.status} ${txt.slice(0, 200)}`, { type: "error" });
            }
          }
        } catch (e) {
          setSnoozedSet((prev) => {
            const next = new Map(prev);
            if (prevValue) next.set(entityId, prevValue);
            return next;
          });
          if (typeof window !== "undefined") {
            const msg = e instanceof Error ? e.message : String(e);
            showToast(`Couldn't unsnooze: ${msg}`, { type: "error" });
          }
        }
      })();
    },
    [selectedAm, snoozedSet],
  );

  const amCustomers = useMemo<ScoredCustomerV2[]>(() => {
    if (snapshot.status !== "ready" || !selectedAm) return [];
    return snapshot.snapshot.customers.filter((c) => c.am_name === selectedAm);
  }, [snapshot, selectedAm]);

  const allAms = useMemo(() => {
    const set = new Set<string>(ACTIVE_AMS);
    for (const a of INCOMING_AMS) set.add(a);
    if (snapshot.status === "ready") {
      for (const c of snapshot.snapshot.customers) if (c.am_name) set.add(c.am_name);
    }
    return Array.from(set).sort();
  }, [snapshot]);

  const selectedPod = selectedAm ? POD_MAP[selectedAm] || "" : "";

  const ready = snapshot.status === "ready" ? snapshot.snapshot : null;

  // ---------------------------------------------------------------------------
  // KPI tiles — RED count + MRR-at-risk computed CONSISTENTLY from this AM's
  // book. Phase 17.B had a bug where RED count was snapshot-wide while MRR
  // filtered to selectedAm → ratio looked nonsensical. Both now filter the
  // same way: only `am_name === selectedAm` customers contribute to either.
  // ---------------------------------------------------------------------------
  const { redCountForAm, yellowCountForAm, greenCountForAm, mrrAtRisk } = useMemo(() => {
    if (!ready) {
      return { redCountForAm: 0, yellowCountForAm: 0, greenCountForAm: 0, mrrAtRisk: 0 };
    }
    let red = 0;
    let yellow = 0;
    let green = 0;
    let mrr = 0;
    for (const c of ready.customers) {
      if (c.am_name !== selectedAm) continue;
      const light = c.signals_v2?.stoplight;
      if (light === "RED") {
        red++;
        const amt = Number(c.plan_amount);
        if (Number.isFinite(amt) && amt > 0) mrr += amt;
      } else if (light === "YELLOW") {
        yellow++;
      } else if (light === "GREEN") {
        green++;
      }
    }
    return { redCountForAm: red, yellowCountForAm: yellow, greenCountForAm: green, mrrAtRisk: mrr };
  }, [ready, selectedAm]);

  const scopeCustomerCount = amCustomers.length;
  const totalScopeCount = ready?.scope?.customer_count ?? 921;

  return (
    <div
      data-theme="zoca-light"
      className="min-h-screen text-zoca-text v2-mesh-bg"
      style={{ background: "var(--zoca-bg-soft)" }}
    >
      <CursorGlow />
      <V2Header
        generatedAt={ready?.generatedAt}
        selectedAm={selectedAm}
        allAms={allAms}
        onAmChange={handleSelectAm}
        view={view}
        setView={setView}
      />
      {ready && <FreshnessBanner generatedAt={ready.generatedAt} />}
      <V2Hero
        amName={selectedAm}
        redCount={redCountForAm}
        customerCount={totalScopeCount}
      />
      <V2RefreshBar
        showing={amCustomers.length}
        total={totalScopeCount}
        generatedAt={ready?.generatedAt}
        amName={selectedAm}
        pod={selectedPod}
      />
      <V2KpiTiles
        tiles={[
          {
            label: "Total",
            value: scopeCustomerCount,
            subtitle: "in your book",
            color: "midnight",
            selected: filterFromUrl === "all",
            onClick: () => handleKpiTileClick("all", "full book"),
          },
          {
            label: "Need to call",
            value: redCountForAm,
            subtitle: `$${Math.round(mrrAtRisk).toLocaleString()} at risk`,
            color: "pink",
            // Phase 24 — "Need to call" is the canonical default lane. Keep
            // the pink border whenever the URL has no ?filter= or filter=act.
            selected: filterFromUrl === "act" || filterFromUrl === null,
            onClick: () => handleKpiTileClick("act", "need to call"),
          },
          {
            label: "Watch",
            value: yellowCountForAm,
            subtitle: "likely save calls",
            color: "amber",
            selected: filterFromUrl === "improving",
            onClick: () => handleKpiTileClick("improving", "watch lane"),
          },
          {
            label: "Healthy",
            value: greenCountForAm,
            subtitle: "in your book",
            color: "green",
            selected: filterFromUrl === "quiet",
            onClick: () => handleKpiTileClick("quiet", "healthy lane"),
          },
        ]}
      />

      <main className="mx-auto max-w-[920px] px-4 pb-24 pt-4 md:px-6">
        {mounted && !welcomeDismissed && snapshot.status === "ready" && (
          <V2WelcomeStrip
            amName={selectedAm}
            customers={amCustomers}
            onDismiss={handleDismissWelcome}
          />
        )}

        {snapshot.status === "loading" && <V2LoadingSkeleton />}
        {snapshot.status === "error" && (
          <V2ErrorState
            message={snapshot.message}
            onRetry={() => window.location.reload()}
          />
        )}

        {snapshot.status === "ready" && !selectedAm && <V2SelectAmPrompt />}

        {snapshot.status === "ready" && selectedAm && view === "am" && (
          <>
            {/*
              Phase 23.A — interactive chart row, AM view only. Renders right
              under the KPI tiles and above V2AMTriage. Click handlers route
              into /v2 with filter/signal URL params so the existing chip /
              filter-pill machinery picks up the navigation.
            */}
            <section style={{ padding: "0 0 16px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  marginBottom: "10px",
                }}
              >
                <BookHealthDonut
                  redCount={redCountForAm}
                  yellowCount={yellowCountForAm}
                  greenCount={greenCountForAm}
                  amName={selectedAm}
                />
                <SignalMixPie customers={amCustomers} amName={selectedAm} />
              </div>
              <RedTrendLine currentRed={redCountForAm} amName={selectedAm} />
            </section>
          <V2AMTriage
            amName={selectedAm}
            pod={selectedPod}
            customers={amCustomers}
            generatedAt={snapshot.snapshot.generatedAt}
            pinnedSet={pinnedSet}
            onTogglePinned={handleTogglePinned}
            snoozedSet={snoozedSet}
            onSnooze={handleSnooze}
            onUnsnooze={handleUnsnooze}
            signal={signal}
            onSignalChange={setSignal}
            onSignalChipClick={handleSignalChipClick}
            podFilter={podFilter}
            onPodFilterChange={setPodFilter}
            filterFromUrl={filterFromUrl as ("pinned" | "act" | "improving" | "quiet" | "all" | "snoozed" | null)}
            sortFromUrl={sortFromUrl as ("urgency" | "plan" | "lasttouch" | null)}
          />
          </>
        )}
        {snapshot.status === "ready" && view === "pod" && (
          <V2Rollup
            snapshot={snapshot.snapshot}
            initialPod={selectedPod || "All"}
            onJumpToAm={(am) => {
              handleSelectAm(am);
              setView("am");
            }}
          />
        )}
        {snapshot.status === "ready" && view === "leadership" && (
          <V2Rollup
            snapshot={snapshot.snapshot}
            initialPod="All"
            onJumpToAm={(am) => {
              handleSelectAm(am);
              setView("am");
            }}
          />
        )}
      </main>

      <footer className="border-t border-zoca-border py-8 text-center">
        <div className="flex flex-col items-center gap-2 opacity-70">
          <ZocaLogo height={18} />
          <p className="text-xs text-zoca-text-soft">
            Customer Health · v2 preview · refreshed daily at 22:00 UTC
          </p>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton — 4 card-shaped placeholders pulse during fetch
// ---------------------------------------------------------------------------

function V2LoadingSkeleton() {
  return (
    <section className="mt-2" aria-busy="true" aria-live="polite">
      <div className="mb-4 h-9 w-3/4 rounded-zoca-sm v2-skeleton" />
      <div className="mb-5 flex gap-2">
        <div className="h-8 w-44 rounded-zoca-pill v2-skeleton" />
        <div className="h-8 w-28 rounded-zoca-pill v2-skeleton" />
        <div className="h-8 w-60 rounded-zoca-pill v2-skeleton" />
      </div>
      <CustomerCardSkeleton />
    </section>
  );
}

function V2ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-8 rounded-zoca border border-red-500/30 bg-red-500/10 p-6" role="alert">
      <h2 className="font-display text-lg font-bold text-red-200">Could not load snapshot</h2>
      <p className="mt-2 text-sm text-zoca-text-muted">{message}</p>
      <p className="mt-2 text-xs text-zoca-text-soft">
        If this persists, the daily refresh cron may have failed. Check Vercel logs or
        re-run /api/cron/refresh/compose.
      </p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-zoca-pill bg-zoca-pink-2/20 px-4 py-2 text-sm font-medium text-zoca-pink-2 transition hover:bg-zoca-pink-2/30"
      >
        Retry
      </button>
    </div>
  );
}

function V2SelectAmPrompt() {
  return (
    <div className="mt-12 rounded-zoca border border-dashed border-zoca-border-2 px-6 py-12 text-center">
      <p className="font-display text-lg font-bold text-zoca-text-primary">
        Select an AM to view their book.
      </p>
      <p className="mt-2 text-sm text-zoca-text-muted">
        Use the dropdown in the top bar to pick yourself or another AM.
      </p>
    </div>
  );
}
