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

See `../README.md` for what this module owns and the boundary it must respect.
