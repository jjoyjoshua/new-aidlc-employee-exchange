# Project context

What this repository is, for a persona or a person picking it up cold. The authoritative
detail lives in the documents linked from each section; this file exists so nobody has to read
all of them to orient.

## The product

**Employee Desk Booking** (BRD-001). One office. Employees book a desk for a working day up to
30 days ahead; office admins manage the desk inventory, the accounts, and every booking. Email
confirms and reminds; Web Push is opt-in.

- Requirements: [`inception/product/requirements/BRD-001-employee-desk-booking.md`](../inception/product/requirements/BRD-001-employee-desk-booking.md)
- 34 stories across 5 epics: [`inception/stories/`](../inception/stories/)
- 10 screen specs + design tokens: [`inception/design/`](../inception/design/)

**Explicitly out of scope for this release:** multiple offices, roles beyond the two,
self-service password reset, offline use.

## The stack

| Layer    | Choice                      | Decided by             |
| -------- | --------------------------- | ---------------------- |
| Browser  | React + TypeScript (Vite)   | Joy Joshua, 2026-09-14 |
| Server   | Node.js + Express + TypeScript | Joy Joshua, 2026-09-14 |
| Auth     | Supabase Auth               | Joy Joshua, 2026-09-14 |
| Database | Supabase Postgres           | Joy Joshua, 2026-09-14 |
| Tests    | Vitest; Playwright for browser-level | team, 2026-09-17 |
| Monorepo | npm workspaces (**not** Nx) | team, 2026-09-17       |
| Hosting  | **Not yet chosen** — the design stays neutral | — |

## The one architectural decision everything rests on

**The browser never talks to Supabase for data.** It holds a Supabase session and sends the
access token to Express as a bearer; Express verifies it and does the work with the
service-role key. The browser's Supabase client is constructed with the anon key and used for
exactly two things: signing in and refreshing the token.

That is [ADR-001](../knowledge/decisions/ADR-001-server-mediated-supabase-access.md), and it is
why every business rule in this system is server-side and testable.

## Layout

```
apps/api/          Express server — every business rule lives here
  src/http/          routing, Zod validation at the edge, the one error shape
  src/modules/       auth · users · desks · bookings · notifications
  src/domain/        the rules, as pure functions with no I/O
  src/infra/         supabase · mailer · webpush · clock · logger
  src/config/        read once at startup; refuses to boot on a bad value
apps/ui/           React app — screens SCR-001…SCR-010, service worker for Web Push
supabase/migrations/  schema history
inception/         BRD, stories, design, architecture (Gate 1 output)
knowledge/         traceability manifest + ADRs
ai/                the AI-DLC framework: charters, gates, standards, templates
```

`domain/` takes every input as an argument, **including today's date**. That is deliberate: it
makes most acceptance criteria provable as plain unit tests with no database and no clock
mocking. See [`standards/testing-standards.md`](standards/testing-standards.md).

## Running it

```bash
npm install            # once, at the root
npm run dev -w apps/api
npm run dev -w apps/ui
npm test               # every workspace
npm run lint           # includes the architecture's import boundaries
npm run typecheck
node tools/aidlc-check.mjs   # the gate validator — green before requesting review
```

Copy `.env.example` to `.env` and fill it. **The server will not start** if a required value is
missing or malformed — that is US-034/AC-04, not a bug. `OFFICE_TIMEZONE` is `Asia/Kolkata`
(NFR-001) and has no default on purpose.

## Where things stand (2026-09-17)

Gate 1 is complete and merged: BRD, 34 stories with 315 acceptance criteria, 10 hi-fi screen
specs, database and application architecture. Gate 2 has not started — this scaffold is the
groundwork, and no story has been implemented yet.

**Known and tracked:**

- `tools/aidlc-check.mjs` hardcodes its product-project paths and expects an Nx-style
  `apps/ui/project.json`. It is framework-locked, so the fix goes upstream as a
  `change-request`; until then the `ui` test-target check stays a warning
  ([`app-architecture.md` §7](../inception/architecture/app-architecture.md) item 2)
- How the browser and server share request/response types is **not decided** — Architect call,
  settle it before the first endpoint ships ([`standards/api-standards.md`](standards/api-standards.md))
- Hosting, mail provider, and Supabase project settings are open
  ([`app-architecture.md` §7](../inception/architecture/app-architecture.md) items 3–5)
