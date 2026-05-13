/**
 * Phase 20 — One-click contact launchers.
 *
 * Pure URL builders used by V2CustomerCard (and potentially other surfaces
 * later) to turn email / phone / HubSpot company references into clickable
 * `mailto:` / `tel:` / `https://app.hubspot.com/...` links.
 *
 * No I/O, no state — these are pure functions of their inputs.
 */

/**
 * Build a mailto: URL pre-filled with a friendly subject + body using the
 * customer's bizname and the AM's name. Falls back to a generic subject if
 * either is missing.
 */
export function buildMailto(
  email: string,
  opts: { bizname?: string; amName?: string } = {},
): string {
  const subject =
    opts.bizname && opts.amName
      ? `${opts.bizname} — quick check-in from ${opts.amName}`
      : "Quick check-in";
  const body =
    opts.bizname && opts.amName
      ? `Hi,\n\nFollowing up on ${opts.bizname}. Wanted to touch base — when's a good time for a quick call?\n\nThanks,\n${opts.amName}`
      : "";
  const qs = new URLSearchParams({ subject, body }).toString();
  return `mailto:${email}?${qs}`;
}

/**
 * Strip whitespace and non-digit characters from a phone number, preserving
 * a leading "+", and return a `tel:` URL.
 */
export function buildTelLink(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return `tel:${cleaned}`;
}

/**
 * Build a HubSpot company-page URL for the given company id. Reads the portal
 * id from `NEXT_PUBLIC_HUBSPOT_PORTAL_ID` at build time; if unset, falls back
 * to a portal-agnostic URL that HubSpot will redirect into the right portal
 * once the user is signed in.
 *
 * TODO: set `NEXT_PUBLIC_HUBSPOT_PORTAL_ID` in `.env.local` / Vercel envs once
 *       Zoca's HubSpot portal id is known so links land on the company page
 *       directly without the auth-redirect bounce.
 */
export function buildHubspotCompanyUrl(companyId: string): string {
  const portal = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID || "";
  if (!portal) {
    if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
      // Dev-only warning so the missing env var is visible while developing.
      // eslint-disable-next-line no-console
      console.warn(
        "[contact-links] NEXT_PUBLIC_HUBSPOT_PORTAL_ID is not set — HubSpot links will use the portal-agnostic fallback URL.",
      );
    }
    return `https://app.hubspot.com/contacts/?id=${companyId}`;
  }
  return `https://app.hubspot.com/contacts/${portal}/company/${companyId}`;
}
