"use client";

import type { ScoredCustomerV2 } from "@/lib/types";
import { buildHubspotCompanyUrl } from "@/lib/contact-links";

type Props = {
  customer: ScoredCustomerV2;
};

function V2TicketsPanel({ customer }: Props) {
  const open = customer.tickets?.open_tickets_30d ?? 0;
  const unresolved = customer.tickets?.unresolved_issues_last_30_days ?? 0;
  const companyId = customer.hubspot?.hubspot_company_id;
  const ticketsUrl = companyId
    ? `${buildHubspotCompanyUrl(companyId)}/tickets`
    : null;

  return (
    <section
      className="rounded-zoca-lg border border-zoca-border bg-white p-4 md:p-5"
      aria-label="Tickets"
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-zoca-text-2">
          Tickets
        </h3>
        {ticketsUrl && (
          <a
            href={ticketsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-medium text-zoca-pink-cta hover:underline"
            title="Open this company's tickets in HubSpot"
          >
            Open in HubSpot →
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zoca-text-2">
            Open · 30d
          </div>
          <div
            className={`text-[20px] font-semibold tabular-nums ${
              open > 0 ? "text-amber-700" : "text-zoca-text"
            }`}
          >
            {open}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zoca-text-2">
            Unresolved · 30d
          </div>
          <div
            className={`text-[20px] font-semibold tabular-nums ${
              unresolved > 0 ? "text-rose-700" : "text-zoca-text"
            }`}
          >
            {unresolved}
          </div>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-zoca-text-2">
        Ticket detail integration pending — per-ticket title, status, owner will
        ship in a follow-up.
      </div>
    </section>
  );
}

export default V2TicketsPanel;
