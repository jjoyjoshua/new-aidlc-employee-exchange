# US-014 — Filter all bookings by date, status and desk

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-014-filter-all-bookings.md`                     |
| **Traces to**     | REQ-012, REQ-013, REQ-031, NFR-001, NFR-004                                        |
| **Screen**        | SCR-005 — ST-02, ST-04, ST-06, ST-12. ST-01/ST-03/ST-05 are US-013's and are preserved; ST-07–ST-11 (cancellation) are US-015's and are not touched |
| **Covering ADRs** | ADR-002, ADR-004, ADR-007 (all applied, none amended). **No new ADR** — three consequential doc edits instead (`design-note.md` §8) |
| **Tier**          | Complex                                                                             |
| **Status**        | implemented                                                                         |
| **Updated**       | 2026-09-19                                                                          |

## Problem

`GET /api/admin/bookings` (US-013) returns every booking from today onward with no way to narrow it, and its own schema comment already reserves the seam: *"US-014 adds `from`, `to`, `status` and `deskId` here; this story adds nothing else."* `AllBookings.tsx`'s header comment reserves the same states for this story: *"Filters (ST-04, ST-06, ST-12) are US-014's… neither is built here."* There is also no way to list desks at all — `modules/desks/` is an empty stub — so a desk filter has nothing to populate its dropdown from, including the inactive desks REQ-031's edge case requires to stay findable.

The Architect design note (`design-note.md`, this folder) settles the two questions the story text explicitly hands over (story line 106): *"Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet."* §2–§7 are that settlement. This spec restates it as testable `FR-##`s; it does not re-argue it — the design note is the argument, this is the checklist.

## Functional requirements

| ID    | Requirement                                                                                                                                                                                             | Priority | Serves       | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----------- |
| FR-01 | `allBookingsQuerySchema` (`libs/contracts/src/bookings.ts`) gains four **optional** fields — `from`/`to` (`officeDateSchema`), `status` (`bookingDisplayStatusSchema`, reused — not a new enum), `deskId` (`z.string().uuid()`) — plus a `.refine()` rejecting `from > to` at the edge with `400 invalid_request` (design-note §4.1) | Must | AC-01, AC-02, AC-03 | planned |
| FR-02 | `bookingDisplayStatusSchema`'s docblock is edited from "Response-only" to also name it as the status filter's vocabulary — one enum, not a third one (design-note §4.1, §8)                            | Must | AC-02         | planned |
| FR-03 | `allBookingsResponseSchema` is **not modified**. AC-07's count line is built entirely by the browser from `total`, `today`, and its own filter state (design-note §5)                                  | Must | AC-07         | planned |
| FR-04 | New `libs/contracts/src/desks.ts`: `adminDeskSchema` (`id`, `deskNumber`, `isActive`) and `adminDesksResponseSchema` (`{ desks: [] }`, object not bare array, so a field can be added later additively) — exported from `libs/contracts/src/index.ts` (design-note §3.3) | Must | AC-03, edge case (inactive desk) | planned |
| FR-05 | New pure function `displayStatusPredicate(status, today)` beside (never inside) `bookingDisplayStatus` in `apps/api/src/domain/booking-history.ts`: returns the stored value plus the inclusive `from`/exclusive `before` date bounds each presented status contributes — `confirmed` = `status='confirmed' AND booking_date>=today`; `completed` = `status='confirmed' AND booking_date<today`; `cancelled` = `status='cancelled'`, any date (design-note §6.1) | Must | AC-02         | planned |
| FR-06 | `bookingDisplayStatus` itself is **not edited** in this PR — a diff touching it is a review finding (design-note §6.1)                                                                                  | Must | AC-02         | planned |
| FR-07 | `admin-bookings.repository.ts`'s `listBookingsFromDate` becomes `listBookings(filter, offset, limit)`, taking `{ from, to?, before?, status?, deskId? }` and applying `.gte`/`.lte`/`.lt`/`.eq` independently — Postgres computes the intersection. The `.select()` string, three-key ordering, `{ count: 'exact' }` and `PGRST103` mapping are unchanged (design-note §6.3) | Must | AC-01, AC-02, AC-03, AC-04 | planned |
| FR-08 | `admin-bookings.service.ts` resolves the query into `AdminBookingsFilter`: derives `today` once (unchanged seam), maps a presented `status` via `displayStatusPredicate`, raises `from` to the status predicate's floor via a lexicographic `max` when both are present, and passes the stored `status`/`deskId` through verbatim (design-note §6.3, §4.2) | Must | AC-01, AC-02, AC-03, AC-04 | planned |
| FR-09 | New `apps/api/src/modules/desks/desks.repository.ts`: `.from('desks').select('id, desk_number, is_active').order('desk_number')` — **no** `is_active` filter, the deliberate opposite of `modules/bookings`'s `listActiveDesks` (design-note §3.2, §3.3)                                                                        | Must | AC-03, edge case | planned |
| FR-10 | New `apps/api/src/modules/desks/desks.service.ts` (`createDesksService`): maps repository rows to `adminDeskSchema` — a pure mapping, no clock read (design-note §3.3)                                | Must | AC-03         | planned |
| FR-11 | `admin.router.ts` gains `GET /desks` (new route, inherits the existing `/api/admin` mount's `requireSession`+`requireAdmin` — no new trust surface) and its existing `GET /bookings` handler now parses the four new query fields, `Cache-Control: private, no-store` on both (design-note §3.3, §5) | Must | AC-01–AC-03, edge case | planned |
| FR-12 | `composition.ts` wires a `desksRepository`→`createDesksService`→`createAdminRouter({ bookings, desks })` seam, mirroring the existing `adminBookings?` test seam (design-note §3.2)                    | Must | (all server FRs) | planned |
| FR-13 | New screen-private `apps/ui/src/screens/all-bookings/filters.ts`: `AllBookingsFilters` type, `NO_FILTERS` default, `isFiltered()` (AC-05/AC-06's discriminator), `parseFilters(search)` (malformed → default, never throws), `toQueryString(filters, page)` — one vocabulary shared by the URL and the API call (design-note §7.1)         | Must | AC-05, AC-06, AC-08 | planned |
| FR-14 | `use-all-bookings.ts`'s existing `generationRef` effect gains `filters` in its dependency array: a filter change resets to page 1 and supersedes any in-flight request; `loadMore()` carries the active filter and is dropped if superseded (design-note §7.2)                                                                          | Must | AC-04, AC-09  | planned |
| FR-15 | `fetch-all-bookings.ts`'s fetcher signature becomes `(filters, page, signal)`, building the full query string via `toQueryString` (design-note §7.2)                                                  | Must | AC-01–AC-04   | planned |
| FR-16 | New screen-private `FilterBar.tsx` (date-from, date-to, status `Select`, desk `Select`, **Clear**), `Select.tsx` (a custom listbox, not a native `<select>` — its options popup does not honour the app's dark theme on the platform actually used, `decisions.md` D-07), `DateField.tsx` + `Calendar.tsx` (a custom HTML calendar reusing `DatePicker`'s CSS chrome, requested directly rather than the browser's native `<input type="date">` popup — **not** the shared `DatePicker` component itself, which clamps to the 30-day booking window and would silently cap the filter, `decisions.md` D-08) (design-note §7.3, §7.4) | Must | AC-01, AC-02, AC-03, AC-05 | planned |
| FR-17 | `FilterBar` renders one row at 1280px, two rows at 768px, and collapses behind a **Filters** toggle (`aria-expanded`) at 360px — both the toggle and the panel always in the DOM, CSS-only `display: none` inside the narrow media query (the same device US-013 §6.5 used for its table/card switch) (design-note §7.5) | Must | AC-10          | planned |
| FR-18 | New `fetch-desks.ts` + `use-desks.ts`: `GET /api/admin/desks` fires once on mount, independent of the bookings fetch and **not** wired to `data-refresh.ts`. A desk-list failure disables the desk `Select` with an accessible message; it does not take the screen to ST-05 (design-note §7.6) | Must | AC-03          | planned |
| FR-19 | `AllBookings.tsx`: renders `FilterBar`; `items.length === 0` branches on `isFiltered(filters)` — `false` → US-013's unmodified ST-03 copy, `true` → ST-04's distinct copy with a **Clear filters** action; the count line is rebuilt from `total`, `today`, and filter state via `copy.ts` (design-note §5, §7.1) | Must | AC-06, AC-07   | planned |
| FR-20 | `AllBookings.tsx` reads its initial filters from the screen's own query string on mount via `parseFilters(location.search)` — the receiving half of AC-08. No link is built from US-019's (not-yet-built) blocked-deactivation dialog; that is US-019's own work, against the URL `design-note.md` §2.3 specifies | Must | AC-08          | planned |

## Non-functional requirements

| ID     | Requirement                                                                                                                                   | Serves  |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| NFR-01 | AC-10's three widths use the same CSS-only, `matchMedia`-free mechanism as US-013's table/card switch — no new JS breakpoint pattern introduced (design-note §7.5) | NFR-004 |
| NFR-02 | `desks.repository.spec.ts` extends the existing recording-fake pattern (no mocking library), asserting the **absence** of an `is_active` filter | testing-standards.md |
| NFR-03 | `booking-history.spec.ts` gains a round-trip property test asserting `bookingDisplayStatus` and `displayStatusPredicate` cannot disagree, across an exhaustive small grid (design-note §6.2) | testing-standards.md |
| NFR-04 | No new real-Postgres gated test is required — the `.select()` embed string and PostgREST range behaviour verified in US-013's gated harness are unchanged by this story (design-note §10) | testing-standards.md |

## Technical constraints

- **No migration.** `bookings_desk_id_booking_date_idx` (`0003_bookings.sql:79`) already carries the comment `-- REQ-031, BR-001.9` and was placed by US-006 for exactly this read. A migration in this PR is a review finding (design-note §0).
- **The desk list is its own resource, `GET /api/admin/desks`, read from a new `modules/desks`** — not embedded in the bookings envelope, and not a second desk read bolted onto `modules/bookings`'s existing `listActiveDesks` (which must keep its `is_active` filter for US-006/AC-04) (design-note §3).
- **`allBookingsResponseSchema` does not change.** No `isFiltered`, `hasBookingsAtAll`, or `appliedFilters` field — the ST-03/ST-04 discriminator is browser state (design-note §5, §7.1).
- **The status filter is a compound predicate, not an equality**, for both `confirmed` and `completed` — a naive `.eq('status', 'confirmed')` passes on a seed with no past-dated Confirmed row and fails on real data. `displayStatusPredicate` is the single place this is computed (design-note §6).
- **`bookingDisplayStatus` is not edited** — a new pure function is added beside it (`task-surfaces.md:52-57` — a new rule is Medium, an edited one is Complex) (design-note §6.1).
- **`DatePicker` (shared, `components/date-picker/`) must not be reused.** It clamps to the 30-day forward booking window; this filter must reach back over a year with no ceiling. A `DatePicker` import in this story's diff is a blocker (design-note §7.4).
- **`FilterBar`/`Select`/`DateField` are screen-private** (`screens/all-bookings/`), not added to `components/` — today there is one consumer, and US-016 (the next story) explicitly has no filters (design-note §7.3).
- **The URL is read on mount only, never written back on a filter change.** `page` is never part of the URL. A malformed query parameter falls back to the default rather than producing an error state (design-note §2.2).
- **No new error code.** `invalid_request` covers every new failure mode; `libs/contracts/src/error.ts` is not modified (design-note §4.1).

## Out of scope

- The link *from* US-019's blocked-deactivation dialog into this screen's pre-filtered URL — US-019's own work, once that story exists. This story builds only the receiving end (design-note §2).
- US-016's per-desk `bookedAhead` count on `GET /api/admin/desks` — additive, that story's own AC (design-note §3.3).
- Rewording US-013's ST-03 empty-state copy, even though a floor-at-today default view can technically hide older bookings that exist — kept unchanged pending a UX/PO call (design-note open item 2).
- Cancellation, the action column, and ST-07–ST-11 — US-015.
- A shareable/deep-linkable filtered URL beyond the one-time read-on-mount (design-note §2.2).
