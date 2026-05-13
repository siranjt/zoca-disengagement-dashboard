"use client";

import { useState } from "react";
import ZocaLogo from "@/components/ZocaLogo";
import { POD_MAP } from "@/lib/config";
import type { V2View } from "./V2Dashboard";

type Props = {
  selectedAm: string;
  selectedPod: string;
  allAms: string[];
  view: V2View;
  freshness: string;
  onSelectAm: (am: string) => void;
  onSetView: (view: V2View) => void;
};

export default function V2TopBar({
  selectedAm,
  selectedPod,
  allAms,
  view,
  freshness,
  onSelectAm,
  onSetView,
}: Props) {
  const [amMenuOpen, setAmMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-zoca-border bg-zoca-bg-nav backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-3 px-4 py-3 md:gap-4 md:px-6">
        <a
          href="/v2"
          className="flex items-center gap-2 text-zoca-light-purple-2"
          aria-label="Customer Health home"
        >
          <ZocaLogo height={20} />
          <span className="hidden text-[11px] font-medium uppercase tracking-wider text-zoca-text-soft sm:inline">
            Customer Health
          </span>
        </a>

        {/* AM selector */}
        <div className="relative">
          <button
            onClick={() => setAmMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-2/60 px-3 py-1.5 text-[13px] font-medium text-zoca-text-primary transition hover:border-zoca-border-3 hover:bg-zoca-bg-3/60"
            aria-haspopup="menu"
            aria-expanded={amMenuOpen}
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full bg-zoca-pink-cta text-[10px] font-bold text-white"
              aria-hidden
            >
              {selectedAm
                .split(" ")
                .map((p) => p[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")}
            </span>
            <span className="max-w-[160px] truncate">{selectedAm || "Select AM"}</span>
            {selectedPod && (
              <span className="hidden text-[10px] uppercase tracking-wider text-zoca-text-soft sm:inline">
                · {selectedPod}
              </span>
            )}
            <span className="text-[9px] text-zoca-text-soft">▾</span>
          </button>

          {amMenuOpen && (
            <div
              role="menu"
              className="absolute left-0 top-full z-40 mt-2 max-h-80 w-64 overflow-y-auto rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/95 shadow-zoca-md backdrop-blur-xl"
            >
              {allAms.map((am) => {
                const pod = POD_MAP[am] || "Floating";
                const isSelected = am === selectedAm;
                return (
                  <button
                    key={am}
                    onClick={() => {
                      onSelectAm(am);
                      setAmMenuOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] transition hover:bg-zoca-bg-3/60 ${
                      isSelected ? "bg-zoca-bg-3/40" : ""
                    }`}
                  >
                    <span className="truncate">{am}</span>
                    <span className="text-[10px] uppercase tracking-wider text-zoca-text-soft">
                      {pod}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Freshness */}
        <div className="hidden items-center gap-1.5 text-[11px] text-zoca-text-soft md:flex">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-green-400"
            style={{ boxShadow: "0 0 8px rgba(74,222,128,0.7)" }}
          />
          {freshness}
        </div>

        {/* View switcher */}
        <div className="ml-auto flex rounded-zoca border border-zoca-border bg-zoca-bg-1/60 p-1">
          <ViewButton label="My customers" active={view === "am"} onClick={() => onSetView("am")} />
          <ViewButton label="Pod view" active={view === "pod"} onClick={() => onSetView("pod")} />
          <ViewButton label="Leadership" active={view === "leadership"} onClick={() => onSetView("leadership")} />
        </div>
        <a
          href="/v2/monday"
          className="ml-2 hidden rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-2/60 px-3 py-1.5 text-[12px] font-medium text-zoca-text-soft transition hover:border-zoca-border-3 hover:text-zoca-text-primary md:inline-flex"
          aria-label="Open Monday brief"
          title="Monday brief — week-ahead view"
        >
          Monday →
        </a>
        <a
          href="/v2/manager"
          className="ml-2 hidden rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-2/60 px-3 py-1.5 text-[12px] font-medium text-zoca-text-soft transition hover:border-zoca-border-3 hover:text-zoca-text-primary md:inline-flex"
          aria-label="Open manager dashboard"
          title="Manager dashboard — pod summary + signal heatmap + full rollup"
        >
          Manager →
        </a>
      </div>
    </nav>
  );
}

function ViewButton({
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
      onClick={onClick}
      className={`rounded-zoca-sm px-2.5 py-1 text-[11px] font-semibold transition md:px-3.5 md:text-[12px] ${
        active
          ? "bg-zoca-purple text-white"
          : "text-zoca-text-muted hover:text-zoca-text-primary"
      }`}
    >
      {label}
    </button>
  );
}
