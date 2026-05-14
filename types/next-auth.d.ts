// Phase 33.A — TypeScript module augmentation for NextAuth.
//
// Adds `role` and `am_name` to both the Session.user object (consumed by
// useSession() on the client + getServerSession() on the server) and the
// JWT payload (consumed by withAuth middleware to gate admin routes).

import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: "admin" | "am";
      am_name: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "admin" | "am";
    am_name?: string | null;
  }
}
