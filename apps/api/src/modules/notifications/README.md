# notifications

See `../README.md` for what this module owns and the boundary it must respect: called, never
consulted; imports neither `bookings` nor `users`.

US-034 fills the failure-log half: `notificationsRepository.insertDelivery` writes
`notification_deliveries`, and `notifications.service.ts`'s `recordAndSend` is the **one send
path** every message story uses — enforced by `eslint.config.mjs` (only this module may import
`infra/mailer`, US-034/AC-08).

**`recordAndSend` is send-then-record, and that is a documented seam, not a finished
guarantee** (Architect design note §2.3, F-6). It is correct for the confirmation (US-028) and
cancellation (US-029) paths, each caused by a one-time user action — call it once the caller's
own write has already committed (`app-architecture.md` §4.1). The reminder run (US-030,
`app-architecture.md` §4.3) is triggered by a scheduler that retries and needs a **claim before
the send** — most likely inserting the `sent` row first and demoting it to `failed` if the
transport rejects, which is what makes §4.3's "a retry resends only what failed" true.
**US-030 must extend `recordAndSend`, not write a second function** — a second path breaks
AC-08, the criterion this module exists to hold.

**US-028 corrects an earlier framing.** Message wording is composed *inside this module*, not
handed in by the caller — that is what "this module decides ... what the message should say"
(`../README.md`) actually means. `sendBookingConfirmation(input)` takes plain facts (email,
desk number, date) and composes the confirmation's subject/body itself, then calls
`recordAndSend`. `bookings.router.ts` calls `sendBookingConfirmation`, never `recordAndSend`
directly, and never composes text. US-029/US-030 should add their own `send*` functions the
same way, each composing its own wording, rather than receiving pre-written text from `bookings`
or `users`.
