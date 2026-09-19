# API standards

The HTTP contract between the React app and the Express server. Details and reasoning:
[`app-architecture.md` §5.2–5.3](../../inception/architecture/app-architecture.md).

## Shape

- All routes under `/api`; resources are plural nouns (`/api/bookings`, `/api/desks`).
  Actions become sub-resources only when a noun genuinely doesn't fit
  (`/api/internal/reminders/run`)
- Admin-only surfaces live under `/api/admin/*` and carry the `requireAdmin` middleware
- Versioning: none for this release; a breaking change needs an ADR
- **`PATCH /api/admin/<resource>/:id` modifies an attribute of an existing resource. A
  refusable state TRANSITION — one a business rule can reject with its own error, like
  cancelling a booking or deactivating a desk — is a verb sub-resource instead:
  `POST /api/admin/<resource>/:id/<verb>` (e.g. `/bookings/:id/cancel`). The two shapes read
  differently on purpose: a `PATCH` that fails does so on validation or a conflict over the
  new value itself (a duplicate desk number); a transition can fail on a rule about the
  resource's current state (an active booking count) that the request body never mentions
  (US-018 design note §3.1, open item 5 — set here rather than as an ADR because the
  decision is one sentence, but it binds every update-in-place endpoint after it)

## Validation

- **Every** request body, query string and path parameter is parsed by a Zod schema at the
  route edge. Unknown fields are **rejected**, not stripped and not ignored
- A handler receives a typed, validated value or is never reached
- Requirement-level rules — the 30-day window, the weekday rule — are **not** edge concerns.
  They live in `domain/` and are called by the service. They are business rules that happen
  to be checkable early, which is not the same thing. The desk-number format is the
  exception that proves it: it is shared, wire-facing validation with no service-side caller
  of its own, so it lives in `libs/contracts` instead (`DESK_NUMBER_PATTERN`,
  `normalizeDeskNumber`, `deskNumberSchema` — `libs/contracts/src/desks.ts`), evaluated
  identically by both the browser and the route edge (US-017 design note §5; corrected here
  in US-018, which reuses that same schema at a second route edge)

## Errors

One shape from every route, no exceptions:

```json
{ "statusCode": 409, "code": "desk_already_booked", "message": "Someone else booked that desk." }
```

`code` is a stable machine-readable string the React app switches on. `message` is safe to
show a user. **Nothing else crosses the boundary** — no stack traces, no Postgres messages,
no constraint names.

| Status | Used for                                                                      |
| ------ | ----------------------------------------------------------------------------- |
| `200`  | Read succeeded                                                                |
| `201`  | Created                                                                       |
| `204`  | A state-changing request succeeded and has nothing to say                     |
| `400`  | The request did not parse, or violates a field rule (V-12, V-16)              |
| `401`  | No session, expired session, inactive account                                 |
| `403`  | Signed in but not permitted — wrong role (V-07), or password change pending   |
| `404`  | No such desk, booking or account                                              |
| `409`  | Something else got there first, or the value is taken: V-04, V-05, V-08, V-10 |
| `422`  | The request is well-formed but the rule refuses it: V-06, V-09, V-11, V-15    |
| `500`  | Never intentional                                                             |
| `503`  | A named downstream is unreachable — timed out, refused, or answered 5xx        |

**`503` is not a softer `500`.** `500` is our defect; `503` is a dependency we do not control.
US-001/AC-07 exists precisely to separate "the service is unavailable" from "we rejected you",
and the screen says different things for each: a `503` offers **Try again** and keeps what the
user typed, a `500` does not pretend a retry will help. An operator needs the same split to tell
a Supabase outage from our own bug. Added 2026-09-17 with US-001 (ADR-003 follow-up 3).

**`204` has no body, and none is added to describe it.** An empty response schema would be
exported and maintained forever to describe nothing. Added 2026-09-18 with US-002's sign-out,
the first endpoint whose entire value is that it never fails.

**Keep the `409`/`422` split honest.** `409` means the world changed or a value collides, and
retrying differently can succeed. `422` means the rule says no. Two people racing for desk
A-01 is `409`; SCR-006's "this desk has 3 upcoming bookings, so it can't be retired" is `422`.

**A `404` may deliberately merge several distinct causes when discriminating between them would
be an existence oracle.** Discriminating among the states of a resource the caller already owns
discloses nothing, because the caller can already read those states. Discriminating **across** an
ownership boundary is the oracle — it tells a caller something exists that they otherwise
couldn't see. `POST /api/bookings/:id/cancel` folds "no such booking", "not the caller's" and
"the caller's own but past-dated" into one undiscriminated `404 booking_not_found` for exactly
this reason (US-011). Where there is **no** ownership boundary — an administrator calling
`POST /api/admin/bookings/:id/cancel` can already read every booking's status via
`GET /api/admin/bookings` — the rule's own test says the oracle argument does not apply, and the
same fold is instead a **scope** decision: no approved copy or error code exists for a distinct
"no longer cancellable" outcome, so both causes answer `404` there too (US-015). Same status code,
different reason each time; state which one applies rather than assuming the anti-enumeration
argument travels automatically to every `404`.

### One `403` carries extra weight

When `must_change_password` is set, every route except the password-change route, `GET
/api/auth/session`, and sign-out returns `403` with a **distinguishable `code`**, so the React
app can route to SCR-010 rather than render an error (REQ-029, BR-001.17). `GET /session` is
exempt too (US-004 design note §4.3) — it is how the browser learns the mark is set on a cold
boot, and gating it would make that fact unreachable. That code is part of the contract;
changing it breaks the forced-password-change flow.

**Its mirror carries the opposite condition.** `POST /api/auth/set-password` on an account whose
mark is already clear answers `403 password_change_not_required` — there is no voluntary
password change in this release (BRD-001 §10). One character from `password_change_required` in
a switch statement, which is why both are named constants rather than string literals.

## Concurrency

Where a unique index arbitrates, **let it**. The booking insert is attempted without a
preceding availability check; Postgres accepts it or rejects it, and the server maps the
violated index to the right `409` (architecture §4.1). A check-then-insert has a race window
no application code closes. The "is it free?" query still exists — it serves the availability
screen (REQ-007), not the booking decision.

## Effects happen after commit

A notification is dispatched **after** the transaction commits, never inside it. Sending
inside means a mail outage rolls back a good booking, and a transaction that later rolls back
can still have sent a real email. A failed send is logged and recorded in
`notification_deliveries` (NFR-005); it does not undo the booking the employee can already see.

## Idempotency

`POST /api/internal/reminders/run` is safe to run twice: each send is recorded, and the
partial unique index on sent reminders means a second run inserts nothing and sends nothing.
A retry after a partial failure resends only what failed. Any new job route inherits this
requirement — a scheduled endpoint that isn't safe to call twice is a defect, because every
scheduler retries.

## Pagination

Two shapes, chosen by what defines a page — not a house style to pick freely (US-013 design
note §2.4, `inception/specs/US-013-see-every-booking/`):

- **A page defined by a row count** takes `?page`, server-fixed page size, never a client
  `limit` — `GET /api/admin/bookings` (US-013). A total order over a non-unique sort key
  tolerates the offset this implies, and the fixed size lets one query answer both the page and
  a "how many match" count in the same round trip.
- **A page defined by a date window** takes a date cursor (`?before=<date>`), never a row-count
  parameter — `GET /api/bookings` (US-010). Fixing a row count here needs a composite cursor on
  the wire (a date can hold more than one row), which is worse than the window shape it would
  replace.

**The page size is always the server's, never a client-supplied parameter**, on both shapes — a
security rule as much as a consistency one for `/api/admin/*`, which returns cross-employee data.

## How the two sides share request/response types

**One shared workspace package, `libs/contracts`, and the browser validates responses at
runtime** ([ADR-002](../../knowledge/decisions/ADR-002-shared-api-contract-package.md),
2026-09-17).

- Request and response schemas are defined **once**, in Zod, in that package. Types are
  inferred from them with `z.infer` — never declared alongside them, because two declarations
  are not a contract
- The server validates requests with those schemas at the route edge, and types its response
  builders from them, so a response that no longer matches fails the build
- The browser parses every response through the schema before the data reaches a component. A
  mismatch throws at the network boundary naming the field, instead of rendering `undefined`
- The error body and the stable `code` strings live there too. `password_change_required` is a
  contract between a middleware and SCR-010; a shared constant makes a typo a compile error
- The package depends on `zod` and nothing else, and imports nothing from `apps/**`

**What does not go in it: the rules.** "A desk number is a non-empty string of at most N
characters" is a contract. "This desk number is already taken" is BR-001.4 and BR-001.8, lives
in `domain/`, and is answered with a `409`. The browser never has the data to evaluate a
business rule correctly, and duplicating one is how two answers to a single question appear.
