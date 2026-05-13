"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ZocaLogo from "@/components/ZocaLogo";
import { ACTIVE_AMS, INCOMING_AMS, POD_MAP } from "@/lib/config";
import type { SnapshotV2, ScoredCustomerV2 } from "@/lib/types";
import V2TopBar from "./V2TopBar";
import V2WelcomeStrip from "./V2WelcomeStrip";
import V2AMTriage from "./V2AMTriage";
import V2Rollup from "./V2Rollup";
import ScopeStrip from "./ScopeStrip";
import FreshnessBanner from "./FreshnessBanner";

const STORAGE_AM_KEY = "zoca_v2_selected_am";
const STORAGE_WELCOME_DISMISSED = "zoca_v2_welcome_dismissed";

type SnapshotState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; snapshot: SnapshotV2 };

export type V2View = "am" | "pod" | "leadership";

export default function V2Dashboard() {
  const [snapshot, setSnapshot] = useState<SnapshotState>({ status: "loading" });
  // Initialize to a stable default. Real value (URL > localStorage > default)
  // gets applied in the useEffect below — avoids "0 customers" flicker.
  const [selectedAm, setSelectedAm] = useState<string>(() => ACTIVE_AMS[0] as string);
  const [view, setView] = useState<V2View>("am");
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

  const handleDismissWelcome = useCallback(() => {
    setWelcomeDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_WELCOME_DISMISSED, "1");
    }
  }, []);

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

  const selectedPod = selectedAm ? POD_MAP[selectedAm] || "" : "";

  return (
    <div className="min-h-screen bg-zoca-body text-zoca-text-primary">
      {snapshot.status === "ready" && (
        <FreshnessBanner generatedAt={snapshot.snapshot.generatedAt} />
      )}
      <V2TopBar
        selectedAm={selectedAm}
        selectedPod={selectedPod}
        allAms={allAms}
        view={view}
        freshness={freshnessLabel}
        onSelectAm={handleSelectAm}
        onSetView={setView}
      />

      {snapshot.status === "ready" && <ScopeStrip scope={snapshot.snapshot.scope} />}

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
          <V2AMTriage
            amName={selectedAm}
            pod={selectedPod}
            customers={amCustomers}
            generatedAt={snapshot.snapshot.generatedAt}
          />
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
      <div className="mb-4 h-9 w-3/4 rounded-zoca-sm bg-zoca-bg-2/40 motion-safe:animate-pulse" />
      <div className="mb-5 flex gap-2">
        <div className="h-8 w-44 rounded-zoca-pill bg-zoca-bg-2/40 motion-safe:animate-pulse" />
        <div className="h-8 w-28 rounded-zoca-pill bg-zoca-bg-2/40 motion-safe:animate-pulse" />
        <div className="h-8 w-60 rounded-zoca-pill bg-zoca-bg-2/40 motion-safe:animate-pulse" />
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[130px] rounded-zoca-lg border border-zoca-border bg-zoca-card motion-safe:animate-pulse"
            style={{ opacity: 1 - i * 0.15 }}
          />
        ))}
      </div>
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

