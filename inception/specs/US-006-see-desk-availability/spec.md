# US-006 — See desk availability for the chosen date

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-006-see-desk-availability.md`                    |
| **Traces to**     | REQ-007, REQ-017, BR-001.4, BR-001.7                                                |
| **Screen**        | SCR-003 — ST-01, ST-02, ST-05, ST-06 (the availability list; selection, confirm and ST-04/ST-07–ST-12 are US-007's/US-009's) |
| **Covering ADRs** | ADR-001, ADR-002 (exercised, not amended). **New: ADR-004** — table ownership, read across / write within (`knowledge/decisions/ADR-004-table-ownership.md`) |
| **Tier**          | Complex                                                                              |
| **Status**        | approved                                                                             |
| **Updated**       | 2026-09-18                                                                           |

## Problem

Today `apps/ui/src/screens/book-a-desk/BookADesk.tsx` renders only the date controls (US-005); the
`fetchAvailability` seam it declares always resolves to `undefined`, and no route, no table and no
contract exists for asking "which desks are free on this date." The system must instead persist a
desk inventory and its per-date bookings, answer `GET /api/bookings/availability?date=` with every
active desk's number and taken/free state — never who holds it — and render that list grouped by
zone, with loading, empty-office and load-failure states that never shift the date controls out from
under the user.

## Functional requirements

| ID    | Requirement                                                                                                                                 | Priority | Serves | Status      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------- |
| FR-01 | `GET /api/bookings/availability?date=YYYY-MM-DD` returns every **active** desk for that date, each with `id`, `deskNumber` and `status` (`available`/`taken`), ordered by `deskNumber`; the response echoes `date` | Must     | AC-01, AC-02, AC-03, AC-05 | not started |
| FR-02 | A desk with a confirmed booking on the requested date is returned with `status: 'taken'`; every other active desk is `available`             | Must     | AC-03  | not started |
| FR-03 | An inactive desk (`desks.is_active = false`) never appears in the response, as taken or as free, on any date                                  | Must     | AC-04  | not started |
| FR-04 | The `bookings` read that determines taken desks selects `desk_id` only — no occupant column is ever read or returned                          | Must     | AC-06  | not started |
| FR-05 | A well-formed date outside the 30-day window or on a weekend is refused with `422 date_not_bookable`; a malformed or non-calendar date (e.g. `2026-02-30`) is refused with `400 invalid_request` | Must     | (defence — not directly reachable from the current UI) | not started |
| FR-06 | The browser groups the returned desks into zones by the first character of `deskNumber`, in zone-letter order, and within each zone by `deskNumber` ascending | Must     | AC-05  | not started |
| FR-07 | The count line ("*12 of 40 desks free · Wed 9 Sep*") renders before the zone list in DOM order, computed from the response array, never sent by the server | Must     | AC-01  | not started |
| FR-08 | Each desk row shows its number and an **Available**/**Taken** status carrying both an icon and the word, never colour alone                    | Must     | AC-02  | not started |
| FR-09 | While a request is in flight, the count line and every desk row render as skeletons at the real row height (shared CSS custom property with the real row), and the region announces loading once | Must     | AC-07, AC-10 | not started |
| FR-10 | `desks: []` in the response renders a distinct "no desks set up yet" state naming the office admin as owner, offering no alternative dates and no admin link, checked **before** any fully-booked branch a later story adds | Must     | AC-09  | not started |
| FR-11 | A failed or refused load replaces only the region below the date controls with an inline alert naming the selected date and offering **Try again**; the date controls remain interactive throughout | Must     | AC-08  | not started |
| FR-12 | **Try again** re-issues the request for the same date; a request superseded by a later date change (including one that resolves as a failure after the newer one already succeeded) never paints over the current date's state | Must     | AC-08  | not started |
| FR-13 | The count line is one persistent live region (`role="status"`) whose text changes between loading and ready; it announces once per state change, not once per row | Must     | AC-10  | not started |

## Non-functional requirements

| ID     | Requirement                                                                                          | Serves  |
| ------ | ----------------------------------------------------------------------------------------------------- | ------- |
| NFR-01 | Availability/Taken status is never conveyed by colour alone — icon and word together                  | NFR-008 |
| NFR-02 | The endpoint re-derives "today" and the bookable window server-side from `OFFICE_TIMEZONE`; it never trusts a client-supplied notion of today | NFR-001 |

## Technical constraints

- No new `domain/` function (`design-note.md` §3). `refusalFor` and `officeToday`, built by US-005,
  are reused as-is for the date check; a second window check in this story is drift, not defence.
- Both `desks` and `bookings` tables are created **whole**, with every constraint and index from
  `db-design.md` §1.2/§1.3, in this story's migration — not deferred to US-007 — because a table
  created without its constraints becomes a retrofit later (`design-note.md` §1.1).
- The availability read is two explicit-column `SELECT`s (`desks`, `bookings`), never a PostgREST
  embedded resource — the `!inner` filter-direction subtlety silently inverts AC-03 if gotten wrong
  (`design-note.md` §2.8).
- `bookings.repository.ts` may `SELECT` from `desks` (ADR-004) but never write it; desk inventory
  writes stay exclusively in `modules/desks` once US-015/US-017 build it.
- AC-04's `.eq('is_active', true)` predicate is proven by a repository test over a recording fake
  Supabase client (`infra/supabase/index.ts:setSupabaseForTesting`), per the human's decision at D1
  (design note §6, option B) — no new dependency, no CI infrastructure.
- `officeDateSchema` (`libs/contracts/src/booking-window.ts`) gains a real-calendar-date check,
  applied to both requests and responses, per the human's decision at D1 (design note §2.2, option
  "tighten the shared schema").
- No selection, no confirm action, no `Selected` status, no `onSelect` prop on `desk-row` — that
  interaction contract is not knowable before US-007 designs it (`design-note.md` §4.4).
- Desks reach the database for local development via a deliberately-run, non-migration dev seed
  (`supabase/seed/desks.dev.sql`), never a migration and never a `tools/` script holding a production
  credential (`design-note.md` §5). It is deleted when US-017 lands.

## Out of scope

- Selecting a desk, the confirm action, and the two partial unique indexes' concurrency behaviour —
  US-007's `POST /api/bookings`.
- ST-04, the fully-booked recovery state with next-available-day suggestions — US-009 (REQ-035).
- `/book?date=` deep links — SCR-003's Surface line permits them, nothing implements them yet; the
  story that adds one must clamp the date through `refusalFor` first (`design-note.md` §2.7).
- Desk-number validation, normalization or format enforcement on write — US-015/US-017's, on the
  write path. US-006 accepts no desk number as input.
- The `bookings_with_status` derived-status view — not expressible as a plain SQL view as
  `db-design.md` specifies it; left to the story that renders a booking's status label
  (`design-note.md` §1.3).
- Real-Postgres integration tests for the schema's constraints (design note §6, option C) — out of
  scope for this story; becomes mandatory at US-007, where the unique indexes are the entire answer
  to RISK-004.
