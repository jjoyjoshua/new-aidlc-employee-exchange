# Coding standards

Applies to all code in `apps/` and `libs/`. Personas load this when implementing or reviewing code (Gate 2).

The stack is **React + Express + Supabase Postgres**, decided by Joy Joshua on 2026-09-14 and
described in [`inception/architecture/app-architecture.md`](../../inception/architecture/app-architecture.md).
This file states the rules; that document states the reasons. Where they disagree, the
architecture wins and this file is wrong.

## General (all TypeScript)

- TypeScript strict; no `any` unless justified with a comment
- Small, single-purpose functions; SOLID, DRY, KISS, but no speculative abstraction
- Names say what, comments say why; comment density matches surrounding code
- No dead code, no commented-out code in commits
- Errors: throw typed errors; never swallow exceptions silently
- Tasks run through npm workspaces: `npm run <script> -w apps/api` (or `-w apps/ui`).
  Root `npm test`, `npm run lint` and `npm run typecheck` fan out to every workspace

## Server (`apps/api`) — Express

Four layers, and the direction of dependency between them is the whole point:

```
http/      routing, schema validation, error shape      → may import modules, domain
modules/   auth · users · desks · bookings · notifications → may import domain, infra
domain/    the rules, as pure functions                 → imports NOTHING from the above
infra/     supabase · mailer · webpush · clock · logger  → may import domain types only
```

### `domain/` — where the rules live

- **Pure functions, no I/O.** No database, no network, no `Date.now()`, no `process.env`
- Every input arrives as an argument, **including today's date**. A rule that needs to know
  what day it is takes the day as a parameter. This is why most AC-citing tests are plain
  unit tests with no database and no clock mocking — see
  [`testing-standards.md`](testing-standards.md)
- One rule per file, named after the rule: `is-date-bookable.ts`, `normalize-desk-number.ts`
- The rule cites the requirement it implements in a comment (`BR-001.3`, `REQ-006`, `V-12`)

### `modules/` — one per business capability

- One folder per module, owning its routes, its request/response shapes, and the service
  that does the work
- **No module imports another module's service.** They collaborate through `domain/` or a
  declared port. `notifications` is the named asymmetry: `bookings` and `users` call it; it
  calls neither, and it is never *consulted* — callers hand over a booking and an event and
  let it decide about opt-in and wording
- `users` owns the deactivation cascade, not `bookings` (BR-001.18 makes it one refusable act)

### `http/` — thin by rule

- A route handler validates, delegates, and shapes the response. **A handler containing a
  business rule is a review finding**, because the rules have to be findable in one place
- Every request body, query string and path parameter is parsed by a Zod schema at the edge,
  rejecting unknown fields rather than ignoring them. A handler receives a typed, validated
  value or is never reached
- One error shape from every route (see [`api-standards.md`](api-standards.md))

### `infra/` — the only place the outside world exists

- **Only `infra/supabase` may construct a Supabase client or read the service-role key.**
  That key bypasses every RLS policy in the project; it lives in one file, never reaches the
  browser, and never appears in a log line ([ADR-001](../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md))
- All configuration is read once at startup, validated against a schema, and **the process
  refuses to start if anything required is missing or malformed** (US-034/AC-04).
  No `process.env` outside `config/`
- `infra/clock` exists so `domain/` never has to reach for the current time itself
- Logging is structured JSON via `infra/logger`; no `console.log`

### Enforced, not just agreed

The first three boundaries are `no-restricted-imports` lint rules in `eslint.config.js`, not
review conventions. If you need to cross one, the answer is a design change, not an
eslint-disable comment.

## Browser (`apps/ui`) — React

- Screens map to the approved specs SCR-001–SCR-010; feature folders are named after them
- **Server state goes through one data-fetching layer** with cache invalidation on mutation.
  REQ-036's refresh-on-focus is a property of that layer, configured once — never a
  per-screen `useEffect`
- The browser's Supabase client is constructed with the **anon key** and used for exactly
  one thing: refreshing the token. **It never reads a table, and it never signs anyone in.**
  All data comes from `/api/*` with the access token as a bearer
  ([ADR-001](../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md)), and
  credentials go to `POST /api/auth/sign-in`
  ([ADR-003](../../knowledge/decisions/ADR-003-express-mediated-sign-in.md))
- [`inception/design/tokens.css`](../../inception/design/tokens.css) is the single source for
  design values. Components consume tokens, never literals. The file is a protected path
  ([`task-surfaces.md`](task-surfaces.md)) and `tokens.json` is generated from it
- The three responsive shells and their 360 / 768 / 1280 verification widths come from the IA
  and NFR-004
- The service worker exists **only** for Web Push (REQ-026). The app is not offline-capable
  and nothing in it should imply otherwise
- Keep logic out of JSX; derive with `useMemo`/plain functions above the return

## What this codebase deliberately does not have

Named so nobody adds them by reflex (architecture §6): no caching layer, no queue, no event
bus, no soft-delete columns, no `office_id`, no role beyond the two, no self-service password
reset. One office, tens of desks, hundreds of people — Postgres and in-process dispatch are
the right size. Adding any of these is an ADR, not a commit.
