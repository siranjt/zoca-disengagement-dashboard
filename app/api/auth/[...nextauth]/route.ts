import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth-options";

// Phase 33.A.2 — NextAuth route handler.
// Next.js 14 App Router route handlers can ONLY export GET, POST, PUT, etc.
// + a few config exports (runtime, dynamic, maxDuration, revalidate).
// Anything else (including `authOptions`) trips the route type checker.
// So `authOptions` lives in lib/auth-options.ts and is imported here.

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
