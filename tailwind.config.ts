import type { Config } from "tailwindcss";

// Zoca dark-mode palette matching zoca.com
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-montserrat)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        "zoca-h1": ["4.75rem", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        "zoca-h2": ["2.75rem", { lineHeight: "1.1", letterSpacing: "-0.025em" }],
        "zoca-h3": ["1.5rem", { lineHeight: "1.3", letterSpacing: "-0.01em" }],
      },
      letterSpacing: {
        "zoca-tight": "-0.025em",
        "zoca-tighter": "-0.03em",
      },
      colors: {
        zoca: {
          // Backgrounds (dark)
          "bg-0": "#0a0422",     // deepest
          "bg-1": "#13063a",      // section
          "bg-2": "#1a0b4a",      // card
          "bg-3": "#24125c",      // elevated card
          "bg-nav": "rgba(10, 4, 34, 0.7)",
          // Text
          "text-primary": "#ffffff",
          "text-muted": "#c8cafe",
          "text-soft": "rgba(243, 237, 253, 0.55)",
          // Pinks
          "pink-1": "#ffa8cd",
          "pink-2": "#ff86e1",
          "pink-hover": "#f695be",
          "pink-text": "#ff4fa8",
          "primary-active": "#dc0074",
          // Purples
          purple: "#7868f4",
          "light-lavender": "#c8cafe",
          "light-purple-2": "#e5ccff",
          "dark-purple-1": "#1f0843",
          "dark-purple-2": "#0b051d",
          // Borders (semi-transparent lavender)
          border: "rgba(200, 202, 254, 0.10)",
          "border-2": "rgba(200, 202, 254, 0.18)",
          "border-3": "rgba(200, 202, 254, 0.28)",
        },
        member: {
          aariz: "#7868f4",     // purple
          sahisht: "#ff86e1",   // pink-2 (brighter than pink-text for dark bg)
          nicholas: "#ffa8cd",  // pink-1
          prince: "#c8cafe",    // light lavender (so it reads on dark)
        },
      },
      borderRadius: {
        "zoca-sm": "0.75rem",
        "zoca": "1rem",
        "zoca-lg": "1.25rem",
        "zoca-xl": "1.5rem",
        "zoca-2xl": "2rem",
        "zoca-pill": "9999px",
      },
      boxShadow: {
        "zoca-xs":   "0 1px 2px rgba(0,0,0,0.2)",
        "zoca-sm":   "0 4px 12px rgba(0,0,0,0.3)",
        "zoca-md":   "0 20px 40px -12px rgba(0,0,0,0.4)",
        "zoca-lg":   "0 24px 48px -16px rgba(0,0,0,0.5)",
        "zoca-glow": "0 20px 40px -12px rgba(255, 134, 225, 0.35)",
        "zoca-glow-purple": "0 20px 40px -12px rgba(120, 104, 244, 0.35)",
      },
      backgroundImage: {
        // Dark-mode hero gradient with glows
        "zoca-body":
          "radial-gradient(70% 70% at 100% -10%, rgba(220, 0, 116, 0.22), transparent 60%), " +
          "radial-gradient(55% 55% at 15% 5%, rgba(120, 104, 244, 0.22), transparent 60%), " +
          "radial-gradient(40% 40% at 80% 40%, rgba(255, 134, 225, 0.10), transparent 70%), " +
          "linear-gradient(180deg, #13063a 0%, #0a0422 45%, #0a0422 100%)",
        "zoca-card":
          "linear-gradient(135deg, rgba(26, 11, 74, 0.55), rgba(36, 18, 92, 0.55))",
        "zoca-kpi-strip":
          "linear-gradient(135deg, rgba(26, 11, 74, 0.9), rgba(36, 18, 92, 0.9))",
        "zoca-pink-cta":
          "linear-gradient(135deg, #ffa8cd 0%, #ff86e1 100%)",
        "zoca-banner":
          "linear-gradient(135deg, rgba(255, 134, 225, 0.15), rgba(120, 104, 244, 0.15))",
      },
    },
  },
  plugins: [],
};
export default config;
