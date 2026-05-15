# What we track when you use this dashboard

Short version: enough to answer "who's actually using this tool", and nothing else.

## What we record

Every time you do something meaningful in the dashboard — sign in, open a customer, mark someone as contacted, switch your view, refresh — we save a row with:

- **Your work email** (e.g. `you@zoca.com`)
- **Your role** (AM, Manager, or Admin)
- **Your AM book** if you're an AM
- **What you did** (the event name, like `customer_opened` or `mark_contacted`)
- **Where you did it** (which page or API route)
- **When** (timestamp)
- **The customer it was about**, if relevant (just the internal entity ID — never the business name or any personal data)

That's it. The full schema is in `docs/usage-tracking.md` if you want to see it.

## What we don't record

- **Note content.** Anything you type into a customer's private notes stays private. We never log the text, just that a save happened.
- **Customer names or details.** We store the internal entity ID, never the business name, owner name, phone, or any other customer info.
- **Your IP address, browser, or location.** None of it.
- **What you type into search boxes.** Filter values are recorded (e.g. "you filtered by YELLOW"), but free-text search queries are not.

## Who can see it

- **Admins only** — via the `/admin/usage` page. Currently that's 2 people.
- **Anyone with database access** — same 2-3 people who have always had Neon access.

Managers can't see another manager's activity. AMs can't see anyone's activity, including their own. The data is for operational ops only (e.g. "are managers actually using the 1:1 prep mode" or "is anyone reporting bugs on a page no one ever visits").

## Why we record it

Three reasons:

1. **To know if the tool is worth the build effort.** If only 3 of 22 people open it weekly, that's important to learn — quickly, so we can fix what's keeping the other 19 away.
2. **To find friction.** If half the team opens a customer card and then leaves without taking action, the card is missing something. The data tells us where.
3. **To find broken things.** If sign-ins start failing or one endpoint suddenly spikes, the log catches it before someone reports it.

We don't use this data for performance reviews, comparisons between AMs, or any kind of evaluation. The goal is to make the tool better, not measure people.

## How long it sticks around

Currently: forever (we haven't built a retention policy yet).
Plan: prune to 180 days once the table gets big enough to matter.

## Questions / opt-out

If you'd rather not have your activity tracked, talk to **Siranj (siranjith.t@zoca.com)** or **Success (success@zoca.com)**. The simplest way to stop being logged is to stop using the dashboard, but if you want a softer answer (e.g. "log only sign-ins, not clicks") we can do that on a per-account basis.

Last updated: May 2026
