"use client";

import { AnimatedNumber } from "./AnimatedNumber";

type Tile = {
  label: string;
  value: number | string;
  subtitle: string;
  color: "midnight" | "pink" | "amber" | "green";
  href?: string;
  selected?: boolean;
};

type Props = {
  tiles: Tile[];
};

const COLORS: Record<Tile["color"], string> = {
  midnight: "var(--zoca-text)",
  pink: "var(--zoca-pink)",
  amber: "#b45309",
  green: "#047857",
};

export function V2KpiTiles({ tiles }: Props) {
  return (
    <div
      className="mx-6 mb-6 grid gap-2.5"
      style={{ gridTemplateColumns: `repeat(${tiles.length}, 1fr)` }}
    >
      {tiles.map((tile, i) => {
        const isSelected = tile.selected;
        return (
          <a
            key={i}
            href={tile.href || "#"}
            className="block bg-white rounded-2xl px-4 py-4 no-underline transition cursor-pointer"
            style={{
              border: isSelected
                ? "1px solid var(--zoca-pink)"
                : "1px solid var(--zoca-border)",
              boxShadow: isSelected
                ? "0 0 0 1px rgba(255,86,187,0.35), 0 0 24px rgba(255,168,205,0.35)"
                : "0 1px 3px rgba(11,5,29,0.04)",
              background: isSelected
                ? "linear-gradient(180deg, rgba(255,86,187,0.04), rgba(255,168,205,0.06)), #fff"
                : "#fff",
            }}
          >
            <div className="flex items-center justify-between mb-2.5">
              <span
                className="zoca-micro-label"
                style={isSelected ? { color: "#c026d3" } : undefined}
              >
                {tile.label}
              </span>
              <span
                className="text-[13px] text-zoca-text-3"
                style={isSelected ? { color: "var(--zoca-pink)" } : undefined}
              >
                →
              </span>
            </div>
            <div
              className="font-extrabold leading-none"
              style={{
                fontSize: "32px",
                color: COLORS[tile.color],
                letterSpacing: "-0.03em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {typeof tile.value === "number" ? (
                <AnimatedNumber value={tile.value} duration={900} style={{ animationDelay: `${i * 80}ms` }} />
              ) : (
                tile.value
              )}
            </div>
            <div className="text-[11px] text-zoca-text-2 mt-1.5">{tile.subtitle}</div>
          </a>
        );
      })}
    </div>
  );
}

export default V2KpiTiles;
