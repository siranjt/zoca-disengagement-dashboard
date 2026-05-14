"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ZocaLogo } from "./ZocaLogo";
import { AmPickerPill } from "./AmPickerPill";
import { RefreshButton } from "./RefreshButton";
import { V2UserMenu } from "./V2UserMenu";
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
 *     right: view tabs (My customers / Pod view / Leadership)
 *            + Manager link + Live status pill
 *   mode="manager" (Phase 17.D):
 *     left:  ZOCA logo + "| Customer Health · Manager"
 *     right: "← AM view" link + Refresh button + Live status pill
 *            (no AM picker, no view tabs — this is rollup-level)
 */
export function V2Header(props: Props) {
  const { generatedAt, mode } = props;
  const isManager = mode === "manager";
  const { data: session } = useSession();
  // Phase 33.A — only admin users see the AM picker. AM-role users are
  // locked to their own book (V2Dashboard handles the data filter; here we
  // just hide the chrome).
  const isAdmin = session?.user?.role === "admin";
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

        {!isManager && isAdmin && (
          <AmPickerPill
            selectedAm={props.selectedAm}
            allAms={props.allAms}
            onChange={props.onAmChange}
          />
        )}
      </div>

      {/* Right side — view tabs / manager link / live status */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Phase 33.A.6 — naming simplification restored:
            • removed Pod view + Leadership tabs (re-introduced by Phase 33.A
              agent rebuilding V2Header from the pre-simplification snapshot)
            • two peer tabs: "AM's view" (/v2) + "Manager's view" (/v2/manager)
            • Manager's view tab only visible to admins (AMs are locked to /v2)
        */}
        <div
          className="inline-flex items-center gap-1 p-1 rounded-lg"
          style={{
            background: "var(--zoca-bg-soft)",
            border: "1px solid var(--zoca-border)",
          }}
        >
          <NavTab href="/v2" label="AM's view" active={!isManager} />
          {isAdmin && (
            <NavTab href="/v2/manager" label="Manager's view" active={isManager} />
          )}
        </div>

        {isManager && (
          <>
            <RefreshButton />
          </>
        )}

        <div className="v2-header-status flex items-center gap-2 text-[11px] text-zoca-text-2" style={{ transition: "font-size 0.2s ease" }}>
          <span className="zoca-pulse-dot-green" />
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            Live · {relativeAge(generatedAt)}
          </span>
        </div>

        {/* Phase 33.A — signed-in user menu (avatar + role badge + sign out) */}
        <V2UserMenu />
      </div>
    </nav>
  );
}

// Phase 33.A.6 — NavTab is the anchor-based replacement for the old ViewTab
// (which was button + onClick). Tabs now drive navigation between /v2 and
// /v2/manager rather than swapping internal view state, since "Pod view"
// and "Leadership" no longer exist as panes within /v2.
function NavTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className="px-3 py-1 rounded-md text-[11px] transition"
      style={
        active
          ? {
              background: "var(--zoca-text)",
              color: "#ffffff",
              fontWeight: 600,
              textDecoration: "none",
            }
          : {
              background: "transparent",
              color: "var(--zoca-text-2)",
              fontWeight: 500,
              textDecoration: "none",
            }
      }
    >
      {label}
    </a>
  );
}

export default V2Header;
