"use client";
import { ZocaLogo } from "./ZocaLogo";
import { AmPickerPill } from "./AmPickerPill";
import type { V2View } from "./V2Dashboard";

type Props = {
  generatedAt?: string | null;
  selectedAm: string;
  allAms: string[];
  onAmChange: (am: string) => void;
  view: V2View;
  setView: (view: V2View) => void;
};

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
 * Phase 17.B.1 + 17.C — Consolidated top nav.
 *
 * SINGLE sticky bar holding the entire global chrome:
 *   left:  ZOCA logo + "| Customer Health" + AM picker pill
 *   right: view tabs (My customers / Pod view / Leadership)
 *          + Manager link
 *          + Live status pill
 *
 * Replaces the previous V2TopBar entirely. No second nav bar renders
 * anywhere on the page.
 */
export function V2Header({
  generatedAt,
  selectedAm,
  allAms,
  onAmChange,
  view,
  setView,
}: Props) {
  return (
    <nav
      className="sticky top-0 z-20 flex items-center justify-between px-6 py-3 border-b backdrop-blur-md flex-wrap gap-3"
      style={{
        background: "rgba(255,255,255,0.85)",
        borderColor: "var(--zoca-border)",
      }}
    >
      {/* Left side — branding + AM picker */}
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
            Customer Health
          </span>
        </a>

        <AmPickerPill
          selectedAm={selectedAm}
          allAms={allAms}
          onChange={onAmChange}
        />
      </div>

      {/* Right side — view tabs, manager link, live status */}
      <div className="flex items-center gap-3 flex-wrap">
        <div
          className="inline-flex items-center gap-1 p-1 rounded-lg"
          style={{
            background: "var(--zoca-bg-soft)",
            border: "1px solid var(--zoca-border)",
          }}
        >
          <ViewTab
            label="My customers"
            active={view === "am"}
            onClick={() => setView("am")}
          />
          <ViewTab
            label="Pod view"
            active={view === "pod"}
            onClick={() => setView("pod")}
          />
          <ViewTab
            label="Leadership"
            active={view === "leadership"}
            onClick={() => setView("leadership")}
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

        <div className="flex items-center gap-2 text-[11px] text-zoca-text-2">
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
