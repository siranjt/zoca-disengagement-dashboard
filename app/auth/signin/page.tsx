"use client";

// Phase 33.brand-PR3 — Beacon-branded sign-in page.
//
// Preserves Phase 33.A's working OAuth wiring:
//   - Suspense + useSearchParams for callbackUrl + error
//   - signIn("google", { callbackUrl })
//   - AccessDenied banner for non-Zoca emails
//   - Generic error fallback
//   - Loading state on the button
//
// Adds the brand spec §7–8 motion layer. All continuous motion is gated
// by prefers-reduced-motion in app/globals.css.

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { BeaconMark } from "@/components/BeaconMark";

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInShell />}>
      <SignInPageInner />
    </Suspense>
  );
}

function SignInPageInner() {
  const params = useSearchParams();
  const error = params.get("error");
  const callbackUrl = params.get("callbackUrl") || "/v2";
  return <SignInShell error={error} callbackUrl={callbackUrl} />;
}

function SignInShell({
  error,
  callbackUrl = "/v2",
}: {
  error?: string | null;
  callbackUrl?: string;
}) {
  const [loading, setLoading] = useState(false);

  return (
    <div
      data-theme="zoca-light"
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "#FAF9F6",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        overflow: "hidden",
      }}
    >
      {/* 4 drifting background blobs */}
      <div className="b-blob b-blob-1" aria-hidden="true" />
      <div className="b-blob b-blob-2" aria-hidden="true" />
      <div className="b-blob b-blob-3" aria-hidden="true" />
      <div className="b-blob b-blob-4" aria-hidden="true" />

      {/* 6 sparkles */}
      <Sparkle top="8%" left="14%" color="#8B5CF6" size={16} delay={0} rotate />
      <Sparkle top="14%" right="14%" color="#ff56bb" size={14} delay={0.3} />
      <Sparkle top="44%" left="9%" color="#3B82F6" size={12} delay={0.6} />
      <Sparkle top="38%" right="14%" color="#F97316" size={16} delay={0.9} rotate />
      <Sparkle bottom="22%" left="16%" color="#A78BFA" size={14} delay={1.2} rotate reverse />
      <Sparkle bottom="28%" right="12%" color="#F472B6" size={12} delay={1.5} />

      {/* 2 drift dots */}
      <div className="b-drift-dot" style={{ top: "32%", left: "7%", background: "#8B5CF6" }} aria-hidden="true" />
      <div className="b-drift-dot b-drift-dot-2" style={{ bottom: "14%", right: "7%", background: "#F97316" }} aria-hidden="true" />

      {/* THE CARD */}
      <div
        className="b-card"
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: "400px",
          background: "#ffffff",
          border: "0.5px solid #E5E7EB",
          borderRadius: "20px",
          padding: "32px 36px 28px",
          boxShadow: "0 12px 40px rgba(11,5,29,0.06)",
          textAlign: "center",
        }}
      >
        {/* Mark with halo */}
        <div className="b-mark-fade" style={{ position: "relative", display: "inline-block", marginBottom: "16px" }}>
          <div className="b-halo" aria-hidden="true" />
          <BeaconMark size={64} flicker />
        </div>

        {/* BEACON wordmark with gradient shimmer */}
        <div className="b-wordmark">BEACON</div>

        {/* Tagline */}
        <div className="b-tagline-fade" style={{ fontSize: "10.5px", letterSpacing: "0.3em", color: "#6B7280", marginTop: "10px" }}>
          A &middot; SIGNAL &middot; WORTH &middot; FOLLOWING
        </div>

        {/* Divider */}
        <div className="b-divider-fade" style={{ width: "220px", height: "0.5px", background: "#E5E7EB", margin: "20px auto" }} />

        {/* Error banners — preserved from Phase 33.A */}
        {error === "AccessDenied" && (
          <div
            role="alert"
            className="b-stagger-err"
            style={{
              padding: "12px 14px",
              borderRadius: "10px",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              color: "#b91c1c",
              fontSize: "12.5px",
              lineHeight: "1.5",
              marginBottom: "16px",
              textAlign: "left",
            }}
          >
            Your email isn&apos;t on the Zoca team. Contact your manager if this is unexpected.
          </div>
        )}
        {error && error !== "AccessDenied" && (
          <div
            role="alert"
            className="b-stagger-err"
            style={{
              padding: "12px 14px",
              borderRadius: "10px",
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.25)",
              color: "#92400e",
              fontSize: "12.5px",
              lineHeight: "1.5",
              marginBottom: "16px",
              textAlign: "left",
            }}
          >
            Couldn&apos;t sign in: {error}. Try again, or contact your manager.
          </div>
        )}

        {/* Headline */}
        <div
          className="b-headline-fade"
          style={{ fontSize: "15px", fontWeight: 500, color: "#0b051d", marginBottom: "14px" }}
        >
          Sign in to continue
        </div>

        {/* Google button */}
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void signIn("google", { callbackUrl });
          }}
          className="b-btn-pulse"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            width: "100%",
            padding: "12px 16px",
            background: loading ? "#FAF9F6" : "#ffffff",
            border: "1px solid #E5E7EB",
            borderRadius: "10px",
            fontSize: "13.5px",
            fontWeight: 500,
            color: "#0b051d",
            cursor: loading ? "wait" : "pointer",
            transition: "background 0.15s ease",
          }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.background = "#FAF9F6";
          }}
          onMouseLeave={(e) => {
            if (!loading) e.currentTarget.style.background = "#ffffff";
          }}
        >
          <GoogleIcon />
          {loading ? "Redirecting\u2026" : "Continue with Google"}
        </button>

        {/* Bottom note */}
        <div
          className="b-note-fade"
          style={{ marginTop: "16px", fontSize: "10.5px", color: "#9CA3AF" }}
        >
          Only @zoca.ai and @zoca.com accounts can sign in.
        </div>
      </div>

      {/* Footer */}
      <div
        className="b-footer-fade"
        style={{
          position: "absolute",
          bottom: "20px",
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: "9px",
          letterSpacing: "0.3em",
          color: "rgba(11,5,29,0.4)",
          pointerEvents: "none",
        }}
      >
        B E A C O N &middot; H O S T E D &middot; O N &middot; V E R C E L
      </div>
    </div>
  );
}

function Sparkle({
  top,
  bottom,
  left,
  right,
  color,
  size,
  delay = 0,
  rotate = false,
  reverse = false,
}: {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  color: string;
  size: number;
  delay?: number;
  rotate?: boolean;
  reverse?: boolean;
}) {
  const rotationDur = 10 + delay * 2;
  const twinkleDur = 1.8 + delay;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      style={{
        position: "absolute",
        top,
        bottom,
        left,
        right,
        animation: rotate
          ? `b-twinkle ${twinkleDur}s ease-in-out infinite, b-rotate ${rotationDur}s linear infinite ${reverse ? "reverse" : ""}`
          : `b-twinkle-2 ${2 + delay}s ease-in-out infinite`,
      }}
    >
      <path d="M8 0 L9.5 6.5 L16 8 L9.5 9.5 L8 16 L6.5 9.5 L0 8 L6.5 6.5 Z" fill={color} />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.997 10.997 0 0 0 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.1A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.44.35-2.1V7.06H2.18A10.997 10.997 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.16-3.16C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
        fill="#EA4335"
      />
    </svg>
  );
}
