"use client";

import { useState, useRef, useEffect } from "react";

export type SavedView = {
  name: string;
  selectedPod: string;
  currentDate: string; // 'today' or YYYY-MM-DD
  compareDays: number;
};

type Props = {
  // Date picker
  availableDates: string[]; // YYYY-MM-DD, most recent first
  currentDate: string; // 'today' or YYYY-MM-DD
  onDateChange: (date: string) => void;

  // Comparison
  compareDays: number; // 0 = off, otherwise days ago
  onCompareDaysChange: (days: number) => void;

  // Saved views
  savedViews: SavedView[];
  currentViewName: string | null;
  onApplyView: (view: SavedView) => void;
  onSaveView: (name: string) => void;
  onDeleteView: (name: string) => void;
};

function formatDateLabel(date: string): string {
  if (date === "today") return "Today (latest)";
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const COMPARE_OPTIONS = [
  { value: 0, label: "No compare" },
  { value: 1, label: "vs 1d ago" },
  { value: 7, label: "vs 7d ago" },
  { value: 14, label: "vs 14d ago" },
];

export default function V2ManagerToolbar({
  availableDates,
  currentDate,
  onDateChange,
  compareDays,
  onCompareDaysChange,
  savedViews,
  currentViewName,
  onApplyView,
  onSaveView,
  onDeleteView,
}: Props) {
  const [viewsOpen, setViewsOpen] = useState(false);
  const viewsRef = useRef<HTMLDivElement | null>(null);

  // Click-outside close for views menu
  useEffect(() => {
    if (!viewsOpen) return;
    const handler = (e: MouseEvent) => {
      if (viewsRef.current && !viewsRef.current.contains(e.target as Node)) {
        setViewsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [viewsOpen]);

  const handleSavePrompt = () => {
    const name = window.prompt("Name this view:", currentViewName || "");
    if (name && name.trim()) {
      onSaveView(name.trim());
    }
    setViewsOpen(false);
  };

  return (
    <div
      className="mb-5 flex flex-wrap items-center gap-2 rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/30 px-3 py-2 print:hidden"
      role="toolbar"
      aria-label="Manager view controls"
    >
      {/* Date picker */}
      <div className="flex items-center gap-1.5">
        <label
          htmlFor="manager-date"
          className="text-[11px] uppercase tracking-wider text-zoca-text-soft"
        >
          Snapshot
        </label>
        <select
          id="manager-date"
          value={currentDate}
          onChange={(e) => onDateChange(e.target.value)}
          className="rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-2/60 px-2.5 py-1 text-[12px] text-zoca-text-primary focus:border-zoca-border-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
          aria-label="Snapshot date"
        >
          <option value="today">Today (latest)</option>
          {availableDates.map((d) => (
            <option key={d} value={d}>
              {formatDateLabel(d)}
            </option>
          ))}
        </select>
      </div>

      {/* Compare */}
      <div className="flex items-center gap-1.5">
        <label
          htmlFor="manager-compare"
          className="text-[11px] uppercase tracking-wider text-zoca-text-soft"
        >
          Compare
        </label>
        <select
          id="manager-compare"
          value={compareDays}
          onChange={(e) => onCompareDaysChange(Number(e.target.value))}
          className="rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-2/60 px-2.5 py-1 text-[12px] text-zoca-text-primary focus:border-zoca-border-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
          aria-label="Compare to N days ago"
        >
          {COMPARE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Saved views */}
      <div className="relative ml-auto" ref={viewsRef}>
        <button
          onClick={() => setViewsOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={viewsOpen}
          className="inline-flex items-center gap-1 rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-2/60 px-3 py-1 text-[12px] text-zoca-text-soft transition hover:border-zoca-border-3 hover:text-zoca-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
        >
          <span aria-hidden>★</span>
          {currentViewName ? (
            <span className="text-zoca-text-primary">{currentViewName}</span>
          ) : (
            <span>Saved views</span>
          )}
          <span className="text-[9px] text-zoca-text-soft" aria-hidden>
            ▾
          </span>
        </button>
        {viewsOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-40 mt-1.5 w-60 overflow-hidden rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/95 shadow-zoca-md backdrop-blur-xl"
          >
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-zoca-text-soft">
              Saved views
            </div>
            {savedViews.length === 0 && (
              <div className="px-3 pb-2 text-[11px] text-zoca-text-soft">
                No saved views yet. Click "Save current" below.
              </div>
            )}
            <ul className="max-h-64 overflow-y-auto">
              {savedViews.map((v) => {
                const isCurrent = v.name === currentViewName;
                return (
                  <li
                    key={v.name}
                    className={`flex items-center justify-between gap-2 border-t border-zoca-border px-3 py-2 text-[12px] ${
                      isCurrent ? "bg-zoca-pink-cta/10" : ""
                    }`}
                  >
                    <button
                      onClick={() => {
                        onApplyView(v);
                        setViewsOpen(false);
                      }}
                      className="flex-1 text-left text-zoca-text-primary underline-offset-2 hover:text-zoca-pink-cta hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
                      aria-label={`Apply view ${v.name}`}
                    >
                      <span className="font-medium">{v.name}</span>
                      <span className="ml-1 text-[10px] text-zoca-text-soft">
                        {v.selectedPod === "All" ? "All pods" : v.selectedPod}
                        {v.currentDate !== "today" ? ` · ${v.currentDate}` : ""}
                        {v.compareDays > 0 ? ` · vs ${v.compareDays}d` : ""}
                      </span>
                    </button>
                    <button
                      onClick={() => onDeleteView(v.name)}
                      className="text-[11px] text-zoca-text-soft underline-offset-2 hover:text-rose-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
                      aria-label={`Delete view ${v.name}`}
                      title={`Delete view ${v.name}`}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-zoca-border">
              <button
                onClick={handleSavePrompt}
                className="w-full px-3 py-2 text-left text-[12px] font-medium text-zoca-pink-cta transition hover:bg-zoca-pink-cta/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
                aria-label="Save current view"
              >
                + Save current view
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
