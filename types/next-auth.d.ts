// Phase 33.B — TypeScript module augmentation for NextAuth (three roles).
//
// Adds `role` and `am_name` to both the Session.user object (consumed by
// useSession() on the client + getServerSession() on the server) and the
// JWT payload (consumed by withAuth middleware to gate admin/manager routes).
//
// Phase 33.B expanded the role union from "admin" | "am" to
// "admin" | "manager" | "am" to support the manager tier (5 emails) that has
// cross-AM access but not admin-exclusive features.

import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: "admin" | "manager" | "am";
      am_name: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "admin" | "manager" | "am";
    am_name?: string | null;
  }
}
