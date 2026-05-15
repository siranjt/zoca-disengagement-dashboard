"use client";

// Phase 33.A → 33.B — Header user menu (avatar dropdown) with three role
// badge variants.
//
// Renders the signed-in user's Google profile photo, name, email, and role
// badge. Clicking the avatar drops a small menu with "Sign out". Uses the
// same outside-click + Escape pattern as AmPickerPill.
//
// Phase 33.B role-badge variants (literal uppercase labels):
//   • admin    → ADMIN   — pink badge   (bg-zoca-pink-cta/18, text-zoca-pink-cta)
//   • manager  → MANAGER — blue badge   (bg-blue-500/18, text-blue-700) [NEW]
//   • am       → AM      — neutral      (bg-zoca-bg-tint, text-zoca-text-2)

import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import type { UserRole } from "@/lib/config";

function initialsFor(name: string | null | undefined): string {
  if (!name) return "ZU";
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function badgeForRole(role: UserRole | null | undefined): {
  label: string;
  bg: string;
  fg: string;
} {
  if (role === "admin") {
    // Pink badge — Zoca pink CTA at 18% bg
    return {
      label: "ADMIN",
      bg: "rgba(255, 79, 168, 0.18)",
      fg: "#ff4fa8",
    };
  }
  if (role === "manager") {
    // Blue badge — new for Phase 33.B
    return {
      label: "MANAGER",
      bg: "rgba(59, 130, 246, 0.18)",
      fg: "#1d4ed8",
    };
  }
  // role === "am" or unknown
  return {
    label: "AM",
    bg: "var(--zoca-bg-tint, rgba(11, 5, 29, 0.06))",
    fg: "var(--zoca-text-2, #4b5563)",
  };
}

export function V2UserMenu() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (status === "loading") {
    return (
      <div
        aria-hidden
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          background: "var(--zoca-bg-soft)",
          border: "1px solid var(--zoca-border)",
        }}
      />
    );
  }

  if (!session?.user) return null;

  const { name, email, image, role, am_name } = session.user;
  const displayName = name || email || "User";
  const badge = badgeForRole(role);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`User menu — signed in as ${displayName}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "4px 10px 4px 4px",
          borderRadius: "999px",
          border: "1px solid var(--zoca-border)",
          background: "#ffffff",
          cursor: "pointer",
          transition: "background 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--zoca-bg-soft)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#ffffff";
        }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            width={24}
            height={24}
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              objectFit: "cover",
              display: "block",
            }}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            aria-hidden
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              background:
                "linear-gradient(135deg, var(--zoca-blue), var(--zoca-pink))",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              fontWeight: 600,
              color: "white",
            }}
          >
            {initialsFor(displayName)}
          </span>
        )}
        <span
          style={{
            fontSize: "10.5px",
            fontWeight: 600,
            color: badge.fg,
            background: badge.bg,
            padding: "2px 7px",
            borderRadius: "999px",
            letterSpacing: "0.04em",
          }}
        >
          {badge.label}
        </span>
        <span style={{ fontSize: "10px", color: "var(--zoca-text-3)" }}>▾</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="User menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            zIndex: 40,
            width: "260px",
            background: "#ffffff",
            border: "1px solid var(--zoca-border)",
            borderRadius: "12px",
            boxShadow: "0 12px 32px rgba(11,5,29,0.12)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "14px 14px 12px",
              borderBottom: "1px solid var(--zoca-border)",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--zoca-text)",
                lineHeight: 1.3,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {displayName}
            </div>
            <div
              style={{
                marginTop: "2px",
                fontSize: "11.5px",
                color: "var(--zoca-text-2)",
                wordBreak: "break-all",
                lineHeight: 1.35,
              }}
            >
              {email || ""}
            </div>
            <div
              style={{
                marginTop: "10px",
                display: "flex",
                gap: "6px",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: "10.5px",
                  fontWeight: 600,
                  color: badge.fg,
                  background: badge.bg,
                  padding: "2px 8px",
                  borderRadius: "999px",
                  letterSpacing: "0.04em",
                }}
              >
                {badge.label}
              </span>
              {am_name && (
                <span
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 500,
                    color: "var(--zoca-text-2)",
                    background: "var(--zoca-bg-soft)",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    border: "1px solid var(--zoca-border)",
                  }}
                >
                  {am_name}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void signOut({ callbackUrl: "/auth/signin" });
            }}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "11px 14px",
              border: "none",
              background: "transparent",
              color: "var(--zoca-text)",
              fontSize: "12.5px",
              cursor: "pointer",
              transition: "background 0.12s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--zoca-bg-soft)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default V2UserMenu;
