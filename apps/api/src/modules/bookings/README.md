# bookings

## Ownership (ADR-004 — read across, write within)

**Owns (may write):** `bookings`. **Reads:** `desks`, via an explicit column list
(`bookings.repository.ts`'s `listActiveDesks`) — never writes it. Desk inventory writes stay
exclusively in `modules/desks` once US-015/US-017 build it.

## What's here

US-005 needed no endpoint here — the 30-day window and the weekend rule are civil-date
arithmetic once "today" is known, so they live as shared, pure predicates in
`@desk-booking/contracts` (`booking-window.ts`), not behind a route. The one zone-dependent
step, `officeToday`, lives in `../../domain/booking-window.ts` and is called from `modules/auth`
(sign-in/session) and now from here.

**US-006** gives this module its first route and service: `GET /api/bookings/availability?date=`.
It calls `refusalFor(date, officeToday(...))` for its own server-side date check rather than
re-implementing the window or weekend rule — a second window check here is drift, not defence in
depth. `apps/api/src/domain/**` gained nothing from this story: the projection (available/taken)
is a mapping, not a decision, and lives in `bookings.service.ts` (US-006 design note §3.1).

**US-007** (`POST /api/bookings`) is what first writes `bookings`. The table and its two partial
unique indexes were created whole by US-006's migrations (`0003_bookings.sql`) although nothing
exercised them until this story. `insertConfirmedBooking` attempts the write with no preceding
availability check (`app-architecture.md` §4.1 step 4) and maps a unique-violation error to
`desk_conflict`/`user_conflict` by matching the bare index name in the Postgres error's `message`,
never the surrounding sentence (Architect design note §1.2) — gated on `error.code === '23505'`
first, and **throwing** on anything else, because a wrong guess here is worse than a `500`
(design note F-1). `bookings.repository.concurrency.spec.ts` proves this mapping's assumption
against a real Postgres instance, gated on `RUN_BOOKINGS_CONCURRENCY_TEST=1` — see that file's own
docblock to run it.

US-007 also adds `POST /api/bookings/:id/cancel`, deliberately narrow (D-03): one owner-scoped
`UPDATE ... WHERE id = ? AND user_id = ? AND status = 'confirmed'`, one `404 booking_not_found` for
every reason it might not apply. It is **not** US-011's "cancel my own booking" feature — that
story owns the fuller eligibility surface, the cancellation email, and the My-bookings entry point.
This endpoint exists only so SCR-003 ST-10 (US-007/AC-07) has something to call; US-011 is expected
to reuse it rather than build a second one.

`GET /api/bookings/availability` also gained a `myBooking` field (the caller's own confirmed
booking for the date, or `null`) and a `Cache-Control: private, no-store` header, because the
response is no longer identical for every caller (design note §2.3).

**US-008** adds `usualDeskId` to the same `getAvailability` response: the caller's most recently
booked desk id (across all dates and statuses, via the new `findMyLastBookedDeskId` read),
already filtered server-side to eligibility — present only when that desk is also `available` in
`desks[]` for the requested date. The browser does one `===`, never re-derives the rule.

**US-009** adds `nextFreeDays` to the same `getAvailability` response: the next two working days,
inside the booking window, with at least one free desk — populated only when the selected date is
fully booked and the caller holds no booking for it (ST-10 outranks ST-04). Two new range reads,
`listConfirmedDeskIdsInRange`/`listMyConfirmedDatesInRange`, both scoped to `bookings` — **`desks`
is not re-read**, since the active desk list is already in hand from the same call's first read
(Architect design note §1.2). The candidate scan itself (`pickNextFreeDays`) is the module's first
`domain/` function: pure, and where AC-06 (weekends, the window edge, BR-001.1) is provable with no
database. No migration, no new route, no new error code.

**US-010** adds `GET /api/bookings` — the employee's own booking history, upcoming and past. No
new cross-table read: it reuses the `bookings` → `desks(desk_number)` embed
`findMyConfirmedBooking` (US-007) already established, and both new repository methods
(`listMyBookingsInWindow`, `findMyNewestBookingBefore`) are served by
`bookings_user_id_booking_date_idx`, which was already built with this exact read in mind
(`0003_bookings.sql:77`, comment: "REQ-009, REQ-034"). No migration.

Paging is a **date floor**, not `page`/`limit` (that shape is the admin list's, US-013, a
different resource behind a different guard): no `before` reads `[today − 30, ∞)`; `?before=`
anchors on the caller's newest booking strictly before it and reads the 30-day window ending
there. See the story's design note (`inception/specs/US-010-view-my-bookings/design-note.md` §1)
for the full argument against `page`/`limit` and a fixed-row-count cursor.

**Completed is derived here, never stored** — `apps/api/src/domain/booking-history.ts`'s
`bookingDisplayStatus`, applied once per response by `listMyBookings`. This *supersedes*
`inception/architecture/db-design.md` §1.3's plan for a `bookings_with_status` database view,
which turned out not to be expressible: the view's `CASE` needs the office's today, and that is
neither `current_date` (the database server's own zone, not the office's — NFR-001) nor
something a plain SQL view can take as a parameter. **ADR-007** records the supersession — see it
before adding a second implementation of this rule (US-011, US-013 and US-014 all render a
booking's status and must call `bookingDisplayStatus`, never re-derive it).

See `../README.md` for what this module owns and the boundary it must respect.
