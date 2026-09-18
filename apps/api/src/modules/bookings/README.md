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
exercised them until this story — see that migration's own comments for why.

See `../README.md` for what this module owns and the boundary it must respect.
