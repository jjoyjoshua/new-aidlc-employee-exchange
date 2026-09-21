# US-034 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-034 — Transactional email is configured, not hard-coded, and failures are logged](../../stories/user-stories/US-034-email-configuration-and-failure-logging.md) |
| **Screen**   | none — no UI                                                              |
| **Tier**     | Complex — new table and migration, a new import boundary, a new infra module the three message stories will all depend on |
| **Author**   | Architect persona (AI draft), 2026-09-21                                 |
| **Rests on** | [ADR-001](../../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md), [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md) — **no new ADR** (§0) |

**Advisory.** The human's GitHub review at D2 is the authority. This note exists so the shape is
argued before the code rather than in a review thread. `decisions.md` stays DEV's; nothing here
overwrites D-01–D-04, it accepts, sharpens or disputes them one at a time.

---

## 0. No ADR, and why that is the honest answer

An ADR is warranted when there is a real trade-off with a rejected alternative that the project
will have to live with. This story has none. It is plumbing for an architecture that was already
decided and written down:

- **Dispatch after commit** — `app-architecture.md` §4.1 step 6 (`:166-169`), already restated in
  `apps/api/src/infra/mailer/README.md` before a line of this story was planned.
- **Failures both logged and recorded** — `app-architecture.md` §5.5 (`:325-326`), NFR-005.
- **Configuration read once, process refuses to boot on a bad value** — §5.4 (`:292-296`), which
  cites US-034/AC-04 *by name*. The schema that implements it is already in
  `apps/api/src/config/index.ts:49-51`.
- **The table's exact shape** — `db-design.md` §1.5 (`:190-220`) and §3 (`:266`, `:292-294`).

So every decision with a genuine alternative was made at Gate 1 and is already in an approved
architecture document. D-01–D-04 are the *consequences* of those decisions, correctly derived.
Writing an ADR here would be recording a decision nobody made.

**Where the real decision still lives, and why it is not ours:** the production mail provider is
`TBD (owner: IT)`. That will be a genuine trade-off with rejected alternatives — and it earns an
ADR *at the moment IT names a provider*, not now. D-01 is right that guessing it today would
invent a fact the story explicitly forbids inventing.

This note therefore does four things:

1. Endorses D-01, D-02 and D-04 on the merits, and D-03's *mechanism* (§1, §2, §5).
2. **Disputes D-03's proposed implementation.** As written it disables every import boundary in
   the project. This is the one blocker and it is proven, not suspected (§3).
3. Names one gate failure the plan will hit as written (§6).
4. Names four gaps that are not design disagreements but will bite during implementation
   (§1.2, §2.2, §2.3, §4).

---

## 1. `sendMail` and `MAIL_PROVIDER` against AC-04

### 1.1 The shape is right (D-01 endorsed, and no dependency approval is needed)

A `MailTransport` selected by `config().MAIL_FROM_ADDRESS` / `config().MAIL_PROVIDER`, with
`console` as the only implementation, is correct. Three things make it more than a stopgap:

- The sender is read from config at send time, never captured at module load, so AC-01 holds
  even if a test swaps config through `setConfigForTesting`.
- `console` is a real transport, not a mock: it dispatches through `infra/logger`, which is how
  a developer actually observes mail locally. `spec.md` is right to insist on the distinction.
- **No dependency approval is required, and I would object if one were sought now.**
  `security-standards.md:27` requires Architect + human approval to *add* a dependency; it
  requires nothing to decline to add one. D-01 declines. `task-surfaces.md:42-43` names "a new
  external integration (mail provider, push service)" as Complex — this story reaches that line
  and deliberately stops short of crossing it. The `impact-analysis.md` row that flags this as
  `no*` with the reasoning visible is exactly the right way to record it.

### 1.2 AC-04's "loudly" is weaker than the architecture already promises — F-1, F-3

`app-architecture.md` §5.4 says configuration is validated at startup and **"the process refuses
to start if anything required is missing or malformed (US-034/AC-04)"**. The architecture cites
this AC as a *boot-time* guarantee. FR-02 moves it to first-send:

> A `MAIL_PROVIDER` value with no matching transport throws a clear, named error the first time
> mail is sent.

That is a real weakening, and two concrete failures follow.

**(a) An unimplemented provider boots green.** `config/index.ts:49` validates `MAIL_PROVIDER` as
`nonEmpty('MAIL_PROVIDER')` — any non-blank string passes. An environment set to `sendgrid`
starts, passes health checks, serves traffic, and fails at the first booking. Worse, per §2.1
that throw is caught by `recordAndSend` and never reaches anyone as an exception — it becomes a
`failed` row. So FR-02's "throws" is unobservable through the only path AC-08 permits. The
Step 2 test asserts it in isolation, where it is true, and production never sees it.

**Fix:** make `MAIL_PROVIDER` an enum of the transports that exist.

```ts
// config/index.ts — the value is the set of transports infra/mailer actually implements.
// A provider we have not written is a configuration error, not a runtime surprise
// (app-architecture.md §5.4 — this AC is a boot-time guarantee).
MAIL_PROVIDER: z.enum(['console']),
```

**(b) `console` in production silently drops every email while the log says `sent`.** This is the
sharper half. With `MAIL_PROVIDER=console` in a production environment, `sendMail` resolves
`{ ok: true }`, `recordAndSend` writes `outcome: 'sent'`, and nothing ever leaves the building.
`notification_deliveries` — the table NFR-005 exists to make failures *queryable* — then asserts
a falsehood, and the one place an operator would look to answer "did Dana get told?" says yes.
AC-04's own words are that the problem must be "reported clearly rather than mail being silently
dropped". This is silently dropped mail with a receipt.

**Fix**, using the cross-field pattern `config/index.ts:87-97` already established for
`SESSION_LAST_SEEN_THROTTLE_MINUTES`:

```ts
.superRefine((value, ctx) => {
  // …existing session check…
  if (value.NODE_ENV === 'production' && value.MAIL_PROVIDER === 'console') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MAIL_PROVIDER'],
      message:
        'MAIL_PROVIDER=console writes mail to the log and sends nothing. In production that ' +
        'is silently dropped mail with a `sent` row to match (US-034/AC-04). Set the real ' +
        'provider — TBD (owner: IT), BRD-001 open question #7.',
    });
  }
})
```

Three consequences DEV must own rather than discover:

- **`config/index.ts` is a protected path** (`task-surfaces.md:21-22`). The story is already
  Complex and already has this note, so the tier does not change — but `impact-analysis.md`'s
  "Server boot: low — `config()`'s schema is unchanged" and its "no new env key" line both stop
  being true. Update them in the same commit.
- **`config/index.spec.ts:21` uses `MAIL_PROVIDER: 'postmark'`** in its valid fixture. The enum
  breaks it. That is the change working, not a problem — update the fixture to `'console'` and
  add a negative case.
- **A local `.env` holding `MAIL_PROVIDER=none` will refuse to boot.** `impact-analysis.md`
  already plans to change it to `console`. That is the loud failure AC-04 asks for; say so in the
  PR so it does not read as a regression.

This also hands §6's missing AC-03 test something real to assert.

---

## 2. `recordAndSend` against AC-07

### 2.1 Never-throws as a type-level property (D-02) — endorsed

D-02 is right and the reasoning is better than it claims. A discriminated result makes "a mail
failure cannot roll back a booking" a property of the *signature*, so US-028, US-029 and US-030
cannot each forget the guard in their own way. `insertConfirmedBooking`'s `InsertBookingOutcome`
(`bookings.repository.ts:45-50`) already set this convention in this codebase. Agreed as written.

Endorsed alongside it, because both are easy to erode later and neither is stated as a rule:

- **`recordAndSend` takes no transaction and opens none.** `spec.md`'s technical constraint is
  exactly right and matches §4.1 step 6. Keep it as a plain async call a caller makes *after* its
  own write has landed. A future `recordAndSend(tx, …)` overload would silently reintroduce the
  failure mode §4.1 was written to prevent.
- **No `subject` and no `body` reach the row.** Step 3's insert payload correctly omits them,
  matching `db-design.md:218` ("It holds no message body and no password"). Worth a comment in
  the repository, because "why doesn't the delivery log show what we sent?" is a question someone
  will answer by adding the column.
- **`channel` is derived, not an input.** The table requires it; `recordAndSend`'s input does not
  carry it. That is correct — this function *is* the email path — so hardcode `'email'` in the
  service with a one-line comment, rather than widening the input for a push channel that
  `infra/webpush` and US-031/032 will own separately.

### 2.2 "Never throws" must not become "never reports" — F-4

FR-06 says `recordAndSend` never throws. The plan does not say what happens when
**`insertDelivery` itself fails** — a `23505`, a dropped connection, Supabase unavailable. Under
a blanket catch there are two outcomes, and both lose data:

- Mail sent, row insert fails → a delivered email with no record. NFR-02 says failures must be
  queryable; this makes a *success* unqueryable, which is the weaker loss but still breaks
  reconciliation.
- **Mail failed and the row insert fails → the failure disappears entirely.** AC-05 says *every*
  failed send is logged. This is precisely the case where it would not be, and it is not exotic:
  the conditions that break an outbound HTTP call to a mail provider are correlated with the ones
  that break an outbound call to Supabase.

**Fix.** Keep "never throws"; add "never silent". Wrap `insertDelivery` in its own `try`, and on
failure emit a `logger.error` carrying the full context the row would have carried, plus the
insert error. Reflect it in the result so a caller or a future monitor can distinguish the cases:

```ts
export type RecordAndSendResult =
  | { ok: true; recorded: boolean }
  | { ok: false; error: string; recorded: boolean };
```

`recorded: false` is the "we know something happened and we could not write it down" signal. The
log line is then the last resort AC-05 actually needs, and it is one that cannot itself fail.

Add a test: `insertDelivery` rejects **and** the transport rejects → still resolves, and an
`error` line carrying kind / bookingId / recipient / reason was written.

### 2.3 Send-then-record forecloses the reminder's idempotency — F-6

This is the finding most likely to be discovered by US-030 rather than by review, and it is why
the note is worth writing before the code.

`app-architecture.md` §4.3 (`:202-204`) says of the reminder run:

> Each send is recorded in `notification_deliveries`, and the partial unique index on sent
> reminders means a second run for the same booking **inserts nothing and sends nothing**.

`recordAndSend` as planned is **send → record**. On a second run it sends the email, *then* the
index rejects the row. "Inserts nothing" holds. **"Sends nothing" does not** — the duplicate
reminder is already in the employee's inbox. A unique index can prevent a row; it cannot recall
an email. And per §2.2 the rejected insert is currently swallowed, so the duplicate send leaves
no trace at all.

D-04 is right that the index must exist now (§5). The gap is that the *function* has no seam for
the claim the index is meant to arbitrate.

**This is not US-034's to implement** — there is no reminder caller until US-030, and building
the claim now would be the speculative generality my charter forbids. But US-030 then faces a
choice between restructuring this function and writing its own path, and the second of those
breaks AC-08, the criterion this whole story exists to establish.

**Fix — write the seam down, do not build it.** Two lines in `spec.md`'s technical constraints
and in `modules/notifications/README.md`:

> `recordAndSend` is send-then-record. That is correct for the confirmation (US-028) and
> cancellation (US-029) paths, which are caused by a user action that happens once. The reminder
> run (US-030, `app-architecture.md` §4.3) is triggered by a scheduler that retries, and needs a
> **claim before the send** — most likely inserting the `sent` row first and demoting it to
> `failed` if the transport rejects, which is what makes §4.3's "a retry resends only what
> failed" true. **US-030 extends this function; it does not write a second one (AC-08).**

That costs nothing now and prevents US-030 from reasonably concluding that the shared path does
not fit it.

A related detail for whoever writes US-030: once reminder rows exist, a `23505` on the partial
index is an **expected outcome**, not an error. §2.2's `try` around `insertDelivery` must not
flatten it into the generic failure path.

---

## 3. The import boundary (D-03) — right mechanism, and the implementation is a blocker

### 3.1 The mechanism is correct

D-03 is right that AC-08 needs enforcement in tooling rather than in review. `eslint.config.mjs`
already carries this project's architecture as `no-restricted-imports` rules, `task-surfaces.md:29-30`
names that explicitly, and a second mail path is exactly the drift a review comment misses.

### 3.2 The block as specified disables every import boundary in the project — F-2 (blocker)

Step 5 proposes:

> Add a `no-restricted-imports` block scoped to `apps/**/*.ts`, ignoring
> `apps/api/src/modules/notifications/**`, forbidding `**/infra/mailer/**`.

`eslint.config.mjs` warns against this in its own comments, twice — at `:83-86` ("flat config
REPLACES a rule rather than merging it") and at `:133-136`, where the Boundary 4 block restates
the `@supabase/supabase-js` ban specifically because "omitting the restatement would silently
delete that ban for apps/ui — the exact hole ADR-001 exists to close, and the most important
boundary in the project."

A new block over `apps/**/*.ts` is last, so it wins, so it replaces `no-restricted-imports`
wherever it matches. Tracing it against the real config's resolution order: every boundary that
comes after Boundary 1 and before this new block — the browser-boundary block, the module
boundaries — would have its `no-restricted-imports` silently deleted for every file the new block
also matches, including `apps/api/src/http/app.ts` (ADR-001), `apps/ui/src/lib/api-client.ts`
(ADR-001 in the bundle, ADR-002), and every `modules/*` cross-import guard. `npm run lint` stays
green throughout, because a deleted rule and a satisfied rule look identical to the tool.

**Fix: amend the blocks that already own the rule; do not add a broad new one.** Hoist the
ADR-001 path entry into a shared constant, add a `MAILER_BAN` pattern, and:

- **Boundary 1** (`apps/**/*.ts`) — keep its `paths`, add `patterns: [MAILER_BAN]`. Covers
  `http/`, `domain/`, `infra/`.
- **`moduleBoundaries`** — each generated block restates `paths: [SUPABASE_CLIENT_BAN]` and adds
  `MAILER_BAN` to its patterns, **except `notifications`**, which gets the supabase ban and no
  mailer ban. The replace semantics that cause the bug deliver the exemption for free: the
  notifications block is later and simply omits the pattern, so no separate ignore is needed.
- **Boundary 4** (`apps/ui/**`) — add `MAILER_BAN` to its existing patterns.
- Leave Boundary 5 (`libs/contracts/**`) and the `supabase-client.ts` override untouched.

### 3.3 The same mechanism has already failed once, unnoticed — F-7

The `moduleBoundaries` blocks (`eslint.config.mjs:25-46`) set `no-restricted-imports` using only
each module's `forbidden` sibling list — they never restate Boundary 1's `@supabase/supabase-js`
ban. Because flat config replaces rather than merges, **all five module directories can already
import `@supabase/supabase-js` directly and open their own service-role client**. ADR-001's lint
enforcement does not currently cover the five directories most likely to violate it.

This is **pre-existing and not US-034's fault** — but §3.2's fix touches those exact blocks and
closes it in the same change, which is why it belongs in this note. Recommendation: fix it here
and say so in the PR description. If the human prefers it separate, it needs a `bug` issue of its
own; what it must not do is stay unrecorded.

### 3.4 Is the lint rule sufficient alone for AC-08? No — F-8

Two limits worth stating in `modules/notifications/README.md`:

- **It constrains importing the module, not sending mail.** Nothing stops a future service from
  calling a provider's REST API with `fetch` and never touching `infra/mailer`. That is a review
  and design-note concern; no rule catches it. Say so, so the rule is not mistaken for a
  guarantee it cannot give.
- **The plan's verification cannot detect what it broke.** Step 5 verifies by a deliberate
  violation from `modules/bookings`, reverted, plus a clean `npm run lint`. Both would have
  passed with the blocker in §3.2 in place. **A deleted rule looks exactly like a satisfied one.**

  Add a permanent assertion instead of a one-off manual check — a spec that calls
  `new ESLint().calculateConfigForFile(...)` for one representative file per boundary and asserts
  each expected ban is still present. That is the regression test for a protected path whose whole
  value is that it never silently weakens, and it is roughly thirty lines. It would also have
  caught §3.3 when it was introduced.

---

## 4. Redaction: the existing mechanism does not cover this path — F-5

Step 4 plans:

> the log line from a failed send contains no password/API-key field, verified through
> `infra/logger`'s existing redaction (AC-06)

**`infra/logger`'s redaction cannot do this job, and the test as described would pass while
proving nothing.** `logger/index.ts:31-41` redacts by **field name**: `shouldRedact` matches a
key against a fixed list, then `redact` replaces that key's value. It never inspects a string's
*contents*.

The failure reason is free text from a transport. A field named `reason` or `error` holding
`"401 Unauthorized: key sk-live-abc123 rejected"` is a key that matches nothing in `REDACT` and a
value that is never examined. It passes straight through — into the log line, and via
`error_detail` into `notification_deliveries`, where `db-design.md:218` promises the table holds
no password.

A test that asserts "no field named `password` appears" will pass on a log line that contains a
live credential. It tests the logger, which already works, rather than this path, which is the
one AC-06 is about.

**Fix — bound what can be said, rather than filtering what was said.** Map the transport failure
to a short, controlled description at the `infra/mailer` boundary, before it becomes a `reason`:

- a stable code and a bounded message (`{ ok: false, error: 'transport_rejected' }`, plus a
  length-capped detail drawn from a known-safe field such as an HTTP status),
- never the raw error object, never a response body, never anything carrying request headers,
- the same sanitized string is what reaches both `logger.error` and `error_detail`.

This is the same rule `api-standards.md:31-33` already applies at the HTTP boundary — errors leak
nothing, no Postgres messages, no internals — applied one layer in.

**Fix the test to match.** Induce a failure whose reason string *contains* a credential-shaped
token, then assert it appears in **neither** the log line **nor** the recorded row's
`error_detail`. The plan's current AC-06 test only inspects the log; the row is persistent
storage and is the half `db-design.md:218` and RISK-005 actually promise.

Related, and cheap — F-10. Step 2 has the `console` transport log `to`/`subject` and **not the
body**. That is correct and load-bearing: the console transport writes to the same stdout a log
aggregator collects, so a body is persistent-log content. Put the reason in a comment, because
"the console transport doesn't show the message" reads as a bug to the next developer, and the
fix they would reach for puts every email body into the aggregator permanently.

---

## 5. The migration against `db-design.md` §1.5 / §3 (D-04) — endorsed, with a checklist

D-04 is right, and for the precedent it cites. `0003_bookings.sql:6-10` made exactly this
argument for `bookings` and it holds identically here: the reminder partial-unique index *is*
REQ-025's answer, and adding it in US-030 would retrofit it onto rows never constrained by it.
Create the table whole.

Pin these against the spec while writing it, since there is no migration test harness and manual
review is the only gate:

- **Enums** exactly as `db-design.md:209-210`: `notification_channel` `('email','push')`,
  `notification_kind` `('confirmation','cancellation','reminder')`, `delivery_outcome`
  `('sent','failed')`. Declare enums before the table, matching `0003_bookings.sql:16-22`.
- **Columns and nullability** exactly as `:196-207`, including `attempted_at timestamptz not null
  default now()` — Step 3's insert payload correctly omits it, so the default is the only thing
  that satisfies AC-05's "when".
- **`id uuid primary key default gen_random_uuid()`** — `db-design.md:252` says the database
  generates it; `0003_bookings.sql:25` is the form.
- **FKs `on delete restrict`** for both `booking_id` and `user_id` — `db-design.md:292-294` names
  `notification_deliveries.*` explicitly. The plan has this right.
- **The partial unique index** exactly as `db-design.md:266`:
  `(booking_id, kind) where kind = 'reminder' and outcome = 'sent'`.
- **RLS `enable` + `force`**, matching `0003_bookings.sql:81-82`, with no policies. Combined with
  ADR-001's service-role client, that is what makes the table server-only. The plan has this right.

Two properties of the index worth a comment in the migration rather than a change — both follow
from the approved design, and a future reader will otherwise read them as oversights:

- **`channel` is not in the index.** A reminder sent on two channels would collide. It cannot
  happen: BR-001.16 and `app-architecture.md:200-201` make the reminder email-only. Say so, so
  that whoever adds a push reminder sees the constraint they are walking into.
- **`booking_id` is nullable and NULLs are distinct in a unique index.** A reminder row with a
  null `booking_id` would not be constrained. It cannot happen — a reminder is always about a
  booking — but the index's guarantee rests on that, and it is not written down anywhere.

---

## 6. AC-03 has no test anywhere in the package, and the gate will fail — F-2 (blocker)

`AC-03` does not appear in `spec.md`'s FR table, `implementation-plan.md`, or `traceability.md`.
Verified: a grep for `AC-03` across the whole spec package returns nothing.

`spec.md`'s Problem section reasons that "AC-01–AC-04's *configuration* half is already true"
because `config/index.ts` validates the keys and `.env.example` ships them blank. That is a fair
description of reality, but the manifest does not accept reasoning — it accepts a passing,
AC-citing test. `knowledge/traceability/manifest.json`'s `US-034.acs` already lists all eight ACs
with `tests: []`, and `tools/aidlc-check.mjs` errors on any AC with no active test citing it. As
planned, Step 6's own verify line (`node tools/aidlc-check.mjs — expected: passes`) will not.

**Fix.** AC-03 is genuinely testable, and §1.2's config change gives it teeth. One spec asserting:

- `.env.example` ships `MAIL_PROVIDER`, `MAIL_API_KEY` and `MAIL_FROM_ADDRESS` with no value, and
- no source file under `apps/api/src` contains a literal `@`-address or provider hostname —
  which is also what the story's own QA notes ask for (`US-034`, QA notes, first bullet), and
  which is the only assertion that keeps proving AC-01 after a future provider lands.

Name it `... (US-034/AC-03)` and add the file to `manifest.json`'s `US-034.tests[]` in Step 6.

**F-11, related and one line:** `.env.example:27-29` leaves the values blank. Blank satisfies
AC-03's "absent"; it does not satisfy "and says so". A comment naming
`TBD (owner: IT) — BRD-001 open question #7, required before go-live` makes the placeholder
*clearly* a placeholder, which is what AC-03 asks for, and gives the test above something
positive to assert rather than only an absence.

---

## 7. Findings

Rated per `ai/quality/review-checklist.md`.

| # | Rating | Where | Finding | Fix |
| - | ------ | ----- | ------- | --- |
| F-1 | **blocker** | `eslint.config.mjs` (plan Step 5) | The proposed `apps/**/*.ts` block replaces `no-restricted-imports` everywhere it matches, disabling ADR-001 in `http/` **and in the browser bundle**, ADR-002's `apps/ui → apps/api` ban, and all five module boundaries. Lint stays green throughout, because a deleted rule and a satisfied rule look identical to the tool | Amend the blocks that already own the rule; do not add a broad one. Restate the ADR-001 `paths` entry in each, add `MAILER_BAN` to all but `notifications` (§3.2) |
| F-2 | **blocker** | package-wide / `manifest.json` | AC-03 has no test anywhere; `aidlc-check` errors on the delivery branch and Step 6's verify line fails | Add a spec asserting `.env.example` ships the `MAIL_*` keys blank and no literal address exists in source, cited `(US-034/AC-03)` (§6) |
| F-3 | major | `config/index.ts` (plan Step 2) | `MAIL_PROVIDER=console` in production resolves `{ok:true}` and writes `sent` rows while nothing is sent — silently dropped mail with a receipt, in the table NFR-005 exists for. An unimplemented provider also boots green, contradicting `app-architecture.md` §5.4 | `z.enum(['console'])`, plus a `superRefine` refusing `console` under `NODE_ENV=production` (§1.2) |
| F-4 | major | `notifications.service.ts` (plan Step 4) | An `insertDelivery` failure is swallowed by FR-06's never-throws rule. When transport and database fail together — correlated failures — a failed send vanishes entirely, breaking AC-05 in its most important case | Keep "never throws", add "never silent": own `try`, `logger.error` with full context, `recorded: boolean` in the result (§2.2) |
| F-5 | major | `infra/mailer`, `notifications.service.ts` | `infra/logger` redacts by **field name**; the failure reason is free text. A credential inside a `reason` string reaches both the log and `error_detail`. The planned AC-06 test asserts the wrong mechanism and would pass regardless | Sanitize to a bounded, code-based string at the mailer boundary; test with a credential-shaped token and assert its absence from the log **and** the row (§4) |
| F-6 | major | `notifications.service.ts` / `spec.md` | `recordAndSend` is send-then-record, so `app-architecture.md` §4.3's "a second run inserts nothing **and sends nothing**" cannot hold — the index prevents the row, not the email. US-030 must then restructure this function or write a second path, breaking AC-08 | Do not build the claim now. Write the seam down in `spec.md` and the module README: US-030 extends this function and needs a claim before the send (§2.3) |
| F-7 | major (pre-existing) | `eslint.config.mjs` `moduleBoundaries` | All five module directories can already import `@supabase/supabase-js` and open their own service-role client — the `moduleBoundaries` blocks replace Boundary 1 without restating it. Not caused by this story | F-1's fix closes it in the same line. Fix here and say so in the PR, or file a `bug` issue — but record it (§3.3) |
| F-8 | minor | plan Step 5 verify | A deliberate violation plus a clean `npm run lint` cannot detect a *deleted* rule — both would have passed with F-1 in place | Add a spec asserting `calculateConfigForFile` still yields each expected ban, one representative file per boundary (§3.4) |
| F-9 | minor | `0006_notification_deliveries.sql` | Details not pinned by the plan: `gen_random_uuid()` default, `attempted_at` default, enum declaration order, and two index properties (`channel` absent; nullable `booking_id` with distinct NULLs) that read as oversights | Follow the §5 checklist; comment the two index properties with the rule that makes them safe |
| F-10 | minor | `infra/mailer/index.ts` | The `console` transport correctly logs `to`/`subject` and not the body — but nothing says why, and stdout is collected persistently | One comment citing RISK-005, so the next developer does not "fix" it by adding the body |
| F-11 | nit | `.env.example:27-29` | Blank values satisfy AC-03's "absent" but not "and says so" | Add `# TBD (owner: IT) — BRD-001 open question #7, required before go-live` |
| F-12 | nit | `notifications.service.ts` | `channel` is required by the table and absent from `recordAndSend`'s input | Hardcode `'email'` with a comment — this function is the mail path; push is `infra/webpush`'s (US-031/032) |

**Verdict: proceed-with-changes.**

F-1 and F-2 must be resolved **before the PR opens**, not in a D2 thread. F-1 would ship a
security regression disguised as a security improvement, and it is the kind a reviewer cannot
catch by reading the diff — the added lines look correct; the damage is in what they replace.
F-2 fails the gate outright.

F-3 through F-6 should land in the implementation. Each is small, each closes an AC that the plan
currently only appears to close, and F-6 costs two sentences of documentation rather than code.

**Nothing here requires re-approving the plan at D1.** F-3 changes `config/index.ts`, which is a
protected path and not in the plan's file list — DEV should add it to Step 2, note the
`impact-analysis.md` rows it invalidates, and flag the addition in the PR description so the human
sees at D2 that a protected path entered scope after their `go`.

---

## 8. What I did not touch

- **`app-architecture.md` §4.1, §5.4, §5.5 and `db-design.md` §1.5, §3** — implemented as written,
  not revised. §1.2 and §2.3 argue the *plan* diverges from them, not that they are wrong.
- **D-01, D-02, D-04** — endorsed on the merits (§1.1, §2.1, §5), not merely deferred to.
- **D-03** — its decision stands and is right. §3 disputes the implementation shape only.
- **The `TBD (owner: IT)` provider** — not mine to name, and §0 says when it earns its ADR.
- **Retries, dead-lettering, alerting** — named out of scope by the story's own Edge cases. F-6 is
  about *idempotency*, which `task-surfaces.md:75` and `:82-83` treat as a separate, load-bearing
  property of a job, not about adding a retry policy.
- **The Gate D1 approval** — this note is a persona obligation between D1 and D2, not a second
  gate (`ai/gates/delivery.md:37`).
