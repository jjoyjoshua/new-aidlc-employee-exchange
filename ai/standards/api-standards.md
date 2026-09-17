# API standards

The HTTP contract between the React app and the Express server. Details and reasoning:
[`app-architecture.md` §5.2–5.3](../../inception/architecture/app-architecture.md).

## Shape

- All routes under `/api`; resources are plural nouns (`/api/bookings`, `/api/desks`).
  Actions become sub-resources only when a noun genuinely doesn't fit
  (`/api/internal/reminders/run`)
- Admin-only surfaces live under `/api/admin/*` and carry the `requireAdmin` middleware
- Versioning: none for this release; a breaking change needs an ADR

## Validation

- **Every** request body, query string and path parameter is parsed by a Zod schema at the
  route edge. Unknown fields are **rejected**, not stripped and not ignored
- A handler receives a typed, validated value or is never reached
- Requirement-level rules — the 30-day window, the weekday rule, the desk-number format —
  are **not** edge concerns. They live in `domain/` and are called by the service. They are
  business rules that happen to be checkable early, which is not the same thing

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
| `400`  | The request did not parse, or violates a field rule (V-12, V-16)              |
| `401`  | No session, expired session, inactive account                                 |
| `403`  | Signed in but not permitted — wrong role (V-07), or password change pending   |
| `404`  | No such desk, booking or account                                              |
| `409`  | Something else got there first, or the value is taken: V-04, V-05, V-08, V-10 |
| `422`  | The request is well-formed but the rule refuses it: V-06, V-09, V-11          |
| `500`  | Never intentional                                                             |
| `503`  | A named downstream is unreachable — timed out, refused, or answered 5xx        |

**`503` is not a softer `500`.** `500` is our defect; `503` is a dependency we do not control.
US-001/AC-07 exists precisely to separate "the service is unavailable" from "we rejected you",
and the screen says different things for each: a `503` offers **Try again** and keeps what the
user typed, a `500` does not pretend a retry will help. An operator needs the same split to tell
a Supabase outage from our own bug. Added 2026-09-17 with US-001 (ADR-003 follow-up 3).

**Keep the `409`/`422` split honest.** `409` means the world changed or a value collides, and
retrying differently can succeed. `422` means the rule says no. Two people racing for desk
A-01 is `409`; SCR-006's "this desk has 3 upcoming bookings, so it can't be retired" is `422`.

### One `403` carries extra weight

When `must_change_password` is set, every route except the password-change route and sign-out
returns `403` with a **distinguishable `code`**, so the React app can route to SCR-010 rather
than render an error (REQ-029, BR-001.17). That code is part of the contract; changing it
breaks the forced-password-change flow.

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

Unbounded collections take `?page&limit` with a documented maximum. "All bookings" (REQ-012)
is the one that will grow.

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
