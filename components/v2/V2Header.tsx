"use client";
import { useEffect, useState } from "react";
import { ZocaLogo } from "./ZocaLogo";
import { AmPickerPill } from "./AmPickerPill";
import { RefreshButton } from "./RefreshButton";
import type { V2View } from "./V2Dashboard";

type AmProps = {
  generatedAt?: string | null;
  mode?: "am";
  selectedAm: string;
  allAms: string[];
  onAmChange: (am: string) => void;
  view: V2View;
  setView: (view: V2View) => void;
};

type ManagerProps = {
  generatedAt?: string | null;
  mode: "manager";
  selectedAm?: never;
  allAms?: never;
  onAmChange?: never;
  view?: never;
  setView?: never;
};

type Props = AmProps | ManagerProps;

function relativeAge(generatedAt: string | null | undefined): string {
  if (!generatedAt) return "—";
  const ms = Date.now() - Date.parse(generatedAt);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Phase 17.B.1 + 17.C + 17.D — Consolidated top nav.
 *
 * SINGLE sticky bar holding the entire global chrome.
 *   mode="am":
 *     left:  ZOCA logo + "| Customer Health" + AM picker pill
 *     right: view tab (AM's view)
 *            + Manager link + Live status pill
 *   mode="manager" (Phase 17.D):
 *     left:  ZOCA logo + "| Customer Health · Manager"
 *     right: "← AM view" link + Refresh button + Live status pill
 *            (no AM picker, no view tabs — this is rollup-level)
 */
export function V2Header(props: Props) {
  const { generatedAt, mode } = props;
  const isManager = mode === "manager";
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    function onScroll() {
      setCompact(window.scrollY > 80);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`sticky top-0 z-20 flex items-center justify-between px-6 py-3 border-b backdrop-blur-md flex-wrap gap-3 ${compact ? "v2-header-compact" : ""}`}
      style={{
        background: "rgba(255,255,255,0.85)",
        borderColor: "var(--zoca-border)",
        transition: "padding 0.2s ease, box-shadow 0.2s ease",
      }}
    >
      {/* Left side — branding + (AM picker for AM mode, page name for manager mode) */}
      <div className="flex items-center gap-3 flex-wrap">
        <a
          href="/v2"
          className="flex items-center gap-3 no-underline"
          aria-label="Zoca Customer Health home"
        >
          <ZocaLogo height={20} color="var(--zoca-text)" />
          <span className="text-zoca-text-3 text-xs">|</span>
          <span
            className="text-zoca-text text-[13px] font-medium"
            style={{ letterSpacing: "-0.005em" }}
          >
            {isManager ? "Customer Health · Manager" : "Customer Health"}
          </span>
        </a>

        {!isManager && (
          <AmPickerPill
            selectedAm={props.selectedAm}
            allAms={props.allAms}
            onChange={props.onAmChange}
          />
        )}
      </div>

      {/* Right side — view tabs / manager link / live status */}
      <div className="flex items-center gap-3 flex-wrap">
        {!isManager && (
          <>
            <div
              className="inline-flex items-center gap-1 p-1 rounded-lg"
              style={{
                background: "var(--zoca-bg-soft)",
                border: "1px solid var(--zoca-border)",
              }}
            >
              <ViewTab
                label="AM's view"
                active={props.view === "am"}
                onClick={() => props.setView("am")}
              />
            </div>

            <a
              href="/v2/manager"
              className="text-[11px] font-medium text-zoca-text transition"
              style={{ textDecoration: "none" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--zoca-blue)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--zoca-text)";
              }}
              aria-label="Open manager dashboard"
            >
              Manager <span className="text-[10px]">→</span>
            </a>
          </>
        )}

        {isManager && (
          <>
            <a
              href="/v2"
              className="text-[11px] font-medium text-zoca-text transition"
              style={{ textDecoration: "none" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--zoca-blue)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--zoca-text)";
              }}
              aria-label="Back to AM view"
            >
              <span className="text-[10px]">←</span> AM view
            </a>
            <RefreshButton />
          </>
        )}

        <div className="v2-header-status flex items-center gap-2 text-[11px] text-zoca-text-2" style={{ transition: "font-size 0.2s ease" }}>
          <span className="zoca-pulse-dot-green" />
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            Live · {relativeAge(generatedAt)}
          </span>
        </div>
      </div>
    </nav>
  );
}

function ViewTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="px-3 py-1 rounded-md text-[11px] transition"
      style={
        active
          ? {
              background: "var(--zoca-text)",
              color: "#ffffff",
              fontWeight: 600,
            }
          : {
              background: "transparent",
              color: "var(--zoca-text-2)",
              fontWeight: 500,
            }
      }
    >
      {label}
    </button>
  );
}

export default V2Header;
