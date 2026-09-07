# Design principles

> One durable file per product (`inception/design/principles.md`), created in the first 2a PR and amended by later ones. A principle exists so a structural decision can cite something sturdier than taste: screen specs reference these by `PRIN-#` in their rationale column. 3–5 principles — a list everyone remembers beats a list that covers everything.

Each principle must be opinionated enough to lose an argument with ("keep it simple" never lost an argument, so it is not a principle), and must cite the insight it comes from. Insights live in [`research/BRD-001-employee-desk-booking.md`](research/BRD-001-employee-desk-booking.md) and are currently `[SYNTHESISED]` — so these five are the best reading of BRD-001, not conclusions from user evidence. Retire or rewrite any principle whose insight fails validation.

## PRIN-1 Answer before asking

- **Statement:** A screen states what is already true before it offers anything to do.
- **In practice:** The employee lands on the bookings they hold, not on a date picker — the most-asked question ("am I in on Thursday?") is answered in zero clicks, and booking is the action beside the answer. The administrator lands on today's bookings, not an empty filter panel. The booking screen arrives with the next bookable working day already selected.
- **Not:** A dashboard of buttons; a screen that shows nothing until you configure it (the pattern Condeco is named for in the competitor scan).
- **From:** INSIGHT-01 (research doc) — checking is higher-frequency than acting.

## PRIN-2 Make the impossible unpickable

- **Statement:** If a rule will refuse a choice, the choice is never offered as though it would work.
- **In practice:** Weekends and dates beyond +30 days are present but non-selectable with the reason stated (BR-001.3, REQ-006). Taken desks and inactive desks are shown as unavailable rather than being clickable and then rejected (BR-001.7). Landing on a date you already hold shows your existing booking and a route to cancel it, not a desk list that will fail on submit (BR-001.1, BR-001.2). A row that cannot be cancelled shows no cancel control (BR-001.6).
- **Not:** A valid-looking control whose only job is to produce an error message. Server-side validation stays — it is the guarantee, not the interface.
- **From:** INSIGHT-03 (research doc) — five distinct refusals, each discoverable before or after the user commits.

## PRIN-3 Every refusal names its cost

- **Statement:** When the system blocks an administrator, it says how many people are affected and what the single route forward is.
- **In practice:** Deactivating a desk with reservations is refused with the count of affected bookings and a link to those bookings, not a generic denial (BR-001.9). Removing the last active administrator is refused with the reason spelled out (BR-001.11). Duplicate desk numbers and duplicate emails name the existing record they collide with (BR-001.8, BR-001.10).
- **Not:** "You can't do that." A refusal with no count, no cause and no next step leaves Marcus holding a broken desk and no way to retire it.
- **From:** INSIGHT-06 (research doc) — administrative refusals are about people, not records.

## PRIN-4 One thumb, 360 pixels, then widen

- **Statement:** The employee path is designed at 360px first and widened; the same layout grows, it is not redrawn.
- **In practice:** Primary actions sit within thumb reach at the bottom on mobile; the whole booking path fits with no horizontal scroll at 360px (NFR-004). Desktop is the mobile layout given more columns and a persistent sidebar — not a different composition. Admin tables become stacked cards below 768px by design, with the same fields in the same order, not by lucky reflow.
- **Not:** A desktop data table that collapses into something nobody specified; a mobile layout treated as a degraded desktop.
- **From:** INSIGHT-02 (research doc) + NFR-004 — a 20-second one-handed job, and 360px is a required test viewport.

## PRIN-5 Say the channel out loud

- **Statement:** Where a notification went is part of the confirmation, and a channel that may not work never looks like one that will.
- **In practice:** Booking and cancellation confirmations name the address the email went to (REQ-023, REQ-024) — email is the promise, because it is unconditional (BR-001.13). The push toggle shows its real browser permission state, and a denied or unsupported browser says plainly that email still arrives (NFR-006). No bell icon, no notification badge, no inbox implying alerts nobody enabled.
- **Not:** A silent success; a push toggle that reads "on" while the browser has denied permission.
- **From:** INSIGHT-07 (research doc) — email always arrives, push may never.

## Success measures

How we would know the design works. Targets without a baseline are `TBD (owner: <human>)` — inventing them is the cardinal sin here too. There is no live product and no analytics, so every baseline below is genuinely unknown.

| Measure                                                                       | Type          | Target                                                                                                                          |
| ----------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Time from sign-in to a confirmed booking, median                              | behavioural   | `TBD (owner: Joy Joshua)` — PRIN-1/PRIN-4 imply under 30s, but committing to a number before one usability session is invention  |
| Visits that end without an action (the "am I booked?" check)                   | behavioural   | No target — this is expected to be the **majority** of visits. Watch it as a signal PRIN-1 is right, not as a number to reduce   |
| Bookings made at ≤ 360px width                                                 | behavioural   | `TBD (owner: Joy Joshua)` — A-3 predicts most; measure it before designing anything else mobile-first                            |
| Cancellations as a share of confirmed bookings                                 | behavioural   | No target — a healthy figure is unknown. A number near zero would suggest cancel is too hard (INSIGHT-04), not that plans never change |
| Employees who enable push, and how many of those the browser then denies       | behavioural   | `TBD (owner: Joy Joshua)` — the denial rate is what tells us whether PRIN-5's honesty is doing its job                            |
| Administrator errors reversed within 5 minutes (a cancel or deactivate undone) | behavioural   | `TBD (owner: Joy Joshua)` — a proxy for whether PRIN-3's refusals arrive in time                                                 |
| "I know I have a desk when I set off" — agreement, post-launch survey          | attitudinal   | `TBD (owner: Joy Joshua)` — needs a baseline survey before launch or it measures nothing                                          |
| Desks booked as a share of active desks on a working day                       | business      | `TBD (owner: Joy Joshua)` — office utilisation, the reason the product exists                                                     |

**One measure we cannot have.** No-show rate — booked desks that went unused — is the metric this category is normally judged on, and BRD-001 has no check-in or attendance concept, so the product cannot see it. Utilisation above therefore counts _reservations_, not _bodies_. Worth knowing before anyone quotes it as occupancy.
