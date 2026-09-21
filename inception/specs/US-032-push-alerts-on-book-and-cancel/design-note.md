# US-032 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-032 — Get a push alert when a booking is made or cancelled](../../stories/user-stories/US-032-push-alerts-on-book-and-cancel.md) |
| **Screen**   | None. Push notifications are rendered by the browser (story §UI). The gating control is SCR-004, built by US-031 |
| **Tier**     | Complex — **operational** (the project's first real outbound integration at runtime), **browser** (the service worker, Complex by name), **trust** (US-031's blind-SSRF residual goes live here), **internal contract** (`recordAndSend`'s input becomes a discriminated union; `NotificationsServiceDeps` gains a port). Any one carries it |
| **Author**   | Architect persona (AI draft), 2026-09-21 |
| **Rests on** | ADR-004, ADR-015, and the US-031 design note §8.4, which pre-decided the seam. **No new ADR** — §9 |
| **Designs for** | US-032 only. Nothing here is built for a story that does not exist |

**Advisory.** The human's GitHub review at D2 is the authority. `spec.md`, `impact-analysis.md`,
`implementation-plan.md`, `decisions.md`, `traceability.md` and `change-log.md` stay DEV's.

**The verdict, in one line each:**

- **No new ADR, and that is the honest answer.** ADR-015 already decided the dependency and its
  rejected alternative. Everything else is an extension of a pattern already decided in writing
  (US-031 design note §8.4, `modules/notifications/README.md:46-50`) inside an executable
  contract. §9.
- **No migration.** `notification_channel` already carries `'push'`
  (`0006_notification_deliveries.sql:15`) and `push_subscriptions` was created whole, including
  `last_success_at`, which `0007`'s own comment reserves for this story. §5.
- **The fan-out lives in the two composers, not at the four call sites.** The call-site diff for
  this story is **zero lines**. AC-07 (push never replaces email) becomes "the same function does
  both, in that order"; AC-06 becomes a type; AC-10 becomes "there is no parameter for anybody
  else". Four call sites each gaining a second call is the design that lets a fifth trigger point
  forget. §2.
- **`recordAndSend` gets a third arm, exactly as it already has a second.**
  `notifications.service.ts:122` already dispatches `kind === 'reminder'` to
  `recordAndSendClaimFirst`. A `channel === 'push'` dispatch to `recordAndSendPush` is the same
  shape, honours §8.4 and the module README verbatim, and keeps push's fan-out and hard-delete
  out of the email body. **This is not a second send path.** §3.
- **AC-06 is a compile error, not a runtime check.** The push input's `kind` is
  `'confirmation' | 'cancellation'`. BR-001.16 cannot be forgotten by anyone, ever, and
  `0006:44-47`'s warning about the reminder index is answered structurally rather than by
  convention. §3.2, C3.
- **AC-03 needs no actor identity, and the code cannot supply one anyway.** BR-001.20's own
  sentence is *"Both channels name the **role**, never the individual administrator."*
  `admin.router.ts:610-617` passes `outcome.ownerId` / `outcome.ownerEmail` and never the acting
  admin's identity. `cancellationSource` is the whole input. §4.1.
- **Push reuses `cancellationCopy().actorClause` and drops `includeRebookInvite`.** One source of
  truth for the BR-001.20 decision (`domain/cancellation-copy.ts`), a fresh string for push. The
  rebook invite is US-029's approved *email* copy; nothing approved it for a notification body,
  and it is the part that gets truncated anyway. §4.2.
- **The endpoint must never be logged under the key `recipient`.** `infra/logger`'s `REDACT`
  (`infra/logger/index.ts:16-34`) works by field NAME and holds `endpoint`, `p256dh`, `auth` — not
  `recipient`. `recordAndSend`'s existing failure log writes `recipient: input.recipient`
  (`notifications.service.ts:133`); for push that value **is** the capability URL. Copying that
  line into the push arm writes it to stdout. **blocker**, §6.1, C5.
- **Three library facts, verified against the installed 3.6.7, not remembered.** The default
  `contentEncoding` is `aes128gcm` (`web-push-lib.js:111`) and the `@types/web-push` doc comment
  claiming `'aesgcm'` is **stale** — "correcting" it breaks Chrome. `sendNotification` returns
  `Promise.reject`, never throws synchronously (`web-push-lib.js:338-344`), but rejects with a
  **plain `Error`** on network/timeout and a `WebPushError` only on a non-2xx. And
  `module.exports.setVapidDetails` is the one export that is not `.bind()`-ed
  (`web-push/src/index.js:18-19`). §6.2.
- **Do not call `setVapidDetails` at all.** Pass `options.vapidDetails` per send. It removes
  global mutable state, removes a config-initialisation-order bug, and removes the unbound-export
  question entirely. ADR-015 and `infra/webpush/README.md` both say "adds
  `setVapidDetails`/`sendNotification`" — that wording predates the code and should be corrected,
  not obeyed. §6.2, C13.
- **A constant `tag` on `showNotification` silently breaks AC-09.** Three cascade cancellations
  with one shared tag show as **one** notification. Set no tag. §7.2, C12.

---

## 0. The tiering — confirmed, on four surfaces, and two that are already closed

| Surface | What it is here |
| --- | --- |
| **Operational** | `task-surfaces.md` (Server, Complex): *"a new external integration (mail provider, push service)"*. This is the first one that is **real at runtime**: `infra/mailer`'s only transport is `console`, which `infra/mailer/index.ts:50-57` states never leaves the process. US-032 is the first code in this repository that makes an outbound request to a third party |
| **Browser** | `task-surfaces.md` (Browser, Complex): *"the service worker"*, by name. `apps/ui/public/sw.js:26-32`'s two stubbed handlers gain bodies |
| **Trust** | US-031 §4.4 accepted a **blind-SSRF residual** — a client-supplied URL the server would POST to *"at US-032"*. This is US-032. The control (`pushEndpointSchema`) already exists and needs no change; the residual becomes live here, which is where it should be re-confirmed rather than re-derived |
| **Internal contract** | `recordAndSend`'s input becomes a discriminated union and `NotificationsServiceDeps` gains a `sendPush` port. Not a wire contract — `libs/contracts` is untouched — but it is the seam every notification spec builds against |

**Two surfaces DEV might expect that are already closed.**

- **No migration, and no protected-path change under `supabase/migrations/**`.**
  `notification_channel` is `('email','push')` at `0006_notification_deliveries.sql:15`;
  `push_subscriptions` was created whole at `0007`, `last_success_at` included, with the comment
  *"US-032 stamps this after a successful send."*
- **No config change, and no `.env` key change.** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
  `VAPID_SUBJECT` are already structurally validated at boot (`config/index.ts:63-76`), which was
  US-031 §7's whole purpose. `VAPID_PRIVATE_KEY` is already in `SECRET_KEYS`
  (`config/index.ts:143`). `task-surfaces.md`'s *"any change to `.env` key names"* escalation does
  **not** fire.
- **`eslint.config.mjs` needs no change either.** `WEBPUSH_BAN` is already in place and already
  restated in all three of the places `MAILER_BAN` is (`eslint.config.mjs:62-68`, `:85`, `:172`,
  `:224`). US-032's entire `infra/webpush` consumption is from `modules/notifications`, which
  `moduleBoundaries` exempts at `:84-86`. **A diff in `eslint.config.mjs` in this PR means the
  boundary was worked around rather than respected.**

---

## 1. What this story actually is

| AC | Where it is answered |
| --- | --- |
| **AC-01** push on booking | §2 — `sendBookingConfirmation` fans out after its email. Zero change at `bookings.router.ts:165` |
| **AC-02** push on cancellation | §2 — `sendBookingCancellation` fans out after its email. Zero change at `bookings.router.ts:221`, `admin.router.ts:336`, `admin.router.ts:610` |
| **AC-03** someone else's cancellation names the admin | §4.1, §4.2 — `cancellationCopy(input.cancellationSource).actorClause`, the role only, reused from `domain/` |
| **AC-04** self-cancellation does not | Same call. `cancellation-copy.ts:20` returns `actorClause: ''` for `'owner'`. The two wordings differ because the clause differs; one shared template is what C10 forbids |
| **AC-05** nothing without the flag | §3.3 — `findPushRecipients` reads `push_opt_in` FIRST and returns `[]` without touching `push_subscriptions`. C4 |
| **AC-06** never for reminders | §3.2 — the push input's `kind` excludes `'reminder'`. A compile error, not a branch. C3 |
| **AC-07** additive, never a replacement | §2.2 — email is awaited first and its result is what the composer returns; the push runs afterward and **regardless of whether the email succeeded**. C2 |
| **AC-08** an undeliverable push breaks nothing | §6.3, §3.1 — `infra/webpush` never throws, `recordAndSendPush` never throws, and the composer wraps the fan-out anyway. The four call sites' existing `try/catch` (D-05) is a fourth layer that needs no edit |
| **AC-09** one push per subscription per event | §3.1 — one `sendNotification` and one `notification_deliveries` row per subscription, no retry loop. Plus §7.2: no `tag`, or the cascade *looks* like one push. C8, C12 |
| **AC-10** the owner only | Structural. `BookingCancellationInput.userId` is documented at `notifications.service.ts:86` as *"The booking OWNER's id — always the recipient, never the actor"*, and `admin.router.ts:612` passes `outcome.ownerId`. There is no parameter an admin could arrive through. Production diff empty, test not |

**The one edge case with no code and a required test.** The story's own edge cases say a
deactivated employee still receives the cascade's push alerts. That works with no change:
deactivation does not delete the `user_profiles` row, so `getPushOptIn` still resolves, and it
does not delete `push_subscriptions` rows either (`0007`'s `on delete cascade` never fires
because nothing is deleted). Assert it; do not build for it.

---

## 2. Where the push is triggered — the decision this story turns on

### 2.1 Inside the composers, not at the call sites

`sendBookingConfirmation` and `sendBookingCancellation` each send their email and then fan the
push out. The four call sites do not change.

| Option | Verdict |
| --- | --- |
| **Fan out inside the two composers** (chosen) | **AC-07 is structural** — the same function does email then push, in that order, so a push cannot exist without an email attempt preceding it. **AC-01/AC-02 are structural** — every path that emails also pushes, including any future fifth path. **AC-10 is structural** — the push targets `input.userId`, the id the email already targets, and the input carries no other id. **AC-06 is structural** — `sendReminderEmail` simply has no fan-out. Call-site diff: **zero lines** |
| A second call at each of the four call sites | Four copies of the same `try/catch`; a fifth trigger point can forget it; AC-07's ordering guarantee becomes a convention across four files; and `composition.ts:88` plus four spec files' `Pick<NotificationsService, …>` lists all grow a seventh method name. **Rejected** |
| Fan out inside `recordAndSend`'s shared body | Would push reminders (`recordAndSend` is also the reminder entry point at `:122`), so AC-06 would need a `kind !== 'reminder'` guard — a guard that can be deleted. **Rejected**, and §3.2 is the better answer to the same problem |

**Concretely, this is what "zero call-site diff" buys.** These five files each enumerate exactly
six `NotificationsService` method names and would all have to change if `sendBookingPush` were
public: `composition.ts:88`, `bookings.routes.spec.ts:100`, `admin.routes.spec.ts:274`,
`reminders.routes.spec.ts:47`, `notifications.routes.spec.ts:60`. Keeping the fan-out internal
leaves all five untouched, which is a smaller blast radius *and* a stronger argument at review.

**This does not contradict US-031 §8.4.** That section says US-032 *"adds `sendBookingPush`,
composing its wording inside this module"*. It does. `sendBookingPush` is an internal function of
`notifications.service.ts` that the two composers call; §8.4 never said the routers call it.

### 2.2 Email first, push second, and the push runs either way

```
sendBookingCancellation(input):
  1. const mail = await recordAndSend({ channel: 'email', ... })   // unchanged, byte for byte
  2. try { await sendBookingPush(input) } catch (e) { logger.error(...) }   // never rethrows
  3. return mail                                                    // the EMAIL's result, unchanged
```

Three rules, each of which is an acceptance criterion:

- **Step 1 before step 2.** If the push ran first and its repository read threw, the email would
  never be sent — AC-07 breached, on the channel BR-001.13 calls the reliable one.
- **Step 2 runs regardless of step 1's outcome.** `if (mail.ok)` around the push is the tempting
  wrong branch: AC-07 says push never *replaces* email, not that push is *conditional* on email.
  An employee whose email bounced is the one who most needs the push.
- **Step 3 returns the email's `RecordAndSendResult`, unchanged.** Every existing US-028/US-029
  assertion (`notifications.service.spec.ts:437-632`) keeps passing without edit, and AC-08's
  *"the booking or cancellation is unaffected"* holds at the type level, not by inspection.

**Latency, named rather than discovered.** Step 2 is awaited inside the request. A deactivation
cascade of three bookings for an employee with two browsers is six outbound HTTPS round trips
added to one `POST /users/:id/deactivate`. `app-architecture.md` §6 already rejected a queue at
this size, so the alternative is not "queue it" but "fire and forget", which loses the delivery
row's testability and risks an unhandled rejection. Await it, bound it with an explicit `timeout`
(C15), and confirm the residual — open item 5.

---

## 3. The send path — a third arm, not a second function

### 3.1 The shape

`recordAndSend` keeps its name and its position as the one entry point, and dispatches on the
input's discriminant exactly as `notifications.service.ts:122` already dispatches on `kind`:

```ts
type SendNotificationInput =
  | (SendEmailInput  & { channel: 'email' })
  | SendPushInput;                          // §3.2

async function recordAndSend(input: SendNotificationInput): Promise<RecordAndSendResult> {
  if (input.channel === 'push') return recordAndSendPush(input);
  if (input.kind === 'reminder') return recordAndSendClaimFirst(input);
  // ... the existing send-then-record body, unchanged
}
```

`recordAndSendPush`, per subscription returned by `findPushRecipients`:

```
for each subscription, concurrently:
  result = await sendPush(subscription, payload)        // never throws — §6.3
  insertDelivery({ channel: 'push', kind, bookingId, userId,
                   recipient: subscription.endpoint,
                   outcome, errorDetail })              // §6.1 — the row, then the delete
  if result.reason === 'subscription_gone' → deletePushSubscriptionByEndpoint(endpoint)
  if result.ok                             → markPushSubscriptionDelivered(endpoint)
```

- **One `sendNotification` and one `notification_deliveries` row per subscription per event**
  (AC-09, `db-design.md` §1.5's *"the address/endpoint used"*). No retry loop — a retry would
  produce two rows and possibly two notifications for one event.
- **Concurrent across subscriptions, awaited as a whole.** The fan-out is one or two browsers in
  practice; sequential is slower for nothing, and `Promise.all` over a never-throwing result type
  cannot reject.
- **`recordAndSendPush` returns a `RecordAndSendResult` that the composer discards.** It exists so
  the function's contract matches its siblings, not because anybody reads it.

### 3.2 AC-06 is a type, not a branch

```ts
interface SendPushInput {
  channel: 'push';
  /** BR-001.16, US-032/AC-06. `'reminder'` is DELIBERATELY absent. `0006`'s own comment warns
   *  that the reminder partial-unique index excludes `channel`, so a push reminder would
   *  invalidate its guarantee — this type is what makes that unreachable rather than merely
   *  agreed. Widening it is the change that must not be made without revisiting that index. */
  kind: 'confirmation' | 'cancellation';
  bookingId: string;
  userId: string;
  title: string;
  body: string;
}
```

Nothing at runtime checks this and nothing needs to. `sendReminderEmail` has no fan-out, so the
type is belt to that braces — and it is the belt a future reader will find.

### 3.3 `findPushRecipients` — flag first, and the order is the proof

```ts
/** US-032/AC-05, V-14, BR-001.15. `db-design.md:185` — "Both are checked before sending: flag
 *  first, then subscriptions." The ORDER is the acceptance criterion: a function that reads the
 *  subscriptions and then filters by the flag passes every positive test and fails AC-05's
 *  actual claim, which is that the flag alone decides. */
findPushRecipients(userId: string): Promise<PushRecipient[]>
  1. if (!await getPushOptIn(userId)) return [];      // push_subscriptions is NOT touched
  2. return listPushSubscriptions(userId);
```

`getPushOptIn` already exists (`notifications.repository.ts:122-131`) with the explicit column
list ADR-004's cross-module `SELECT` allowance requires. `listPushSubscriptions` is new and reads
`endpoint, p256dh, auth` for one `user_id`.

**The test AC-05 actually needs** is that the fake repository's `listPushSubscriptions` is
**never called** when the flag is false — not merely that zero pushes were sent. A
subscriptions-first implementation passes the weaker assertion.

---

## 4. The wording

### 4.1 What the push needs, and what it does not

BRD-001 BR-001.20, as amended on 2026-09-14 (open question 14):

> *"**both** the browser push notification (REQ-027) **and** the cancellation email (REQ-024) must
> state that the office admin cancelled it ... Both channels name the **role**, never the
> individual administrator."*

So AC-03 needs `cancellationSource` and nothing else. The actor's identity is not required, and
is not even reachable: `admin.router.ts:610-617` hands `notifications` the owner's id and email
and never the acting admin's. That is correct and must stay so — a change that starts threading
the admin's identity into `notifications` is a change to a settled business rule.

### 4.2 Reuse the decision, compose the string

```ts
const { actorClause } = cancellationCopy(input.cancellationSource);   // ' by your office admin' | ''
// `includeRebookInvite` is deliberately NOT destructured — §4.3.
const dateLabel = formatShortDate(input.date);                        // "Tue 9 Sep"

title: `Desk booking cancelled`
body:  `Your desk ${input.deskNumber} for ${dateLabel} was cancelled${actorClause}.`
```

- **The BR-001.20 decision is reused; the sentence is not.** `cancellationCopy` is `domain/`'s
  rule (its own docblock says so) and having two copies of "does this name an admin?" is the bug
  BR-001.20 exists to prevent. Reading `sendBookingCancellation`'s assembled *email* body and
  reusing it is the opposite mistake: it drags the rebook invite and the email's register into a
  notification.
- **`formatShortDate` for both push messages.** It yields `Tue 9 Sep`
  (`format-display-date.ts:13-31`), which is the shape AC-03's own illustration uses. Note that
  the confirmation **email** interpolates the raw ISO date (`notifications.service.ts:224-225`) —
  that is US-028's approved behaviour and **must not change in this PR**. `OfficeDate` is
  `z.infer` of a plain string schema (`booking-window.ts:29-33`), unbranded, so
  `formatShortDate(input.date)` typechecks against `BookingConfirmationInput.date: string` with no
  interface edit.
- **AC-03's example string is illustrative, not approved copy.** It reads *"Your desk for Tue 9
  Sep was cancelled by your office admin."* — with no desk number, while AC-02 requires the push to
  name *"the desk and the date"*. It is US-029's email sentence with the desk elided to isolate the
  actor clause. Open item 3 asks the human to confirm that reading before QA asserts on a literal.

### 4.3 What push does not carry

- **No rebook invite.** `includeRebookInvite` is US-029 email copy, and the 2026-09-14 decision
  that created it is scoped to the email's cascade variant. Nothing approved it for push, it is
  the first thing an OS truncates, and adding it is speculative generality.
- **No action buttons and no deep link.** The story's edge cases say so outright.
- **Length is a UX matter, not a correctness one.** There is no RFC limit that these strings come
  near — `web-push` encrypts to `aes128gcm` with a 4 KB-class payload ceiling and these are under
  120 bytes. What is real is OS truncation at roughly one line of title and two of body, which is
  why the desk and date lead the body and the actor clause trails it.

---

## 5. Persistence — nothing new, and the PR should say so

| Fact | Evidence |
| --- | --- |
| `channel` already accepts `'push'` | `0006_notification_deliveries.sql:15` |
| `push_subscriptions` exists whole, `last_success_at` included | `0007_push_subscriptions.sql`; its comment reserves the column for this story |
| The full endpoint in `notification_deliveries.recipient` is intended | `db-design.md` §1.5 — *"the address/endpoint used"*; the table is RLS deny-all and server-only. US-031 §4.5 distinguishes this from logging it |
| The reminder partial-unique index still holds | `0006:44-47` warns a push reminder would invalidate it. C3 makes a push reminder a compile error, so the guarantee is now stronger than when that comment was written. **Put this sentence in the PR** so the next reader does not re-derive it |
| Hard delete on `404`/`410` | `db-design.md` §1.4 — *"the only ones in the schema that are hard-deleted"*. Decided at Gate 1; this story implements it |

Three new repository methods, all on the existing `NotificationsRepository`:
`listPushSubscriptions(userId)`, `deletePushSubscriptionByEndpoint(endpoint)`,
`markPushSubscriptionDelivered(endpoint)`.

**A diff under `supabase/migrations/**` in this PR means something was assumed rather than
checked.**

---

## 6. `infra/webpush` — the port

### 6.1 The redaction trap. **blocker**

`infra/logger`'s `REDACT` (`infra/logger/index.ts:16-34`) holds `endpoint`, `p256dh`, `auth` — and
matches **by field name**, lowercased with `-`/`_` stripped (`:36`). It does **not** hold
`recipient`.

`recordAndSend`'s existing failure log writes `recipient: input.recipient`
(`notifications.service.ts:129-134`). In the push arm, `recipient` *is* the endpoint: a capability
URL that lets anyone holding it push to that browser. Copying that log line into
`recordAndSendPush` writes it to stdout, where a log aggregator keeps it.

**In the push arm, log the endpoint under the field name `endpoint` (so the existing redactor
catches it) or not at all.** Never under `recipient`, never inside a spread of the subscription
row, and never as part of a raw error object.

### 6.2 Calling `web-push` — three facts verified against the installed 3.6.7

| Fact | Evidence | Consequence |
| --- | --- | --- |
| Default `contentEncoding` is **`aes128gcm`** | `node_modules/web-push/src/web-push-lib.js:111` | **Pass no `contentEncoding`.** The `@types/web-push` `RequestOptions` doc comment says *"'aesgcm', by default"* — it is **stale**. Setting `'aesgcm'` on a reviewer's reading of that comment breaks Chrome, and no unit test would catch it. C14 |
| `sendNotification` never throws synchronously | `web-push-lib.js:338-344` returns `Promise.reject(err)` | `await` inside `try/catch` is sufficient. But it rejects with a **plain `Error`** on network error and socket timeout (`:401-404`, `:395-398`) and with `WebPushError` only on a non-2xx (`:376-383`). The mapper must handle both shapes |
| `setVapidDetails` is the one export not `.bind()`-ed | `web-push/src/index.js:18-19` (`sendNotification` is bound; `setVapidDetails` is not) | **Do not use it.** `options.vapidDetails` is a per-call `RequestOptions` field (`@types/web-push`, verified) and passing it avoids global mutable state, avoids a config-init-order bug, and makes each send self-describing. ADR-015's *"adds `setVapidDetails`/`sendNotification`"* and `infra/webpush/README.md:9` both predate the code; correct the README in this PR rather than obey it. C13, C23 |

Import form: `import { sendNotification, WebPushError } from 'web-push';`. `@types/web-push` uses
ESM-style `export function` / `export class` with no `export =`, so a default import will not
typecheck; `web-push`'s `module.exports` is a plain object literal, which Node's
cjs-module-lexer resolves into named exports. `WebPushError` must be a **value** import for
`instanceof`, which `verbatimModuleSyntax: true` (`tsconfig.base.json`) makes explicit.
**Typechecking is not proof that it resolves at runtime** — open item 6.

### 6.3 The result type — never-throwing, closed set

Shaped on `infra/mailer`'s `SendMailResult` (`infra/mailer/index.ts:41-43`), as ADR-015 requires:

```ts
export type PushFailureReason =
  | 'subscription_gone'      // 404 / 410 — the ONLY reason that deletes a row (db-design.md §1.4)
  | 'push_rejected'          // any other 4xx
  | 'push_unreachable'       // 5xx, DNS/TLS failure, socket timeout
  | 'push_unknown';          // anything the mapper does not recognise

export type SendPushResult = { ok: true } | { ok: false; error: PushFailureReason };
```

**Why a closed set, in the words `infra/mailer` already uses** (`infra/mailer/index.ts:33-39`):
the logger redacts by field name, so a credential — or here, a push service's response body —
hiding inside a free-text reason passes straight through it and into
`notification_deliveries.error_detail`. `WebPushError` carries `.body` (the raw response text),
`.headers` and `.endpoint` (`web-push-error.js:6-11`). **None of the three may leave this
module**, and `notifications.service.ts:60-62`'s `safeFailureReason` guard is the precedent for
enforcing that at runtime rather than trusting the type.

`TTL` and `timeout` are passed explicitly (C15). The library's default TTL is four weeks
(`web-push-lib.js:13`) — a cancellation alert arriving four weeks after the desk's date is a
defect shape, not a feature.

---

## 7. The service worker

### 7.1 The payload contract

The server sends `JSON.stringify({ title, body })`; `sw.js` parses it. **Not in
`libs/contracts`**: `apps/ui/public/sw.js` is served unbundled and cannot import anything
(`sw.js:11-12`, US-031 §8.3), so a shared type would be enforceable on exactly one side while
making a protected-path change. Document the shape in a comment on both ends instead, and say why.

### 7.2 The handler

```js
self.addEventListener('push', (event) => {
  let title = 'Desk booking update';
  let body = 'Open the app to see the change.';
  try {
    const data = event.data ? event.data.json() : undefined;
    if (data && typeof data.title === 'string') title = data.title;
    if (data && typeof data.body === 'string') body = data.body;
  } catch { /* fall through to the generic copy below */ }

  event.waitUntil(self.registration.showNotification(title, { body }));
});
```

- **`event.waitUntil` is mandatory.** Without it the browser may terminate the worker before the
  notification is shown, which presents as push that works locally and silently fails in the field.
- **Something is always shown.** `userVisibleOnly: true` was promised at subscribe time
  (`sw.js:22-25`); a handler that throws or shows nothing makes Chrome display its own *"This site
  has been updated in the background"*, which reads as a product defect, and repeated offences can
  cost the subscription.
- **No `tag`.** A constant tag coalesces notifications, so a three-booking cascade renders as
  **one** — AC-09's *"a cascade cancelling three bookings sends three"* would be true on the wire
  and false on the screen. No `renotify` either (it requires `tag`). C12.
- **`notificationclick`**: `event.notification.close()`, then focus an existing client or
  `clients.openWindow('/')`. That is the conventional minimum for a notification the story says is
  *"not required to deep-link"*; open item 4 confirms it is not inventing a rule.

---

## 8. Testing seam

`NotificationsServiceDeps` (`notifications.service.ts:30-33`) gains a third port:

```ts
export interface NotificationsServiceDeps {
  deliveries: NotificationsRepository;
  send: (message: MailMessage) => ReturnType<typeof sendMail>;
  sendPush: (subscription: PushRecipient, payload: string) => Promise<SendPushResult>;   // NEW
}
```

`createNotificationsService` stays the seam (`:330-336`'s own note). **No spec imports
`infra/webpush`**, exactly as no spec imports `infra/mailer`. The real wiring at `:333-336` gains
one line.

QA's highest-value assertions, from the story's own QA notes:

1. **AC-03 vs AC-04 from all three sources** — `'owner'`, `'admin'`, `'deactivation_cascade'` —
   asserting the two wordings **differ**, mirroring
   `notifications.service.spec.ts:556-598`'s existing email matrix.
2. **AC-05**: flag false + a valid subscription present ⇒ `listPushSubscriptions` **never called**.
3. **AC-06**: `sendReminderEmail` ⇒ `sendPush` never called, and no `channel: 'push'` row.
4. **AC-07**: opted-in employee ⇒ both a `channel: 'email'` and a `channel: 'push'` row; and the
   email still sent when `sendPush` fails.
5. **AC-08**: `sendPush` returning `subscription_gone` ⇒ the composer still resolves `{ ok: true }`,
   the failed row is written, and the subscription row is deleted.
6. **AC-09**: two subscriptions ⇒ two sends and two rows for one event; three bookings in a
   cascade ⇒ three per subscription.
7. **AC-10**: the admin-cancel path pushes to `outcome.ownerId`'s subscriptions and never the
   admin's.

---

## 9. No new ADR — and why that is the honest answer, not the convenient one

`ai/roles/architect.md`'s bar is *"a real trade-off with a rejected alternative"*, and executable
contracts carry ordinary decisions without ceremony. Against the five candidates:

- **The dependency — ADR-015, already accepted.** Its Consequences section already predicts this
  story: *"US-032 composes its wording in `modules/notifications` and calls one narrow port"*, and
  *"`404`/`410` arrive as a typed error, so `db-design.md:188`'s hard-delete rule is a `switch`"*.
  Nothing here amends it. The one correction needed is editorial: its follow-up wording implies
  `setVapidDetails`, and §6.2 recommends the per-call form. That is a README line, not an ADR
  amendment, because the **decision** ADR-015 records is *which library*, not *which call form*.
- **Fan-out in the composers vs at the call sites — no ADR.** A real alternative, but not a real
  trade-off: the rejected option has no compensating advantage, only four copies of one `try/catch`
  and five more files in the diff. §2 is its home.
- **Widening `recordAndSend` — no ADR.** `notifications.service.ts:122` set the precedent and the
  module README already instructs it (`:46-50`). Restating an instruction as a decision record is
  ceremony.
- **The `404`/`410` hard delete — no ADR.** Decided at Gate 1, in `db-design.md` §1.4, before any
  code existed.
- **TTL, timeout, urgency — no ADR.** Operational values, not architectural choices. Open items
  1 and 2 put them in front of the human, which is the right weight.

**What would change this answer.** If push needed a queue, a retry schedule, or a dead-letter
path — if AC-08's *"logged rather than surfaced"* were ever traded for *"retried"* — that is a
genuine trade-off against `app-architecture.md` §6's standing rejection of a queue, and it would
be an ADR and a different story. §10 forbids building it here.

---

## 10. Constraints the implementation must satisfy

| # | Constraint | Severity |
| --- | --- | --- |
| C1 | The push fan-out lives **inside** `sendBookingConfirmation` and `sendBookingCancellation`. No call site in `bookings.router.ts`, `admin.router.ts` or `users.service.ts` changes, and `sendBookingPush` is **not** added to `NotificationsService`'s public surface (§2.1) | **blocker** |
| C2 | Inside each composer: the email is awaited **first**, the push runs **second and unconditionally** (never gated on the email's result), the fan-out is wrapped so it cannot throw out, and the composer returns the **email's** `RecordAndSendResult` unchanged (§2.2, AC-07, AC-08) | **blocker** |
| C3 | The push input type's `kind` is `'confirmation' \| 'cancellation'` — `'reminder'` is excluded at the **type** level, not by a runtime guard (§3.2, AC-06, BR-001.16) | **blocker** |
| C4 | `findPushRecipients` reads `push_opt_in` **first** and returns `[]` **without reading `push_subscriptions`** when it is false. The test asserts the subscriptions read never happened (§3.3, AC-05, V-14) | **blocker** |
| C5 | The endpoint never reaches a log line under the field name `recipient`, nor inside a raw `WebPushError` or subscription object. Only the field name `endpoint` is redacted (`infra/logger/index.ts:16-34`) (§6.1) | **blocker** |
| C6 | `infra/webpush` exposes a **never-throwing** result with a **closed** `PushFailureReason` set. `WebPushError.body`, `.headers`, `.endpoint` and any raw network error never leave the module or reach `error_detail` (§6.3) | **blocker** |
| C7 | The push targets `input.userId`'s subscriptions only. No admin id, no second lookup, no parameter that could name another account (§1, AC-10) | **blocker** |
| C8 | Exactly one `sendNotification` and one `notification_deliveries` row per subscription per event — `channel: 'push'`, `recipient` = the endpoint, `bookingId` set. No retry loop (§3.1, AC-09) | **blocker** |
| C9 | `404`/`410` ⇒ write the failed delivery row **first**, then hard-delete that one `push_subscriptions` row **by endpoint**. No other status deletes anything (§3.1, §6.3, `db-design.md` §1.4) | **major** |
| C10 | Push composes its **own** title and body, reusing `cancellationCopy(source).actorClause` and **ignoring** `includeRebookInvite`. The email subjects and bodies are unchanged byte for byte (§4.2, §4.3, AC-03, AC-04) | **major** |
| C11 | `sw.js`'s `push` handler wraps `showNotification` in `event.waitUntil(...)` and always shows something, including when `event.data` is absent or unparseable (§7.2) | **major** |
| C12 | `showNotification` sets **no constant `tag`** and no `renotify` — a shared tag collapses a three-booking cascade into one visible notification (§7.2, AC-09) | **major** |
| C13 | VAPID is passed **per call** as `options.vapidDetails`. `setVapidDetails` is not called anywhere (§6.2) | **major** |
| C14 | `contentEncoding` is **not** passed. The runtime default is `aes128gcm`; `@types/web-push`'s doc comment claiming `'aesgcm'` is stale and must not be acted on (§6.2) | **major** |
| C15 | An explicit `TTL` and `timeout` are passed to `sendNotification` — the library's four-week default TTL is not accepted (§6.2, open items 1–2) | **major** |
| C16 | Subscriptions for one event are sent concurrently and the fan-out as a whole is **awaited**. No un-awaited promise, no queue, no retry (§3.1, §2.2) | **major** |
| C17 | `NotificationsServiceDeps` gains a `sendPush` port; `createNotificationsService` stays the seam and **no spec imports `infra/webpush`** (§8) | **major** |
| C18 | The push payload is `JSON.stringify({ title, body })`, documented on both sides. **Not added to `libs/contracts`** (§7.1) | **major** |
| C19 | `last_success_at` is stamped on a successful send; a failure to stamp is logged and changes nothing else (§3.1, `0007`'s own comment) | **minor** |
| C20 | Both push messages format the date with `formatShortDate` (`Tue 9 Sep`). The confirmation **email**'s raw ISO date is left exactly as it is (§4.2) | **minor** |
| C21 | `notificationclick` closes the notification and focuses an existing window or opens `/`. No action buttons, no deep link (§7.2) | **minor** |
| C22 | **No migration, no `config/**` change, no `eslint.config.mjs` change.** The PR states why each is unnecessary, including why the reminder partial-unique index still holds (§0, §5) | **minor** |
| C23 | `infra/webpush/README.md` records the send surface and the per-call VAPID form (correcting its own `setVapidDetails` line); `modules/notifications/README.md` records the three arms of `recordAndSend` (§6.2, §3.1) | **nit** |

---

## 11. Open items for the human

| # | Item | Owner | Resolution |
| --- | --- | --- | --- |
| 1 | **`TTL` value.** The library default is four weeks (`web-push-lib.js:13`), which would deliver a cancellation alert long after the desk's date. Recommend **86400 s (24 h)** — a fixed conservative value, not computed from the booking date, because computing it is cleverness nobody asked for. Confirm or set another | Joy Joshua | Open |
| 2 | **`timeout` value.** `RequestOptions.timeout` is a socket timeout in ms, undefined by default. Recommend **10000**. Unbounded is what turns one unreachable push service into a slow `POST /api/bookings` | Joy Joshua | Open |
| 3 | **Is AC-03's example string approved copy or an illustration?** It reads *"Your desk for Tue 9 Sep was cancelled by your office admin."* — no desk number, while AC-02 requires the push to name the desk **and** the date. My reading: it is US-029's email sentence with the desk elided to isolate the actor clause, so it is illustrative. Confirm before QA asserts on a literal. §4.2 proposes `Desk booking cancelled` / `Your desk A-12 for Tue 9 Sep was cancelled by your office admin.` | UX / BA | Open |
| 4 | **`notificationclick` behaviour.** The story says the push *"is not required to deep-link"*. Recommend the conventional minimum — close, then focus an existing window or open `/`. Confirm that is not inventing a rule; the alternative is a click that does nothing | Joy Joshua / UX | Open |
| 5 | **Latency residual.** The push fan-out is awaited inside the request, so a three-booking cascade for a two-browser employee adds six outbound round trips to one admin action. `app-architecture.md` §6 already rejected a queue at this size, and a queue would be an ADR and a different story. Confirm the residual is accepted (§2.2) | Joy Joshua | Open |
| 6 | **DEV verification: the `web-push` import actually resolves at runtime.** `apps/api` is `"type": "module"` with `moduleResolution: "bundler"` and `verbatimModuleSyntax: true`; `web-push` is CJS with no `exports` map. Named imports should work via cjs-module-lexer, and `WebPushError` must be a value import for `instanceof`. **Typechecking is not proof.** Paste a real run in the PR | DEV | Open |
| 7 | **The blind-SSRF residual goes live in this story.** US-031 §4.4 accepted it *"at US-032"*; this is US-032. `pushEndpointSchema` needs no change. Re-confirm rather than re-derive | Joy Joshua | Open |

---

## 12. What this story must NOT build

- **No migration.** `channel` already accepts `'push'` (`0006:15`) and `push_subscriptions` is
  complete (`0007`). A diff under `supabase/migrations/**` means something was assumed.
- **No `eslint.config.mjs` change.** `WEBPUSH_BAN` is already in place and already exempts
  `modules/notifications` (`:62-68`, `:84-86`). A diff there means the boundary was worked around.
- **No `config/**` or `.env` change.** All three VAPID values are already structurally validated at
  boot (`config/index.ts:63-76`), which is what US-031 §7 was for.
- **No `libs/contracts` change.** This story adds no route, no request shape and no response shape.
  The push payload is not a wire contract (§7.1).
- **No second send path, and no public `sendBookingPush`.** A third arm inside `recordAndSend`,
  called from the two composers (§2.1, §3.1) — US-034/AC-08 and `modules/notifications/README.md`.
- **No retry, no queue, no dead-letter, no backoff.** AC-08 says *"logged rather than surfaced"*.
  `app-architecture.md` §6 already rejected a queue at this size, and adding one is an ADR and a
  different story.
- **No push for reminders, and no parameter that could enable one** (§3.2, BR-001.16).
- **No `setVapidDetails`, no `contentEncoding`, no `urgency`, no `topic`** (§6.2).
- **No `tag` on `showNotification`** (§7.2).
- **No change to `sendBookingConfirmation`'s or `sendBookingCancellation`'s email subject or
  body**, and no change to `sendReminderEmail` at all. US-028/US-029/US-030's assertions
  (`notifications.service.spec.ts:437-632`) must pass untouched.
- **No change to `cancellation-copy.ts`.** Its output is consumed differently; the rule is unchanged.
  `task-surfaces.md` makes changing an existing `domain/` rule Complex on its own account.
- **No `fetch` handler, no precache, no caching, no web app manifest** in `sw.js`
  (`app-architecture.md` §5.6, US-031 §8.3).
- **No admin-facing anything.** No admin receives a push, and no screen renders one (AC-10).
- **No actor identity threaded into `notifications`.** BR-001.20 names the role, never the person,
  and the call sites structurally cannot supply one (§4.1).
- **No `main.tsx` change and no re-registration of the worker.** US-031 §8.2 already established
  that the installed worker persists and wakes for a `push` event with no page open.
