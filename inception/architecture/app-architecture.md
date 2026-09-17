# Application architecture — BRD-001 Employee Desk Booking

> Gate 1 architecture deliverable. Advisory and non-blocking: no story, screen or gate waits on it.
> Approval = the human reviewing + merging this document's PR.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Author**   | Architect persona (AI draft) with Joy Joshua                                 |
| **Sources**  | `inception/product/requirements/BRD-001-employee-desk-booking.md` (approved) |
| **Pairs with** | [`db-design.md`](./db-design.md)                                           |
| **Rests on** | [ADR-001](../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md) |

---

## 0. The stack, and what is already decided

| Layer    | Choice                      | Decided by                  |
| -------- | --------------------------- | --------------------------- |
| Browser  | React                       | Joy Joshua, 2026-09-14      |
| Server   | Node.js + Express           | Joy Joshua, 2026-09-14      |
| Auth     | Supabase Auth               | Joy Joshua, 2026-09-14      |
| Database | Supabase Postgres           | Joy Joshua, 2026-09-14      |
| Hosting  | **Not yet chosen** — the design stays neutral (§4.3) | — |

**This is not the stack the repository's standards describe.** `ai/standards/` still
specifies NestJS, Angular, TypeORM and an Nx workspace, and `tools/aidlc-check.mjs` looks
for product code at `apps/api`, `apps/ui` and `libs/graph-engine`. Nothing here fails
because of that — the check degrades to a warning when those paths are absent — but the
coding, API, security and testing standards do not describe this system, and the check that
proves product code is testable will silently do nothing. Rewriting them is a DevOps/team
task, listed in §7.

### One decision recorded separately

Everything in this document assumes the browser never talks to Supabase for data. That is a
real trade-off with a real alternative, so it is written up properly in
[ADR-001](../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md) rather than
asserted here.

---

## 1. Shape

```
┌────────────────────────────────────────────────────────────────┐
│  React app (browser)                                           │
│  · screens SCR-001…SCR-010     · service worker (Web Push)     │
│  · holds the Supabase session, sends it as a bearer token      │
└───────────────────────────┬────────────────────────────────────┘
                            │  HTTPS, JSON, /api/*
┌───────────────────────────▼────────────────────────────────────┐
│  Express server — every business rule lives here               │
│                                                                │
│  http/        routing, validation, error shape                 │
│  modules/     auth · users · desks · bookings · notifications  │
│  domain/      the rules, as plain functions with no I/O        │
│  infra/       supabase · mailer · webpush · clock · logger     │
└───────────────────────────┬────────────────────────────────────┘
                            │  service-role key (server only)
┌───────────────────────────▼────────────────────────────────────┐
│  Supabase — Postgres (5 tables, RLS deny-all) + Auth           │
└────────────────────────────────────────────────────────────────┘
```

The browser holds a Supabase session and sends its access token to Express. Express verifies
it, loads the profile, and does the work. The browser's Supabase client is used for exactly
one thing: refreshing the token. It is constructed with the anon key and never reads a table.

**Credential submission goes to `POST /api/auth/sign-in`, not to Supabase Auth**
([ADR-003](../../knowledge/decisions/ADR-003-express-mediated-sign-in.md), 2026-09-17). Express
verifies the password server-side and applies `user_profiles.is_active` before any token
reaches the browser. Supabase Auth has no concept of that column, so a browser signing in
directly would receive a real session for a deactivated account and discover the refusal one
round-trip later — which US-001/AC-04 forbids.

---

## 2. Modules

One module per business capability. Each owns its routes, its request/response shapes, and
the service that does the work.

| Module          | Owns                                                                                             | Serves                                                |
| --------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `auth`          | Sign-in, sign-out, session verification, the forced password change, the `must_change_password` gate | REQ-002, REQ-003, REQ-029, NFR-009, BR-001.17         |
| `users`         | Account CRUD, role, activate/deactivate and its cascade, admin password reset, search             | REQ-004, REQ-005, REQ-018–022, REQ-030, REQ-032, REQ-033 |
| `desks`         | Desk inventory, number validation and normalization, activate/deactivate and its block            | REQ-015–017, BR-001.4, BR-001.8, BR-001.9, BR-001.19  |
| `bookings`      | Booking, cancellation, the two list views and their filters, availability for a date              | REQ-006–014, REQ-028, REQ-031, REQ-034, REQ-035       |
| `notifications` | Email and push composition and dispatch, opt-in, subscriptions, the reminder run, the delivery log | REQ-023–027, NFR-005, NFR-006, NFR-007, BR-001.13–16, BR-001.20 |

**`users` owns the deactivation cascade, not `bookings`.** BR-001.18 makes cancelling the
leaver's desks part of deactivating the account — one act, one transaction, refusable as a
whole. Splitting it across two modules would make it two acts that can half-succeed, which
is the exact failure RISK-011 describes.

**`notifications` is called, never consulted.** No other module asks whether somebody is
opted in or what the message should say; it hands over a booking and an event, and
`notifications` decides. That keeps BR-001.15 (opt-in), BR-001.16 (no push for reminders)
and BR-001.20 (name the actor) in one file each rather than scattered across the callers.

### `domain/` — the rules, without the plumbing

The rules that are pure decisions live as plain functions with no database and no I/O:

- Is this date bookable? (REQ-006's 30-day window, BR-001.3's weekday rule, in office time)
- Is this desk number valid, and what is its normalized form? (BR-001.4, BR-001.8)
- Is this booking cancellable by this person right now? (BR-001.6)
- Does this password satisfy V-12, and V-18 for a generated one? (REQ-033)
- What should this notification say? (BR-001.20)
- Which status does this booking read as today? (BR-001.5, REQ-028)

They take their inputs as arguments — including today's date — so every edge case in the
acceptance criteria is a unit test with no database and no clock mocking. This is the layer
QA's AC-named tests should mostly land on.

---

## 3. Boundaries

What may import what. The first three are the ones worth enforcing in tooling, not just
agreeing to:

| Rule                                                                                      | Why                                                                                 | Enforced by            |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------- |
| Only `infra/supabase` may construct a Supabase client or read the service-role key        | ADR-001 is worthless if any module can open its own connection; also keeps the key in one file | lint rule + review     |
| `domain/` imports nothing from `modules/`, `infra/` or `express`                          | keeps the rules testable and stops I/O leaking into decisions                        | lint rule (`no-restricted-imports`) |
| No module imports another module's service; they go through `domain/` or a declared port  | stops the dependency web that makes a module impossible to change alone              | lint rule + review     |
| `notifications` is imported by `bookings` and `users`; it imports neither                 | notifications are an effect of the work, never a participant in it                   | review                 |
| Route handlers never contain a rule — they validate, delegate, and shape the response     | the rules must be findable in one place                                              | review                 |

The service-role key is the sharpest of these. It bypasses every Row Level Security policy
in the project. It belongs to the server process, is never sent to the browser, never
appears in a log line, and is read in exactly one module.

---

## 4. The flows that matter

Three paths carry the weight. Everything else is a variation on one of them.

### 4.1 Booking a desk — the concurrency one

REQ-008, BR-001.1, V-04, RISK-004.

1. Middleware verifies the bearer token with Supabase, loads the profile, and rejects if the
   account is inactive (REQ-005), the session's last use is over 30 days old (NFR-009), or
   `must_change_password` is set and this is not the password-change route (BR-001.17).
2. The request is validated: a date and a desk id, nothing else.
3. `domain/` decides whether the date is bookable at all — inside the 30-day window and a
   weekday, both computed in the office timezone (NFR-001).
4. A single `INSERT` is attempted. **No availability check precedes it.**
5. Postgres either accepts it, or rejects it against one of the two partial unique indexes.
   The server maps the violated index to the right answer: the desk index means somebody
   else took that desk (`409`), the user index means this employee already holds a desk that
   day (`409`, BR-001.1's wording).
6. On success, and only after the transaction has committed, `notifications` is handed the
   booking: confirmation email always (BR-001.13), push if opted in (BR-001.15).

**Step 4 is the design decision.** Checking availability first and then inserting is the
obvious shape and it is wrong: between the check and the insert, another request can take
the desk, and no amount of application code closes that window. Letting the unique index
decide means the database — the only thing that sees both requests — is the one that
arbitrates. The "is it free?" query still exists, but it serves the availability screen
(REQ-007), not the booking decision.

**Step 6 is also deliberate.** Sending inside the transaction means a mail outage rolls back
a perfectly good booking, and a transaction that later rolls back can still have sent a real
email. Dispatch after commit; a failed send is logged (NFR-005) and does not undo the
booking the employee can already see.

### 4.2 Deactivating a user — the cascade one

REQ-020, REQ-030, BR-001.18, BR-001.11, RISK-011.

This runs in two phases because SCR-008 requires the admin to see what they are about to do:

- **Preview.** Given the account, return its confirmed bookings dated today or later, in
  full, with the count. Changes nothing. This is what the confirmation dialog renders, and
  BR-001.18 makes showing it mandatory rather than advisory.
- **Commit.** In one transaction: flip `is_active`, stamp `deactivated_at`, and cancel each
  of those bookings with `cancellation_source = 'deactivation_cascade'` and `cancelled_by`
  set to the acting admin. BR-001.11's trigger fires here and aborts the whole thing if this
  would leave no active admin. After commit, one cancellation email per booking (REQ-024),
  and a push per booking for opted-in employees, worded to name the office admin (BR-001.20).

The preview's list can be stale by the time commit runs — somebody may have cancelled in
between. That is harmless: commit re-reads inside the transaction and cancels what is
actually there. The preview informs the admin; it does not drive the write.

### 4.3 The day-before reminder — the scheduled one

REQ-025, BR-001.14, BR-001.16, US-030.

Hosting is not chosen yet, so the job is designed to not care who wakes it up:

- It is **an ordinary route**, `POST /api/internal/reminders/run`, guarded by a shared
  secret held in configuration — not by a user session, because no user triggers it.
- It computes tomorrow's date in the office timezone, and returns immediately if that is not
  a working day (BR-001.14).
- It finds every confirmed booking on that date, and for each one attempts an email only —
  never a push (BR-001.16).
- **It is safe to run twice.** Each send is recorded in `notification_deliveries`, and the
  partial unique index on sent reminders means a second run for the same booking inserts
  nothing and sends nothing. A retry after a partial failure resends only what failed.

Any scheduler can then call it at 08:00 office time: Supabase's own `pg_cron`, the host's
scheduler, a GitHub Actions schedule, or an in-process timer if the server is always-on and
single-instance. Changing that choice later changes configuration, not code.

**Since 2026-09-14 that list is genuinely open.** The office is `Asia/Kolkata` (NFR-001), a
fixed UTC+05:30 with no daylight saving, so 08:00 office local is permanently **02:30 UTC**
and a plain daily `30 2 * * *` is correct and stays correct. A UTC-only scheduler — GitHub
Actions cron among them — is therefore sufficient; had the office been in a DST zone, a
fixed-offset schedule would have drifted an hour twice a year and the trigger would have had
to be zone-aware. That constraint no longer narrows the hosting choice in §7.

The job still computes tomorrow's date in the office timezone rather than trusting the
schedule, so a daily run needs no cron day-of-week arithmetic: it returns immediately on the
runs where tomorrow is a weekend. Keep it that way — the correctness lives in the job, and
the schedule is only how often it is offered the chance to act.

**Why not an in-process scheduler by default.** It is the simplest thing that works, and it
breaks silently the first time the service runs two copies for availability — both fire, and
only the idempotency index above stops two emails. Keeping the trigger outside means that
decision is visible rather than assumed.

---

## 5. Cross-cutting

### 5.1 Authentication and the session

Supabase Auth issues the tokens; Express decides what they permit. One middleware runs on
every route except sign-in:

1. Verify the access token against Supabase.
2. Load `user_profiles`. **No profile, or `is_active = false` → `401`.** This is what makes
   REQ-005 bite immediately rather than at token expiry — see db-design open question 3.
3. `last_seen_at` older than 30 days → `401` (NFR-009, US-003/AC-03). Otherwise refresh it,
   throttled to once an hour.
4. `must_change_password = true` → every route except the password-change one and sign-out
   returns `403` with a distinguishable code, so the React app can route to SCR-010 rather
   than showing an error (REQ-029, BR-001.17).

Authorization is a second, explicit middleware: `requireAdmin` on every `/api/admin/*` route
(V-07). Roles come from `user_profiles.role`, which the server has already loaded — not from
a JWT claim, which would go stale the moment an admin changes somebody's role (REQ-022).

**The forced password change (BR-001.17) has one subtlety worth naming.** V-15 requires the
new password not to equal the administrator-set one, and Supabase exposes no password
comparison. The check is done by attempting a sign-in with the candidate password before
setting it: success means it is the current password, and the change is refused. The
administrator-set credential stays valid throughout, so a failure here cannot strand a new
starter (RISK-009).

### 5.2 Validation

Every request body, query string and path parameter is parsed by a schema at the route edge
(Zod, or equivalent), rejecting unknown fields rather than ignoring them. A handler receives
a typed, validated value or is never reached. Requirement-level rules — the 30-day window,
the weekday rule, the desk format — live in `domain/` and are called by the service, because
they are business rules that happen to be checkable at the edge, not edge concerns.

### 5.3 Error shape

One error shape from every route: `{ statusCode, code, message }`. `code` is a stable
machine-readable string the React app switches on; `message` is safe to show. Nothing else
crosses the boundary — no stack traces, no Postgres messages, no constraint names.

| Status | Used for                                                                     |
| ------ | ---------------------------------------------------------------------------- |
| `400`  | The request did not parse or violates a field rule (V-12, V-16)              |
| `401`  | No session, expired session, inactive account                                |
| `403`  | Signed in but not permitted — wrong role (V-07), or password change pending  |
| `404`  | No such desk, booking or account                                             |
| `409`  | Something else got there first, or the value is taken: V-04, V-05, V-08, V-10 |
| `422`  | The request is well-formed but the rule refuses it: V-06, V-09, V-11         |

The `409`/`422` split is worth keeping honest: `409` means the world changed or a value
collides, and retrying differently can succeed; `422` means the rule says no. SCR-006's
"this desk has 3 upcoming bookings" refusal is a `422`; two people racing for A-01 is `409`.

### 5.4 Configuration

All configuration is read once at startup, validated against a schema, and **the process
refuses to start if anything required is missing or malformed** (US-034/AC-04). No
`process.env` outside that module.

| Setting                     | Required | Notes                                                         |
| --------------------------- | -------- | ------------------------------------------------------------- |
| Supabase URL, anon key, service-role key | yes | the service-role key is server-only, never bundled      |
| `OFFICE_TIMEZONE`           | yes      | IANA name, **`Asia/Kolkata`** (NFR-001). **No default** — see below |
| Mail service + credentials  | yes      | NFR-007, US-034/AC-02                                         |
| Mail sender address         | yes      | NFR-007. `TBD (owner: IT)` until go-live, US-034/AC-03        |
| Web Push VAPID key pair     | yes      | REQ-026                                                       |
| Reminder-run shared secret  | yes      | §4.3                                                          |

`OFFICE_TIMEZONE` deliberately has no default **even though the value is now known**. A
default of UTC would make BR-001.14's explicit failure case ("reminder sent at 08:00 UTC
while the office is not on UTC") the out-of-the-box behaviour, and NFR-001 now says in the
requirement itself that a missing value must refuse process start rather than fall back.
Naming `Asia/Kolkata` as the value does not make it a literal in code: NFR-002 scopes this
release to one office, but a hard-coded zone is the thing that makes a second office a
rewrite instead of a deployment.

The value must be the IANA name, not an offset. `Asia/Kolkata` is UTC+**05:30** — a
half-hour offset that whole-hour assumptions get wrong — and an invalid name fails the
startup check above, so a typo presents as a process that will not boot rather than as
times that are quietly wrong.

### 5.5 Logging

Structured JSON, one line per request with method, path, status, duration and the acting
user's id. Never a password, a token, the service-role key, or a push subscription's keys —
RISK-005 keeps admin-set passwords out of persistent logs, and that is a constraint on the
logger, not a habit. Every failed notification is both logged and recorded in
`notification_deliveries`, because NFR-005 needs it queryable, not just greppable.

### 5.6 The React side

- Screens map to the approved specs SCR-001–SCR-010; the three responsive shells and their
  360 / 768 / 1280 verification widths come from the IA and NFR-004.
- Server state is fetched through one data-fetching layer with cache invalidation on
  mutation. REQ-036's refresh-on-focus is a property of that layer, set once, not a
  per-screen concern.
- `tokens.css` is the single source for design values (it is already a protected path in
  `ai/standards/task-surfaces.md`); components consume tokens, never literals.
- The service worker exists only for Web Push (REQ-026). The app is not offline-capable and
  nothing should imply it is.

---

## 6. What this design does not do

Named so nobody has to wonder whether it was overlooked:

- **No multi-office anything.** NFR-002 is one office; there is no `office_id` waiting in a
  table. Adding a second office is a schema change, and that is correct for a release that
  explicitly excludes it.
- **No roles beyond the two.** REQ-004 gives exactly one role from a set of two.
- **No self-service password reset.** Out of scope in §10 of the BRD; the only password
  change is the forced one.
- **No caching layer, no queue, no event bus.** One office, tens of desks, hundreds of
  people. Postgres and an in-process dispatch are the right size. A queue becomes the right
  answer when notification volume or delivery guarantees demand it, and neither does yet.
- **No soft-delete columns.** Nothing is deleted, so nothing needs a tombstone.

---

## 7. Open questions and handoffs

Database-level questions live in [`db-design.md` §6](./db-design.md#6-open-questions). The
two that gated delivery — the office timezone and the cancellation-email wording — were
answered on 2026-09-14 and are marked resolved there; questions 3 and 4 remain open and
block nothing. Beyond those:

| #   | Item                                                                                                                                                                                                             | Owner        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | **`ai/standards/` describes the wrong stack.** Coding, API, security, testing and task-surface standards all specify NestJS / Angular / TypeORM / Nx. They need rewriting for React + Express + Supabase before the first story is implemented, or every review cites rules that do not apply. | DevOps / team |
| 2   | **`tools/aidlc-check.mjs` looks for product code at `apps/api`, `apps/ui`, `libs/graph-engine`.** With this layout the test-target check skips itself with a warning, so nothing fails — but the check stops proving anything. Point it at the real paths once they exist. | DevOps       |
| 3   | **Where does this run?** Deferred deliberately (§4.3), and nothing here depends on the answer. It must be settled before Gate 3. It no longer constrains the reminder trigger: with `Asia/Kolkata` fixed at UTC+05:30 and no DST (NFR-001), a UTC-only scheduler is sufficient, so this can be decided on hosting merits alone. | PO / DevOps  |
| 4   | **Which mail service?** NFR-007 already owns this as `TBD (owner: IT)`. Recorded here because §5.4 cannot be completed without it. | IT           |
| 5   | **Supabase project tiers and settings.** Password policy (V-12) is a project setting and should be configured to match rather than only enforced in code. Confirm the plan supports what is needed. | DevOps       |

Nothing above blocks story work. Items 1 and 2 should be done before the first story PR, so
that reviews and CI describe this system rather than the framework's example one.
