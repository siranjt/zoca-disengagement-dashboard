import Dashboard from "@/components/Dashboard";
import ZocaLogo from "@/components/ZocaLogo";

export default function Home() {
  return (
    <>
      {/* ===== Top nav with Zoca logo ===== */}
      <nav className="sticky top-0 z-50 border-b border-zoca-border bg-zoca-bg-nav backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-3.5">
          <a href="/" className="flex items-center gap-2 text-zoca-light-purple-2" aria-label="Zoca home">
            <ZocaLogo height={22} />
            <span className="hidden text-xs font-medium tracking-wide text-zoca-text-soft sm:inline">
              · Customer Disengagement
            </span>
          </a>
          <div className="hidden items-center gap-6 text-sm text-zoca-text-muted md:flex">
            <span className="transition hover:text-white">Live book · Chargebee + Metabase</span>
            <span className="text-zoca-text-soft">·</span>
            <span className="transition hover:text-white">Refresh on demand</span>
          </div>
        </div>
      </nav>

      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-20 h-[500px] w-[500px] rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, rgba(255, 134, 225, 0.28), transparent 70%)",
            filter: "blur(48px)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 top-8 h-[420px] w-[420px] rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, rgba(120, 104, 244, 0.22), transparent 70%)",
            filter: "blur(48px)",
          }}
        />

        <div className="relative mx-auto max-w-7xl px-6 pb-4 pt-14 text-center">
          <div className="zoca-chip mb-5 mx-auto">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-zoca-pink-2" />
            Comms-quality review · refresh on demand
          </div>
          <h1 className="font-display text-5xl font-black tracking-zoca-tighter text-white md:text-zoca-h1">
            Customer{" "}
            <span className="zoca-gradient-text sparkle-word">Disengagement</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-zoca-text-muted md:text-lg">
            Who's going quiet, where we've let the line drop, and which accounts need AM outreach this week —
            scored across 90 days of chat, email, phone, video, and SMS.
          </p>
          <div className="mt-5 inline-flex flex-wrap items-center justify-center gap-x-7 gap-y-1.5 text-sm text-zoca-text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-base text-zoca-light-lavender">✱</span>
              All 4 signals
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-base text-zoca-light-lavender">✱</span>
              5 rolling windows
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-base text-zoca-light-lavender">✱</span>
              Per-AM exposure
            </span>
          </div>
        </div>
      </section>

      {/* ===== Dashboard body ===== */}
      <main className="relative mx-auto max-w-7xl px-6 pb-16 pt-2">
        <Dashboard />
      </main>

      {/* ===== Footer w/ logo ===== */}
      <footer className="border-t border-zoca-border py-10 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="opacity-70"><ZocaLogo height={20} /></div>
          <p className="text-xs text-zoca-text-soft">
            Data: Chargebee · Metabase · Hit Refresh any time to pull the latest.
          </p>
        </div>
      </footer>
    </>
  );
}
