"use client";

type Props = {
  values: number[];
  width?: number;
  height?: number;
  color?: string; // CSS color or tailwind text-* via currentColor
  fillColor?: string; // optional fill under the line
  label?: string;
  min?: number;
  max?: number;
  showLastPoint?: boolean;
  className?: string;
};

export default function V2Sparkline({
  values,
  width = 80,
  height = 24,
  color = "currentColor",
  fillColor,
  label,
  min,
  max,
  showLastPoint = true,
  className,
}: Props) {
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

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const fillPath = fillColor
    ? `M0,${height} ${pts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} L${pts[pts.length - 1].x.toFixed(1)},${height} Z`
    : null;

  const last = pts[pts.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label || `Sparkline of ${values.length} values, last value ${values[values.length - 1]}`}
      className={className}
    >
      {fillPath && <path d={fillPath} fill={fillColor} />}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showLastPoint && (
        <circle cx={last.x} cy={last.y} r={1.8} fill={color} />
      )}
    </svg>
  );
}
