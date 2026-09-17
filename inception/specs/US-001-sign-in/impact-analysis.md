# US-001 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                    |
| ----------- | -------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-001-sign-in.md`  |
| **Tier**    | Complex                                            |
| **Updated** | 2026-09-17                                         |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                                                                                                                    |
| ------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract                 | **yes**  | Two new endpoints (`POST /api/auth/sign-in`, `GET /api/auth/session`); the whole of `libs/contracts` including the error body and its stable `code` strings; the props and events of seven shared UI components; three new browser addresses |
| Persistence              | **yes**  | `supabase/migrations/0001_user_profiles.sql` — the `user_role` enum, the `user_profiles` table, its unique email index, its `(is_active, role)` index, and RLS deny-all. The project's first migration          |
| Trust                    | **yes**  | The entire auth chain: `requireSession`, `requireAdmin`, `requireHttps`. Credential handling now transits our server (ADR-003). A new Supabase client on the anon key. AC-04's enumeration defence               |
| Dependency & integration | **yes**  | `react-router-dom` (new, human-approved); `@desk-booking/contracts` (new workspace, both apps); `zod` (new, in contracts); Supabase Auth becomes a **server-side** integration it was not before                 |
| Operational             | **yes**  | `eslint.config.mjs` import boundaries; two new mount points in `app.ts`; `sleep` added to `infra/clock`; `503` added to the error vocabulary; no new `.env` key (see D-05)                                        |

**Six of the seven protected paths in `ai/standards/task-surfaces.md` are touched.** Only
`.github/workflows/**` and the MCP configs are untouched; `inception/design/tokens.css` is read,
never modified.

## Files and callers

Every changed symbol, and who calls it. A caller nobody listed is a regression nobody predicted.

| File                                | Symbol                    | Change            | Callers found (`file:line`)                                                  |
| ----------------------------------- | ------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| `apps/api/src/http/app.ts`          | `createApp`               | body — four mounts added, signature unchanged | `apps/api/src/index.ts:10` (import), `apps/api/src/index.ts:31` (call)        |
| `apps/api/src/http/errors.ts`       | `ErrorBody`, `HttpError`  | `code` narrows from `string` to the contract's union | `apps/api/src/http/error-handler.ts:2` (import), `:24` (instanceof)           |
| `apps/api/src/http/errors.ts`       | `PASSWORD_CHANGE_REQUIRED` | moves to `libs/contracts`, re-exported here | none yet — it exists at `errors.ts:68` and nothing imports it                 |
| `apps/api/src/infra/supabase/index.ts` | `supabase`             | unchanged; `supabaseAuthClient()` added alongside | **none** — nothing imports this module yet                                    |
| `apps/api/src/infra/clock/index.ts` | `Clock`, `systemClock`    | additive — `sleep(ms)` added | **none** — nothing imports this module yet                                    |
| `apps/ui/src/App.tsx`               | `App`                     | body — renders the router instead of a placeholder | `apps/ui/src/main.tsx:3` (import), `:11` (render); `apps/ui/src/App.spec.tsx:3`, `:7` |
| `apps/ui/src/lib/supabase-client.ts` | `supabaseBrowserClient`  | docblock only — behaviour unchanged | **none** — nothing imports it yet                                             |
| `package.json`                      | `workspaces`              | `libs/*` added, build ordering made explicit | every workspace command                                                       |
| `eslint.config.mjs`                 | `no-restricted-imports`   | two boundary blocks added | `npm run lint` over the whole repo                                            |

**The one caller that actually breaks:** `apps/ui/src/App.spec.tsx:7` renders `<App />` bare.
Once `App` renders a router, that test needs a router context or it throws. It is rewritten in
step 9, not deleted.

## Regression risk

| Area                          | Risk       | Why                                                                                                                                                                                   | Covered by                                           |
| ----------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| AC-04 enumeration defence     | **high**   | Three causes, three natural code paths, three natural messages and three natural durations. The deactivated path does strictly more work than either rejection and emerges above the band | `auth.routes.spec.ts` byte-identical body + floor assertions; `auth.service.spec.ts` same-deadline; `sign-in-failure-delay.spec.ts` |
| The dropped revoke (FR-13)    | **high**   | GoTrue has already minted a real refresh token for the deactivated account. Omitting the revoke leaves it alive and silently contradicts REQ-005 — and it passes every other test       | `auth.service.spec.ts`; and the plan's step 5 gate — confirm the SDK exposes admin sign-out or report back |
| Admin authorization           | **high**   | A per-route guard is forgettable and the first one forgotten is a data leak. Mounting on `/api/admin` makes forgetting impossible                                                       | `require-admin.spec.ts` + a supertest against the real mount with an Employee token |
| Role staleness                | medium     | Reading role from a JWT claim is the obvious shortcut and goes stale the moment REQ-022 changes a role under a live session                                                             | `require-session.spec.ts`; `GET /api/auth/session` reads `user_profiles` |
| Password or token in a log    | medium     | The password now transits our server (ADR-003), which it did not before. One `logger.info(req.body)` is a breach                                                                       | Review checklist; `infra/logger` already redacts `password`; `console.log` is lint-banned server-side |
| Shared component props        | medium     | Their props and events are a Complex surface fixed here for nine more screens. Over-designing now is as costly as under-designing                                                        | Scoped to SCR-001 + SCR-010 reuse only; each component has its own `.spec.tsx` |
| `eslint.config.mjs` weakening | medium     | The import boundaries carry the architecture. A boundary loosened to make `libs/contracts` resolve could open a path from `apps/ui` to `apps/api` and the service-role key              | Step 2's deliberate probe: the old violations must still error |
| `apps/ui/src/App.spec.tsx`    | low        | Breaks by construction when `App` gains a router                                                                                                                                       | Rewritten in step 9                                  |
| Everything else in `apps/api` | low        | `infra/supabase`, `infra/clock` and `errors.ts` have no importers today. There is almost nothing to regress                                                                             | `npm run typecheck` across both workspaces           |

## Deliberately not touched

- **The other four tables** (`desks`, `bookings`, `notification_deliveries`, `push_subscriptions`).
  Each arrives with the story that reads it, under that story's review.
- **`POST /api/auth/sign-out`** — US-002's, even though the file it belongs in is open in step 7.
- **The 30-day comparison and the `must_change_password` 403** — US-003's and US-004's. Both are
  left as named, empty, commented seams in `require-session.ts` so the next author does not guess
  where they go.
- **`apps/api/src/config/**`** — a protected path, and no new config value is needed. `TRUST_PROXY`
  was considered and rejected for this story (D-05).
- **`inception/design/tokens.css`** — read constantly, modified never.
- **`.github/workflows/**`** — CI wiring is DevOps' and Gate 3's.
- **`apps/api/src/modules/{bookings,desks,users,notifications}/`** — still READMEs. Nothing here
  needs them, and touching them "while we are in there" would put files in the diff with no AC.
