"use client";
import { ZocaSparkle } from "./ZocaSparkle";
import { formatPlannerTitle } from "@/lib/format";

type Props = {
  amName?: string | null;
  redCount?: number;
  customerCount?: number;
};

export function V2Hero({ amName, redCount, customerCount }: Props) {
  const title = formatPlannerTitle(amName);
  const needsCall = redCount ?? 0;
  const totalCount = customerCount ?? 921;
  return (
    <section
      className="zoca-fade-in text-center px-6"
      style={{ paddingTop: "44px", paddingBottom: "24px" }}
    >
      {/* Chip — wrapped in a block-level container so it stacks ABOVE the h1
          instead of sitting next to it on the same baseline. */}
      <div className="mb-5 flex justify-center">
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full"
          style={{
            border: "1px solid rgba(20,110,245,0.18)",
            background: "rgba(20,110,245,0.06)",
          }}
        >
          <span className="zoca-pulse-dot-green" />
          <span
            className="text-[11px] font-semibold uppercase text-zoca-blue"
            style={{ letterSpacing: "0.08em" }}
          >
            Live customer signals · auto-scored by Claude
          </span>
        </div>
      </div>

      {/* Title — wrapped in a block-level container so the gradient h1 with its
          absolutely-positioned sparkles centers cleanly under the chip. */}
      <div>
        <h1
          className="m-0 font-extrabold"
          style={{
            fontSize: "clamp(40px, 6vw, 64px)",
            lineHeight: 1.02,
            letterSpacing: "-0.035em",
            position: "relative",
            display: "inline-block",
          }}
        >
          <ZocaSparkle
            size={18}
            style={{ position: "absolute", top: "-8px", left: "-26px" }}
          />
          <span className="zoca-gradient-text">{title}</span>
          <ZocaSparkle
            size={14}
            delay={1}
            style={{
              position: "absolute",
              top: "-2px",
              right: "-30px",
              color: "var(--zoca-blue)",
            }}
          />
          <ZocaSparkle
            size={11}
            delay={2}
            style={{ position: "absolute", bottom: "2px", right: "-14px" }}
          />
        </h1>
      </div>

      <p
        className="mx-auto mt-4 mb-0 text-zoca-text-2"
        style={{
          maxWidth: "520px",
          fontSize: "14px",
          lineHeight: 1.6,
          letterSpacing: "-0.005em",
        }}
      >
        {needsCall > 0
          ? `${needsCall} customers need your attention today — surfaced from live billing, comms, app usage, and HubSpot signals.`
          : "All clear today — no customers at critical risk. Use the filters below to review the full book."}
      </p>
      <div className="inline-flex items-center gap-6 mt-5 flex-wrap justify-center text-[12px] font-medium text-zoca-text-2">
        <span className="inline-flex items-center gap-2">
          <span className="text-zoca-pink text-sm">{"❋"}</span> {totalCount} active customers
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="text-zoca-pink text-sm">{"❋"}</span> Live Chargebee + Metabase
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="text-zoca-pink text-sm">{"❋"}</span> Claude-scored signals
        </span>
      </div>
    </section>
  );
}

export default V2Hero;
