# Project task surfaces

Extends [`ai/context/task-classification.md`](../context/task-classification.md) with the
surfaces **this codebase** has. The framework file names the five boundaries every AI-DLC
project shares; this one names them in our files and adds what our stack has that the generic
list doesn't.

**This file is project-owned**, not in `ai/framework-lock.json`, so the team edits it freely.
Two rules: you may **add** surfaces and **named** Medium carve-outs; you may **not** remove or
demote a framework surface (open a `change-request` issue upstream instead).

Stack: React + Express + Supabase Postgres
([`app-architecture.md`](../../inception/architecture/app-architecture.md)).

## Protected paths — always Complex

Any change under these is Complex regardless of diff size:

- `apps/api/src/infra/supabase/**` — the only module permitted to hold the service-role key,
  which bypasses every RLS policy in the project ([ADR-001](../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md))
- `apps/api/src/config/**` — the startup validator; a change here can turn a fail-fast into a
  silent bad default, which is exactly what `OFFICE_TIMEZONE` must never have (US-034/AC-04)
- `apps/api/src/http/middleware/**` — the auth chain. Session verification, the inactive-account
  `401`, the 30-day rule, the `must_change_password` `403`, and `requireAdmin` all live here
- `supabase/migrations/**` — schema history
- `eslint.config.mjs` — carries the architecture's import boundaries as `no-restricted-imports`
  rules; weakening one moves a guarantee from tooling back to good intentions
- `.github/workflows/**`, `ai/framework-lock.json` — gate machinery
- `inception/design/tokens.css` — the design system's single source (`tokens.json` is generated)
- `<e2e-root>/playwright.config.ts` — its `testDir` is the only record of where browser tests live
- `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `opencode.json` — which MCP servers every
  teammate's assistant loads

## Server (`apps/api`)

**Complex** — a new route, or a new write operation (`POST/PUT/PATCH/DELETE`) on an existing
one; a new or changed **required** field in a request schema; a changed response shape; a new
or changed table, column or index, and any migration; anything touching the middleware chain or
`requireAdmin`; a newly required config value; a new module mounted on the app; a new external
integration (mail provider, push service).

**Medium** — a change inside an existing service that keeps its route contract; a new **optional**
request field where the column already exists; a new `GET` reusing an existing table and
response shape; a query rewrite with no migration.

**Simple** — a message string, a comment, a log line's wording, a constant with no rule attached.

### `domain/` is its own case

A **new** pure rule function is **Medium**, not Complex: it has no contract, no persistence and
no trust surface until something calls it, and the call site is where the tier is set. But
**changing an existing rule is Complex** — a rule is a requirement in code, and altering one
changes behaviour every caller already depends on. Changing a rule without a story or a
change-request issue behind it is the thing this line exists to catch.

## Browser (`apps/ui`)

**Complex** — the props or events of a shared component; a new route; a new or changed slice of
shared/global state; the configuration of the data-fetching layer (its cache-invalidation or
refresh-on-focus behaviour is REQ-036, set once for the whole app); anything touching the
Supabase client construction or token handling; the service worker.

**Medium** — a change inside one screen's folder that keeps its props and events; a new
component private to one screen; styling that uses existing tokens.

**Also Complex regardless of location:** rendering unsanitized input, or reading a Supabase
table directly from the browser instead of going through `/api/*` (that one is an ADR-001
violation, not a tier).

## Scripts & jobs

**Complex** — a new script under `tools/`; a change to a job's schedule, retry, or **idempotency**
behaviour; any script that reads or writes production data, holds a production credential, or
performs a bulk/destructive operation; a change to a script's CLI arguments or exit codes when
something else calls it.

**Medium** — internals of an existing script with the same schedule, inputs, outputs, and blast radius.

The reminder run (`POST /api/internal/reminders/run`) is a job wearing a route's clothes. Treat
it as a job: its idempotency is load-bearing, because every scheduler retries.

## Medium carve-outs

Work our stack over-tiers. Each must be *named*. A general "use judgement" clause is not a carve-out:

- A new `GET` lookup endpoint following an existing read-only pattern, reusing the table and an
  existing response shape — Medium
- Adding a **nullable** column plus its optional request field in the same PR, where the
  migration is additive only — Medium, not Complex
- A new pure rule function in `domain/` with its unit tests, not yet wired to a route — Medium
- A new screen folder under `apps/ui` that only composes existing shared components and tokens — Medium

## Escalate, don't decide

Surfaces where the persona stops and asks the human even at Medium: adding a dependency; any
change to `.env` key names; any migration that is not additive; anything that would put the
service-role key, a token, or a password on a path toward a log.
