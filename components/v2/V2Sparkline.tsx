"use client";

import { useId } from "react";

type Props = {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
  /** Render a vertical gradient from color (top) to transparent (bottom) below the line */
  gradient?: boolean;
  label?: string;
  min?: number;
  max?: number;
  showLastPoint?: boolean;
  showLastValue?: boolean;
  formatLastValue?: (n: number) => string;
  referenceValue?: number | null;
  referenceColor?: string;
  className?: string;
};

export default function V2Sparkline({
  values,
  width = 80,
  height = 24,
  color = "currentColor",
  fillColor,
  gradient = false,
  label,
  min,
  max,
  showLastPoint = true,
  showLastValue = false,
  formatLastValue,
  referenceValue,
  referenceColor = "rgba(255,255,255,0.18)",
  className,
}: Props) {
  const gradId = useId();

  if (!values.length) {
    return (
      <span
        className={`inline-block text-[10px] text-zoca-text-soft ${className || ""}`}
        aria-label="No trend data"
      >
        —
      </span>
    );
  }

  const lo = min !== undefined ? min : Math.min(...values);
  const hi = max !== undefined ? max : Math.max(...values);
  const range = hi - lo || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  const pts = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - lo) / range) * height;
    return { x, y };
  });

  const linePath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const effectiveFill = gradient
    ? `url(#${gradId})`
    : fillColor || null;

  const fillPath = effectiveFill
    ? `M0,${height} ${pts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} L${pts[pts.length - 1].x.toFixed(1)},${height} Z`
    : null;

  const last = pts[pts.length - 1];

  const refY =
    referenceValue !== null && referenceValue !== undefined
      ? height - ((referenceValue - lo) / range) * height
      : null;

  const lastVal = values[values.length - 1];

  return (
    <span className={`inline-flex items-center gap-1 ${className || ""}`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          label ||
          `Sparkline of ${values.length} values, last value ${lastVal}`
        }
      >
        {gradient && (
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
        )}
        {fillPath && <path d={fillPath} fill={effectiveFill || "transparent"} />}
        {refY !== null && (
          <line
            x1={0}
            x2={width}
            y1={refY}
            y2={refY}
            stroke={referenceColor}
            strokeWidth={0.75}
            strokeDasharray="2 2"
          />
        )}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {showLastPoint && <circle cx={last.x} cy={last.y} r={1.8} fill={color} />}
      </svg>
      {showLastValue && (
        <span
          className="text-[10px] font-medium tabular-nums text-zoca-text-soft"
          aria-hidden
        >
          {formatLastValue ? formatLastValue(lastVal) : lastVal}
        </span>
      )}
    </span>
  );
}
