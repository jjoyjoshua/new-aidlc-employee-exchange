# bookings

Still empty of its own routes. US-005 needed no endpoint here — the 30-day window and the
weekend rule are civil-date arithmetic once "today" is known, so they live as shared, pure
predicates in `@desk-booking/contracts` (`booking-window.ts`), not behind a route. The one
zone-dependent step, `officeToday`, lives in `../../domain/booking-window.ts` and is called from
`modules/auth` today, because that is where "today" first needed to reach the browser
(`office` on the sign-in and session responses).

US-006 (`GET /api/bookings/availability?date=`) and US-007 (`POST /api/bookings`) are what give
this module its first actual routes and service. Both must call
`refusalFor(date, officeToday(...))` for their own server-side date check rather than
re-implementing the window or weekend rule — US-005 built that function so they would not have
to, and a second window check here is drift, not defence in depth.

See `../README.md` for what this module owns and the boundary it must respect.
