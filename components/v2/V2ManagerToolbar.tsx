"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SavedView = {
  name: string;
  selectedPod: string;
  currentDate: string;
  compareDays: number;
};

type Props = {
  availableDates: string[];
  currentDate: string;
  onDateChange: (date: string) => void;

  compareDays: number;
  onCompareDaysChange: (days: number) => void;
  comparisonLoading?: boolean;

  savedViews: SavedView[];
  currentViewName: string | null;
  onApplyView: (view: SavedView) => void;
  onSaveView: (name: string, overwrite: boolean) => boolean;
  onRenameView: (oldName: string, newName: string) => boolean;
  onDeleteView: (name: string) => void;

  // Reference iso timestamp for computing relative dates
  refIso: string | null;
};

const COMPARE_OPTIONS = [
  { value: 0, label: "No compare" },
  { value: 1, label: "vs 1d ago" },
  { value: 7, label: "vs 7d ago" },
  { value: 14, label: "vs 14d ago" },
  { value: 30, label: "vs 30d ago" },
];

function diffDays(targetDate: string, refIso: string | null): number | null {
  if (!refIso) return null;
  const target = new Date(`${targetDate}T12:00:00Z`);
  const ref = new Date(refIso);
  ref.setUTCHours(12, 0, 0, 0);
  return Math.round((ref.getTime() - target.getTime()) / 86400000);
}

function formatDateLabel(date: string, refIso: string | null): string {
  if (date === "today") return "Today (latest)";
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  const days = diffDays(date, refIso);
  const formatted = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (days === null) return formatted;
  if (days === 0) return `Today · ${formatted}`;
  if (days === 1) return `Yesterday · ${formatted}`;
  if (days > 0 && days < 7) return `${days} days ago · ${formatted}`;
  if (days > 0) return `${formatted} (${days}d ago)`;
  return formatted;
}

function nearestAvailable(target: string, available: string[]): string | null {
  if (!available.length) return null;
  const tTime = new Date(`${target}T12:00:00Z`).getTime();
  let best: string | null = null;
  let bestDiff = Infinity;
  for (const d of available) {
    const dt = new Date(`${d}T12:00:00Z`).getTime();
    const diff = Math.abs(dt - tTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = d;
    }
  }
  return best;
}

export default function V2ManagerToolbar({
  availableDates,
  currentDate,
  onDateChange,
  compareDays,
  onCompareDaysChange,
  comparisonLoading,
  savedViews,
  currentViewName,
  onApplyView,
  onSaveView,
  onRenameView,
  onDeleteView,
  refIso,
}: Props) {
  const [viewsOpen, setViewsOpen] = useState(false);
  const [saveMode, setSaveMode] = useState(false);
  const [saveValue, setSaveValue] = useState("");
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const viewsRef = useRef<HTMLDivElement | null>(null);
  const saveInputRef = useRef<HTMLInputElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!viewsOpen) return;
    const handler = (e: MouseEvent) => {
      if (viewsRef.current && !viewsRef.current.contains(e.target as Node)) {
        setViewsOpen(false);
        setSaveMode(false);
        setRenamingName(null);
      }
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setViewsOpen(false);
        setSaveMode(false);
        setRenamingName(null);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [viewsOpen]);

  useEffect(() => {
    if (saveMode) {
      setSaveValue(currentViewName || "");
      setSaveError(null);
      setTimeout(() => saveInputRef.current?.focus(), 0);
    }
  }, [saveMode, currentViewName]);

  useEffect(() => {
    if (renamingName) {
      setRenameValue(renamingName);
      setTimeout(() => renameInputRef.current?.focus(), 0);
    }
  }, [renamingName]);

  const handleSaveSubmit = () => {
    const name = saveValue.trim();
    if (!name) {
      setSaveError("Name required.");
      return;
    }
    const exists = savedViews.some((v) => v.name === name);
    if (exists && name !== currentViewName) {
      const confirmed = window.confirm(`Replace existing view "${name}"?`);
      if (!confirmed) return;
      onSaveView(name, true);
    } else {
      onSaveView(name, exists);
    }
    setSaveMode(false);
    setSaveValue("");
  };

  const handleRenameSubmit = () => {
    if (!renamingName) return;
    const newName = renameValue.trim();
    if (!newName || newName === renamingName) {
      setRenamingName(null);
      return;
    }
    const exists = savedViews.some((v) => v.name === newName);
    if (exists) {
      const confirmed = window.confirm(`Replace existing view "${newName}"?`);
      if (!confirmed) return;
    }
    onRenameView(renamingName, newName);
    setRenamingName(null);
  };

  // Quick-jump pill targets
  const quickJumpTargets = useMemo(() => {
    const targets: { label: string; date: string; disabled: boolean }[] = [
      { label: "Today", date: "today", disabled: false },
    ];
    if (refIso) {
      const ymdAt = (daysAgo: number) => {
        const d = new Date(refIso);
        d.setUTCDate(d.getUTCDate() - daysAgo);
        return d.toISOString().slice(0, 10);
      };
      for (const [label, days] of [
        ["Yesterday", 1],
        ["7d ago", 7],
        ["14d ago", 14],
      ] as const) {
        const target = ymdAt(days);
        targets.push({
          label,
          date: target,
          disabled: !availableDates.includes(target),
        });
      }
    }
    return targets;
  }, [availableDates, refIso]);

  return (
    <div
      className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/30 px-3 py-2 print:hidden"
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
              {formatDateLabel(d, refIso)}
            </option>
          ))}
        </select>
      </div>

      {/* Quick-jump pills */}
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label="Quick date jumps"
      >
        {quickJumpTargets.map((t) => {
          const active = t.date === currentDate;
          return (
            <button
              key={t.label}
              onClick={() => !t.disabled && onDateChange(t.date)}
              disabled={t.disabled}
              aria-pressed={active}
              title={t.disabled ? `No snapshot available for ${t.label}` : `Jump to ${t.label}`}
              className={`rounded-zoca-pill border px-2 py-0.5 text-[11px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40 ${
                active
                  ? "border-zoca-pink-cta bg-zoca-pink-cta/20 text-zoca-text-primary"
                  : t.disabled
                    ? "cursor-not-allowed border-zoca-border bg-zoca-bg-2/20 text-zoca-text-soft/50"
                    : "border-zoca-border-2 bg-zoca-bg-2/60 text-zoca-text-soft hover:border-zoca-border-3 hover:text-zoca-text-primary"
              }`}
            >
              {t.label}
            </button>
          );
        })}
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
        {comparisonLoading && (
          <span
            className="inline-flex items-center gap-1 text-[11px] text-zoca-text-soft"
            role="status"
            aria-live="polite"
          >
            <span
              className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-zoca-pink-cta/60"
              aria-hidden
            />
            Loading…
          </span>
        )}
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
            <span className="max-w-[140px] truncate text-zoca-text-primary">
              {currentViewName}
            </span>
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
            className="absolute right-0 top-full z-40 mt-1.5 w-72 overflow-hidden rounded-zoca border border-zoca-border-2 bg-zoca-bg-2/95 shadow-zoca-md backdrop-blur-xl"
          >
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-zoca-text-soft">
              Saved views
            </div>
            {savedViews.length === 0 && (
              <div className="px-3 pb-2 text-[11px] text-zoca-text-soft">
                No saved views yet. Click "Save current view" below.
              </div>
            )}
            <ul className="max-h-72 overflow-y-auto">
              {savedViews.map((v) => {
                const isCurrent = v.name === currentViewName;
                const isRenaming = renamingName === v.name;
                return (
                  <li
                    key={v.name}
                    className={`flex items-center justify-between gap-2 border-t border-zoca-border px-3 py-2 text-[12px] ${
                      isCurrent ? "bg-zoca-pink-cta/10" : ""
                    }`}
                  >
                    {isRenaming ? (
                      <form
                        className="flex flex-1 items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleRenameSubmit();
                        }}
                      >
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setRenamingName(null);
                          }}
                          className="flex-1 rounded border border-zoca-border-3 bg-zoca-bg-1/80 px-2 py-0.5 text-[11px] text-zoca-text-primary focus:border-zoca-pink-cta focus:outline-none"
                          aria-label="New view name"
                        />
                        <button
                          type="submit"
                          className="text-[11px] text-zoca-pink-cta underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
                          aria-label="Save new name"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingName(null)}
                          className="text-[11px] text-zoca-text-soft underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
                          aria-label="Cancel rename"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
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
                          onClick={() => setRenamingName(v.name)}
                          className="text-[11px] text-zoca-text-soft underline-offset-2 hover:text-zoca-pink-cta hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
                          aria-label={`Rename view ${v.name}`}
                          title="Rename"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => onDeleteView(v.name)}
                          className="text-[12px] text-zoca-text-soft underline-offset-2 hover:text-rose-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
                          aria-label={`Delete view ${v.name}`}
                          title={`Delete view ${v.name}`}
                        >
                          ×
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-zoca-border">
              {saveMode ? (
                <form
                  className="flex items-center gap-1 px-3 py-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveSubmit();
                  }}
                >
                  <input
                    ref={saveInputRef}
                    type="text"
                    value={saveValue}
                    onChange={(e) => {
                      setSaveValue(e.target.value);
                      setSaveError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setSaveMode(false);
                    }}
                    placeholder="View name"
                    className="flex-1 rounded border border-zoca-border-3 bg-zoca-bg-1/80 px-2 py-1 text-[12px] text-zoca-text-primary placeholder:text-zoca-text-soft focus:border-zoca-pink-cta focus:outline-none"
                    aria-label="New view name"
                    aria-invalid={!!saveError}
                  />
                  <button
                    type="submit"
                    className="rounded-zoca-pill bg-zoca-pink-cta/20 px-2 py-0.5 text-[11px] font-medium text-zoca-pink-cta transition hover:bg-zoca-pink-cta/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaveMode(false)}
                    className="text-[11px] text-zoca-text-soft hover:text-zoca-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
                    aria-label="Cancel save"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setSaveMode(true)}
                  className="w-full px-3 py-2 text-left text-[12px] font-medium text-zoca-pink-cta transition hover:bg-zoca-pink-cta/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-zoca-pink-cta/40"
                  aria-label="Save current view"
                >
                  + Save current view
                </button>
              )}
              {saveError && (
                <div className="px-3 pb-2 text-[11px] text-rose-300" role="alert">
                  {saveError}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { nearestAvailable };
