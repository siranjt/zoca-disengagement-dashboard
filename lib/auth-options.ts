import { type NextAuthOptions } from "next-auth";
import Google from "next-auth/providers/google";
import { getRoleForEmail } from "./config";
import { resolveAmNameForEmail } from "./auth-mapping";

// Phase 33.A — NextAuth v4 + Google OAuth.
// JWT session strategy (no database adapter). Sessions live in a signed
// JWT cookie; the only server-side state is the in-memory BaseSheet cache
// in lib/auth-mapping.ts.
//
// Domain restriction: only @zoca.ai and @zoca.com emails can sign in.
// Anything else fails the signIn callback and the user is bounced to
// /auth/signin?error=AccessDenied.
//
// Phase 33.A.2 — authOptions moved here (from app/api/auth/[...nextauth]/route.ts)
// because Next.js 14 App Router route handlers can only export GET/POST/etc.
// Exporting `authOptions` from the route file triggers a TypeScript error:
// "authOptions is not a valid Route export field." This file is import-only.

const ALLOWED_DOMAINS = ["zoca.ai", "zoca.com"];

export const authOptions: NextAuthOptions = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      // Force account selection on sign in — avoids "logged in to the wrong
      // Google account" complaints from AMs who have multiple workspaces.
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/auth/signin",
    error:  "/auth/signin",
  },
  callbacks: {
    async signIn({ user }) {
      try {
        const email = (user.email || "").toLowerCase();
        if (!email) {
          console.warn("[auth] signIn rejected: no email on Google profile");
          return false;
        }
        const domain = email.split("@")[1] || "";
        if (!ALLOWED_DOMAINS.includes(domain)) {
          console.warn(`[auth] signIn rejected: domain=${domain} not in ${ALLOWED_DOMAINS.join(",")}`);
          return false;
        }
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[auth] signIn callback threw: ${msg}`);
        return false;
      }
    },
    async jwt({ token, user }) {
      try {
        // `user` is only present on the first call after sign-in. Subsequent
        // calls just refresh the token — keep what's already there.
        if (user) {
          const email = (user.email || "").toLowerCase();
          token.email = email;
          token.role = getRoleForEmail(email);
          token.am_name = await resolveAmNameForEmail(email);
        }
        return token;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[auth] jwt callback threw: ${msg}`);
        // Return token as-is so the session still works (just without enriched fields)
        return token;
      }
    },
    async session({ session, token }) {
      try {
        if (session.user) {
          session.user.role = (token.role as "admin" | "am") || "am";
          session.user.am_name = (token.am_name as string | null) ?? null;
        }
        return session;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[auth] session callback threw: ${msg}`);
        return session;
      }
    },
  },
};
