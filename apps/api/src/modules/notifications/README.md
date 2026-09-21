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

## US-031 — the module's first router, and its one write outside `push_subscriptions`

**This module owns `push_subscriptions` outright** (`0007_push_subscriptions.sql`), and
**writes exactly one column of `user_profiles` — `push_opt_in`** — an ADR-004 exception
`app-architecture.md:89` grants in writing (this row's own Owns column names *opt-in*), not a
boundary violation. The alternative — a port `modules/users` exposes that this module calls — is
banned outright: `eslint.config.mjs`'s `MAY_IMPORT.notifications = []` means this module may
import no other module at all. `modules/users/README.md` records the same exception from the
other side. Nothing else in `user_profiles` is read or written from here.

**The write ordering is the one rule that makes AC-07 true, and it is asymmetric on purpose**
(design note §4.2, §4.3): opting in writes the subscription, THEN the flag; opting out writes
the flag, THEN deletes the subscriptions. The flag always moves toward "push enabled" LAST and
toward "push disabled" FIRST — get this backwards and a partial failure produces a toggle that
lies about whether push will actually fire (PRIN-5).

**`infra/webpush` is importable only from this module** (`eslint.config.mjs`'s `WEBPUSH_BAN`,
mirroring `MAILER_BAN` exactly, for the same reason: one send path, or there will eventually be
two). US-031 uses only `getVapidPublicKey()` — sending is US-032's, which extends
`recordAndSend` with a `channel: 'push'` branch rather than writing a second send path, the same
discipline US-030 already followed for the reminder run.

## US-032 — `recordAndSend`'s third arm, and where the fan-out lives

**`recordAndSend` is three paths behind one name, not two.** Email (send-then-record) and the
reminder claim-first path (US-030) are untouched. A `channel: 'push'` input takes a third arm,
`recordAndSendPush`, which reads `push_opt_in` before ever reading `push_subscriptions`
(`findPushRecipients` — the ORDER is what US-032/AC-05 actually rests on), then sends once per
subscription, concurrently, writing one `notification_deliveries` row each. A `subscription_gone`
result (404/410 from `infra/webpush.sendPush`) hard-deletes that one row, by endpoint — the only
reason this module ever deletes a `push_subscriptions` row after US-031's opt-out.

**The push fan-out is internal to `sendBookingConfirmation`/`sendBookingCancellation` — there is
no public `sendBookingPush`, and no router or caller changed.** Each composer awaits its email
first, then fans a push out unconditionally (never gated on the email's outcome) inside a
try/catch that can never let a push failure escape — the composer always returns the **email's**
result, unchanged. This is what makes AC-06 (never for reminders), AC-07 (push is additive) and
AC-10 (owner only) structural rather than four call sites each getting it right independently.

**Push composes its own wording, reusing `domain/cancellation-copy.ts`'s actor-clause decision
but not its rebook invite.** The email and the push are deliberately different strings — the push
is shorter, and nothing approved the rebook invite for a notification body.

**The endpoint is logged, when it must be, only under the field name `endpoint`** — never
`recipient` — so `infra/logger`'s existing redaction (already keyed on `endpoint` since US-031)
catches it. Copying `recordAndSend`'s email failure log line (`recipient: input.recipient`) into
the push arm would leak a capability URL; the push arm's own log calls do not do this.
