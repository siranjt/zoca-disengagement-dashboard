"use client";

// Phase 33.A — Custom sign-in page.
//
// Lives at /auth/signin. NextAuth's signIn("google") kicks off the OAuth
// dance and lands the user back on whatever `callbackUrl` they came from
// (or /v2 by default). If the signIn callback rejects them (non-Zoca
// domain), NextAuth redirects back here with `?error=AccessDenied`.

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { ZocaLogo } from "@/components/v2/ZocaLogo";

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
        minHeight: "100vh",
        background: "var(--zoca-bg-soft, #f7f6fb)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#ffffff",
          border: "1px solid var(--zoca-border, #e6e3ef)",
          borderRadius: "16px",
          padding: "36px 32px",
          boxShadow: "0 12px 32px rgba(11,5,29,0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "24px",
          }}
        >
          <ZocaLogo height={28} color="var(--zoca-text, #0b051d)" />
        </div>

        <h1
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: "var(--zoca-text, #0b051d)",
            textAlign: "center",
            margin: "0 0 8px",
            letterSpacing: "-0.01em",
          }}
        >
          Customer Health
        </h1>
        <p
          style={{
            fontSize: "13px",
            color: "var(--zoca-text-2, #4d4666)",
            textAlign: "center",
            margin: "0 0 28px",
          }}
        >
          Sign in to continue
        </p>

        {error === "AccessDenied" && (
          <div
            role="alert"
            style={{
              padding: "12px 14px",
              borderRadius: "10px",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              color: "#b91c1c",
              fontSize: "12.5px",
              lineHeight: "1.5",
              marginBottom: "20px",
            }}
          >
            Your email isn&apos;t on the Zoca team. Contact your manager if
            this is unexpected.
          </div>
        )}
        {error && error !== "AccessDenied" && (
          <div
            role="alert"
            style={{
              padding: "12px 14px",
              borderRadius: "10px",
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.25)",
              color: "#92400e",
              fontSize: "12.5px",
              lineHeight: "1.5",
              marginBottom: "20px",
            }}
          >
            Couldn&apos;t sign in: {error}. Try again, or contact your manager.
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void signIn("google", { callbackUrl });
          }}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            padding: "12px 16px",
            borderRadius: "10px",
            border: "1px solid var(--zoca-border, #e6e3ef)",
            background: loading ? "var(--zoca-bg-soft, #f7f6fb)" : "#ffffff",
            color: "var(--zoca-text, #0b051d)",
            fontSize: "14px",
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
            transition: "background 0.15s ease",
          }}
          onMouseEnter={(e) => {
            if (!loading)
              e.currentTarget.style.background =
                "var(--zoca-bg-soft, #f7f6fb)";
          }}
          onMouseLeave={(e) => {
            if (!loading) e.currentTarget.style.background = "#ffffff";
          }}
        >
          <GoogleIcon />
          {loading ? "Redirecting…" : "Continue with Google"}
        </button>

        <p
          style={{
            marginTop: "20px",
            fontSize: "11px",
            color: "var(--zoca-text-3, #8a8499)",
            textAlign: "center",
            lineHeight: "1.5",
          }}
        >
          Only @zoca.ai and @zoca.com accounts can sign in.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
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
