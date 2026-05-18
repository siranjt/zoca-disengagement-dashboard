import { redirect } from "next/navigation";

// Phase 33.A.5 — Redirect the root path to /v2.
//
// The old v1 Beacon page (Dashboard component) is preserved
// in the repo but no longer reachable by default. Users sign in via Google
// → middleware confirms domain + role → they land here at "/" → we bounce
// them to /v2 (the AM-view / Manager-view tabbed dashboard we built).
//
// Admins coming from V2Header's "Manager view" tab still land on /v2/manager;
// AMs land on /v2 with the picker hidden + their own book preselected.

export default function RootPage() {
  redirect("/v2");
}
