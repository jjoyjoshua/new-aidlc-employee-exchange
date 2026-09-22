# Employee Desk Booking

A web app for a single hybrid office: employees reserve a specific desk for a working day up to
30 days ahead, admins manage desks, accounts and every booking. React + Express + Supabase, in
an npm-workspaces monorepo.

---

## 1. Setup

### 1.1 Prerequisites

| Tool     | Version | Notes                                                |
| -------- | ------- | ---------------------------------------------------- |
| Node.js  | >= 20   | Enforced by `engines` in `package.json`; CI runs 20  |
| npm      | >= 10   | Ships with Node 20; workspaces are required          |
| Supabase | —       | A free cloud project is enough; the CLI is run via `npx` |

### 1.2 Install packages

One install at the repository root covers all three workspaces (`apps/api`, `apps/ui`,
`libs/contracts`) — do **not** run `npm install` inside a workspace.

```bash
npm install
```

For a clean, lockfile-exact install (what CI runs):

```bash
npm ci
```

`libs/contracts` is consumed as built output, so build it once before running anything that
needs it directly. `npm test`, `npm run build` and `npm run typecheck` already do this for you:

```bash
npm run build:contracts
```

### 1.3 Create the Supabase project and apply the schema

1. Create a project at [supabase.com](https://supabase.com) (or start a local stack with
   `npx supabase start`).
2. From **Project Settings → API**, copy the **Project URL**, the **anon** key and the
   **service_role** key. Keep the service-role key out of the browser, out of logs and out of
   git — it bypasses every RLS policy in the project
   ([ADR-001](knowledge/decisions/ADR-001-server-mediated-supabase-access.md)).
3. Link the repository to the project and push the migrations in
   [`supabase/migrations/`](supabase/migrations/):

```bash
npx supabase link --project-ref <your-project-ref>
```

```bash
npx supabase db push
```

4. **Development only** — load the desk fixtures. This file sits outside `migrations/` on
   purpose, so nothing applies it automatically; run it by hand in the Supabase SQL editor or
   via `psql` against a dev project. It is idempotent.

```bash
psql "<your-dev-connection-string>" -f supabase/seed/desks.dev.sql
```

> RLS is **deny-all** on every table. The server's service-role key is the only thing that gets
> past it. Do not add a permissive policy to make something work.

### 1.4 Generate the Web Push (VAPID) keys

Push notifications need one key pair. Generate it once and paste both halves into `.env`:

```bash
npx web-push generate-vapid-keys
```

### 1.5 Fill the server `.env`

Copy the template and fill every value:

```bash
cp .env.example .env
```

`.env` is read once at startup and validated. **The server refuses to boot if any required
value is missing or malformed** — that is US-034/AC-04, not a bug. The error lists every
problem at once, with secret values withheld.

| Variable | Required | What it is |
| -------- | -------- | ---------- |
| `SUPABASE_URL` | yes | Project URL; must be a valid URL |
| `SUPABASE_ANON_KEY` | yes | Public key. Safe to expose — it gets past nothing on its own |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Server only.** Bypasses RLS; read in exactly one module, never bundled, never logged |
| `OFFICE_TIMEZONE` | yes | IANA name, e.g. `Asia/Kolkata` — not an offset. **No default, on purpose** (NFR-001); a typo fails the boot rather than shifting every time quietly |
| `MAIL_PROVIDER` | yes | Only `console` is implemented today — it logs and sends nothing, and is **refused** under `NODE_ENV=production` |
| `MAIL_API_KEY` | yes | Provider API key |
| `MAIL_FROM_ADDRESS` | yes | Valid email address used as the sender |
| `VAPID_PUBLIC_KEY` | yes | 87 base64url characters (uncompressed P-256 point) |
| `VAPID_PRIVATE_KEY` | yes | 43 base64url characters; server only |
| `VAPID_SUBJECT` | yes | Contact URL for the push service — `mailto:` or `https:` only |
| `REMINDER_RUN_SECRET` | yes | Shared secret guarding `POST /api/internal/reminders/run`; no user session triggers it |
| `CORS_ORIGINS` | yes | Comma-separated explicit origins, e.g. `http://localhost:5173`. Never `*` outside local dev |
| `PORT` | no | Defaults to `3000` |
| `NODE_ENV` | no | `development` \| `test` \| `production`; defaults to `development` |
| `SESSION_LIFETIME_DAYS` | no | Defaults to `30`, which is the ceiling (NFR-009) — may be shortened, never lengthened |
| `SESSION_LAST_SEEN_THROTTLE_MINUTES` | no | Defaults to `60`; must be **less** than the session lifetime or sessions never renew (the boot fails) |

### 1.6 Fill the browser `.env`

Vite only exposes `VITE_`-prefixed variables and reads them from the UI workspace, so the
browser needs its own file at `apps/ui/.env`:

```bash
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon key>
VITE_API_BASE_URL=http://localhost:3000
```

Only the **anon** key goes here. The service-role key must never reach the browser bundle.

### 1.7 Run it

```bash
npm run dev -w apps/api
```

```bash
npm run dev -w apps/ui
```

The API listens on `:3000` and loads the root `.env`; the UI runs on `:5173`.

Everything else you need day to day:

```bash
npm test          # every workspace (Vitest)
npm run lint      # includes the architecture's import boundaries
npm run typecheck
npm run build
npm run check     # the AI-DLC gate validator
```

The day-before reminder job is an endpoint, not a timer — point any scheduler at it, and it is
safe to run twice:

```bash
curl -X POST http://localhost:3000/api/internal/reminders/run -H "Authorization: Bearer $REMINDER_RUN_SECRET"
```

> **First account:** there is no sign-up and no seeded admin — deliberately, since an
> auto-created admin with a known credential is a security surface of its own. Create the first
> Admin through the Supabase dashboard or admin API, with a matching `user_profiles` row.

---

## 2. About the project

Employees at one hybrid office reserve a named desk (`A-01`, `B-02`, …) for a working day up to
30 days ahead, in office local time. Admins own the desk inventory, the accounts and every
booking. Full requirements:
[BRD-001](inception/product/requirements/BRD-001-employee-desk-booking.md).

### Features

**Employees**

- Sign in with email and password; sessions last 30 days and slide on use
- An administrator-set password must be replaced at first sign-in before anything else is reachable
- Pick a date (today → +30 days, working days only), see live desk availability, book one desk
- Last-booked desk is indicated; when the day is full, the next two days with a free desk are offered
- Own bookings, past and upcoming, cancellable for today or later; the list refreshes on window focus
- Confirmation, cancellation and day-before reminder emails; optional browser push on book and cancel

**Admins**

- Every booking in the office, paged, filterable by date, status and desk
- Cancel any confirmed booking on an employee's behalf
- Desk inventory with upcoming-booking counts: add, rename, activate and deactivate
- People: search, create (with a suggested initial password), edit, change role, reset password,
  deactivate — which cancels that person's upcoming bookings in the same act — and reactivate

**Throughout** — responsive at three widths, never signals by colour alone (WCAG 2.1 AA), and
every business rule is server-side and unit-tested.

### Architecture in one paragraph

The browser never talks to Supabase for data. It holds a Supabase session and sends the access
token to Express as a bearer; Express verifies it and does the work with the service-role key
against deny-all RLS. Two partial unique indexes — one desk per day, one booking per person per
day — arbitrate concurrent bookings in the database rather than in application code.

```
apps/api/         Express — every business rule lives here (http · modules · domain · infra · config)
apps/ui/          React + Vite — screens SCR-001…SCR-010, service worker for Web Push
libs/contracts/   Zod schemas and types shared by both
supabase/         migrations + dev seed
inception/        BRD, 34 stories, design specs, architecture
knowledge/        traceability manifest + ADRs
ai/               the AI-DLC framework (charters, gates, standards)
```

**Out of scope for this release:** multiple offices, roles beyond Employee and Admin,
self-service password reset, offline use.

New to the repository? Read [ONBOARDING.md](ONBOARDING.md) — about 15 minutes.

---

## 3. Delivery estimates

Reconstructed from local Claude Code session transcripts and git history for the AI-DLC build,
**3 – 21 September 2026**. A transcript reconstruction, not an invoice — the account is on a
Team plan, so no dollar cost applies.

| Measure | Value |
| ------- | ----- |
| Stories delivered | **34 / 34** |
| Total tokens | **37.0M** |
| Session attributions | **105** |
| Conversations behind them | 90 sessions + 55 subagent contexts |
| Assistant turns | **28,344** |

**Where the tokens went**

| Phase | Tokens |
| ----- | ------ |
| Delivery — the 34 user stories | 28.1M |
| Discovery — UX: 10 screens, tokens, wireframes | 3.7M |
| Delivery groundwork — React + Express + Supabase scaffold | 1.6M |
| Discovery — BRD authoring | 1.5M |
| Architecture — DB design, app architecture, ADR-001/002 | 1.1M |
| Delivery — cross-cutting bug fixes and housekeeping | 0.8M |
| Discovery — 34 INVEST stories, 315 acceptance criteria | 0.2M |

Per story the median is roughly **0.9M tokens**, from 0.2M (US-033, the responsive and
accessible sweep) up to 1.8M (US-020, find an account). Tokens are per-story shares of the
figure Claude Code's own usage dashboard reports, attributed by the git branch recorded in each
session transcript and matched to the PR that branch merged through.
