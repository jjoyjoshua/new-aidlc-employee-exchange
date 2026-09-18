# US-008 — See which desk I booked last

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-008-see-my-last-booked-desk.md`                  |
| **Traces to**     | REQ-034                                                                              |
| **Screen**        | SCR-003 — ST-01 (default) and ST-07 (desk selected). No new state; one label on an existing row |
| **Covering ADRs** | ADR-002 (additive-field discipline), ADR-004 (`bookings` module may read its own table). No new ADR — Architect design note §0: the shape question has one alternative and it loses in two lines; this is the second application of the `myBooking` (US-007) pattern, not a new one |
| **Tier**          | Complex                                                                              |
| **Status**        | approved                                                                             |
| **Updated**       | 2026-09-18                                                                           |

## Problem

`GET /api/bookings/availability` (US-006, extended by US-007) tells an employee what is free today; it says nothing about where they usually sit. The system must surface, alongside that same response, whether the caller's single most-recently-booked desk is present in today's list as **available** — and if so, mark it — so the screen can label that row without the browser guessing at "usual" or re-deriving eligibility itself.

## Functional requirements

| ID    | Requirement                                                                                                                                                          | Priority | Serves       | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----------- |
| FR-01 | `GET /api/bookings/availability`'s response gains an additive `usualDeskId: string \| null` field: the caller's most recently booked desk id, present **only** when that desk is also in `desks[]` with `status: 'available'` for the requested date | Must     | AC-01, AC-05 | not started |
| FR-02 | A new repository read, `findMyLastBookedDeskId(userId)`, returns the desk id of the caller's single most recent booking across **all** dates and **all** statuses (Cancelled counts — product decision, story §Edge cases), or `undefined` if the caller has never booked | Must     | AC-03, AC-04 | not started |
| FR-03 | The read is ordered `booking_date desc, created_at desc`. The second key is load-bearing, not belt-and-braces: cancel-then-rebook (BR-001.2) leaves two rows with the same `booking_date` for the same user, and only `created_at desc` picks the row that replaced the other, not whichever Postgres returns first | Must     | AC-03        | not started |
| FR-04 | The service filters the raw id to eligibility before it reaches the wire: present in `usualDeskId` only if `projected.some(d => d.id === lastDeskId && d.status === 'available')`; otherwise `null`. Covers AC-05's two implementable causes (taken, inactive/absent) in one predicate | Must     | AC-05        | not started |
| FR-05 | `DeskRow` renders the text "your usual desk" on an **available**, non-selected-or-selected row when a new `usual` prop is `true`. Never applies to a `taken` row (§2 of the design note: the response never carries an ineligible id, so this is unreachable, but the component must not assume that) | Must     | AC-01, AC-06 | not started |
| FR-06 | The row's accessible name is **composed**, not left as the bare desk number: desk number, then its availability word, then the hint when present (`"A-01, Available, your usual desk"`) — `aria-label` replaces the name computed from visible contents, so the visible chip text and the visible hint are otherwise invisible to a screen reader (AC-06, NFR-008) | Must     | AC-06        | not started |
| FR-07 | `ZoneGroup` threads a new `usualDeskId` prop straight to each `DeskRow` as `usual={desk.id === usualDeskId}`, mirroring the existing `selectedDeskId` → `selected` plumbing exactly | Must     | AC-01        | not started |
| FR-08 | `BookADesk` passes `availability.data.usualDeskId` to `ZoneGroup`. It is never written into `selectedDeskId`, and the initial `selectedDeskId` state is untouched — the two stay structurally unconnected, not merely uncombined by a condition (AC-02) | Must     | AC-02        | not started |

## Non-functional requirements

| ID     | Requirement                                                                                      | Serves  |
| ------ | -------------------------------------------------------------------------------------------------- | ------- |
| NFR-01 | The label is never conveyed by colour — text only, announced as part of the row's accessible name | NFR-008 |

## Technical constraints

- **No per-row flag on `deskAvailabilitySchema`.** `usualDeskId` is a new top-level field on
  `availabilityResponseSchema`, mirroring `myBooking` (US-007). Embedding a per-desk `isUsual`
  boolean would put a per-caller fact inside a structure that is otherwise a per-date fact about
  the office, true on at most one row out of many (design note §1.2, and US-006 design note §2.4's
  same rule, which `myBooking` already followed once).
- **Eligibility is resolved server-side, once, and never re-opened by the browser.** The response
  never carries an id for a desk that is taken, inactive, or absent from `desks[]`. The client does
  a single `===` and nothing else — the same pattern `myBooking` already established (design note
  §2).
- **No status filter on the history read.** A Cancelled booking counts toward "most recent" (product
  decision, confirmed 2026-09-18, matching the story's own stated default). This makes the
  `created_at desc` tie-break in FR-03 load-bearing, not optional — see the design note §5 for the
  concrete cancel-then-rebook scenario it resolves.
- **The read joins the existing `Promise.all` in `getAvailability`** (`bookings.service.ts:71-75`)
  as a fourth parallel read; it is date-independent, so it costs one more round trip, not added
  latency, and runs only after the `refusalFor` guard, same as the other three.
- **Response stays additive/non-`.strict()`.** `usualDeskId: z.string().uuid().nullable().default(null)`,
  same reasoning `myBooking` already carries in this file for why `.nullable()` and not `.optional()`.
- **AC-05's "renamed" clause is treated as corrected to "or no longer exists"**, per the story's own
  Edge Cases section, which already says the label follows a rename (the booking points at `desk_id`,
  not a name string, so this needs no code). The literal AC-05 reading is not implementable — the
  `bookings` table carries no desk-number snapshot — and would require a schema change nobody
  requested. Filed as a change-request to fix the wording: [issue #37](../../../../issues/37).
  Confirmed with the human 2026-09-18 to proceed on the Edge Cases reading.

## Out of scope

- Any change to `deskAvailabilitySchema` or `desks[]` — untouched, no per-row flag (see Technical
  constraints).
- The booking `status` enum or a stored "completed" state — untouched; this story reads history with
  no status filter.
- A stored favourite-desk preference of any kind — explicitly ruled out by AC-03; there is nothing
  here for an employee or the Admin to maintain.
- Fixing the pre-existing gap where an **available, non-usual** row's accessible name omits the word
  "Available" is *not* separately scoped — FR-06 fixes it as a side effect of composing the name for
  every available row, not only usual ones, because the composition has to exist for that case
  anyway and leaving non-usual rows on the old bare-number name would be an inconsistent accessible
  name within the same radio group.
