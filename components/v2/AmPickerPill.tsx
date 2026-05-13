"use client";

import { useEffect, useRef, useState } from "react";
import { POD_MAP } from "@/lib/config";

type Props = {
  selectedAm: string;
  allAms: string[];
  onChange: (am: string) => void;
};

function initialsFor(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Phase 17.B.1 + 17.C — Consolidated top nav.
 *
 * Self-contained AM picker pill. Click to open a scrollable dropdown
 * listing every active AM (with their pod label on the right). Selection
 * fires onChange. URL ?am= and localStorage persistence is handled by
 * the parent (V2Dashboard) — this component is presentational + dropdown.
 */
export function AmPickerPill({ selectedAm, allAms, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click + escape.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pod = selectedAm ? POD_MAP[selectedAm] || "Floating" : "";
  const initials = selectedAm ? initialsFor(selectedAm) : "??";

  // Group AMs by pod for a cleaner dropdown.
  const filtered = allAms.filter((am) =>
    am.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const grouped: Record<string, string[]> = {};
  for (const am of filtered) {
    const p = POD_MAP[am] || "Floating";
    if (!grouped[p]) grouped[p] = [];
    grouped[p].push(am);
  }
  const podOrder = ["Pod 1", "Pod 2", "Pod 3", "Pod 4", "Pod 5", "Floating"];
  const podKeys = podOrder.filter((p) => grouped[p]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`AM picker — selected ${selectedAm || "none"}`}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-white transition cursor-pointer"
        style={{
          borderColor: "var(--zoca-border)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--zoca-bg-soft)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#ffffff";
        }}
      >
        <span
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            background:
              "linear-gradient(135deg, var(--zoca-blue), var(--zoca-pink))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "10px",
            fontWeight: 600,
            color: "white",
            letterSpacing: 0,
          }}
          aria-hidden
        >
          {initials}
        </span>
        <span className="text-[12px] text-zoca-text font-medium">
          {selectedAm || "Select AM"}
        </span>
        {pod && (
          <span className="text-[11px] text-zoca-text-2">· {pod}</span>
        )}
        <span className="text-[10px] text-zoca-text-3">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Choose an AM"
          className="absolute left-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-xl border bg-white"
          style={{
            borderColor: "var(--zoca-border)",
            boxShadow: "0 12px 32px rgba(11,5,29,0.12)",
          }}
        >
          <div
            className="px-3 py-2 border-b"
            style={{ borderColor: "var(--zoca-border)" }}
          >
            <input
              type="text"
              autoFocus
              placeholder="Search AMs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-[12px] text-zoca-text placeholder:text-zoca-text-3 focus:outline-none"
              aria-label="Search AMs"
            />
          </div>
          <div
            className="max-h-72 overflow-y-auto py-1"
            style={{ scrollbarWidth: "thin" }}
          >
            {podKeys.length === 0 && (
              <div className="px-3 py-3 text-[12px] text-zoca-text-2">
                No AMs match.
              </div>
            )}
            {podKeys.map((p) => (
              <div key={p}>
                <div
                  className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase"
                  style={{
                    color: "var(--zoca-text-2)",
                    letterSpacing: "0.12em",
                  }}
                >
                  {p}
                </div>
                {grouped[p].map((am) => {
                  const isSelected = am === selectedAm;
                  return (
                    <button
                      key={am}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSelected}
                      onClick={() => {
                        onChange(am);
                        setOpen(false);
                        setQuery("");
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] transition"
                      style={{
                        background: isSelected
                          ? "var(--zoca-bg-tint)"
                          : "transparent",
                        color: "var(--zoca-text)",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected)
                          e.currentTarget.style.background =
                            "var(--zoca-bg-soft)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected)
                          e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          style={{
                            width: "18px",
                            height: "18px",
                            borderRadius: "50%",
                            background:
                              "linear-gradient(135deg, var(--zoca-blue), var(--zoca-pink))",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "9px",
                            fontWeight: 600,
                            color: "white",
                          }}
                          aria-hidden
                        >
                          {initialsFor(am)}
                        </span>
                        <span className="truncate">{am}</span>
                      </span>
                      {isSelected && (
                        <span
                          className="text-[10px]"
                          style={{ color: "var(--zoca-pink)" }}
                        >
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AmPickerPill;
