# US-002 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                    |
| ----------- | -------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-002-sign-out.md` |
| **Tier**    | Complex                                            |
| **Updated** | 2026-09-18                                         |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                                                                                                                    |
| ------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract                 | **yes**  | One new endpoint (`POST /api/auth/sign-out`) and a new shared/global state slice (`AuthContextValue.signOut`). Neither adds to `libs/contracts` — no request or response schema exists to add (design note §3) |
| Persistence               | no       | No migration, no schema change. Sign-out stores nothing and stamps nothing                                                                                                                                     |
| Trust                     | **yes**  | Session termination itself. `revokeSession`'s scope argument changes from hardcoded to explicit — a change to how an existing security primitive is called, not a new one                                     |
| Dependency & integration  | no       | No new dependency, no new external integration. Reuses the existing Supabase admin sign-out call                                                                                                              |
| Operational               | no       | No new env/config value, no new scheduled job or middleware. `app.ts` and `composition.ts` are unmodified (design note §9 — the route joins the already-wired, already-unguarded `authRouter` mount)          |

**Two of the five surfaces are crossed, both for the reason the story itself names**: a new
write endpoint, and it ends a session. **None of the seven protected paths in
`ai/standards/task-surfaces.md` is edited**, except an optional, non-binding comment in
`require-session.ts` — this is the payoff of mounting outside the chain rather than inside it
(design note §2.2, §9).

## Files and callers

| File                                             | Symbol                          | Change                                                          | Callers found (`file:line`)                                          |
| ------------------------------------------------ | -------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/api/src/modules/auth/auth.adapter.ts`      | `AuthAdapter.revokeSession`      | signature gains a required `scope` parameter                     | `apps/api/src/modules/auth/auth.service.ts:107` (the US-001 refusal path — must pass `'global'` explicitly) |
| `apps/api/src/modules/auth/auth.service.ts`      | `createAuthService`              | + `signOut(accessToken)` returning `void`                        | none yet — new method, called by the new router handler                |
| `apps/api/src/modules/auth/auth.router.ts`       | `createAuthRouter`               | + `POST /sign-out`, mounted with no session dependency            | `apps/api/src/composition.ts:64` (unchanged call site — no new dependency threaded through) |
| `apps/ui/src/lib/auth/auth-context.tsx`          | `AuthProvider`, `AuthContextValue` | `getAccessToken` returns a real value; + `signOut()`             | every consumer of `useAuth()` — currently none read `signOut`; `SignIn.tsx` reads `onSession`/`signIn`, unaffected |
| `apps/ui/src/lib/api-client.ts`                  | (the request layer)              | + a no-content path; the existing `request()` is unchanged       | `apps/ui/src/screens/sign-in/SignIn.tsx` (uses `request`, not the new path) — no regression      |
| `apps/ui/src/components/app-shell/AppShell.tsx`  | `AppShell`                       | body — renders the new account menu inside the existing shell    | `apps/ui/src/routes.tsx` (mount, unchanged), `AppShell.spec.tsx` (extended, not replaced) |
| `apps/ui/src/routes.tsx`                         | route tree                       | the shell's route element gains a `RequireSession` wrapper       | every route currently nested under the shell — all continue to render when a user exists; behaviour changes only when `user` is absent |

**The one caller that needs care:** `auth.service.spec.ts` asserts the deactivated-account
refusal path today. Once `revokeSession` takes a required `scope`, that existing call site
(`auth.service.ts:107`) must pass `'global'` explicitly or the build fails — a compile-time
catch, not a runtime one, which is the point of making the parameter required rather than
optional-with-a-default.

## Regression risk

| Area                                      | Risk       | Why                                                                                                                                                                     | Covered by                                                                 |
| ------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| AC-02 resting on unverified GoTrue behaviour | **high**   | Revoking the refresh token is certain; whether an already-issued **access** token stops being honoured before it expires depends on installed GoTrue behaviour nobody in this project has observed (design note §5) | A manual check (sign in, sign out, retry `GET /session` with the same access token) pasted into the PR — no automated test can close this |
| The dropped scope correction               | **high**   | If `revokeSession` keeps its hardcoded `'global'`, sign-out silently signs the user out of every device, which the story does not ask for and no test would catch without asserting scope | `auth.service.spec.ts` — assert the adapter receives `'local'` for sign-out and `'global'` for the US-001 path |
| A route that never learns the caller's token | **high**   | `getAccessToken` returns `undefined` today; if FR-11 is skipped, sign-out ships as a silent no-op that passes every test that does not check the request headers        | `auth-context` test asserting the sign-out request carried the bearer token; the server-side warning log (FR-06) as a second, independent signal |
| AC-04 tested vacuously                     | medium     | `requireSession` step 5 is empty until US-004; a test written against `must_change_password = true` today would pass whether or not the route actually bypasses the chain | Test against the refusal that already exists — `is_active = false` — which proves the route runs no chain, the property AC-04 needs later |
| `apiClient` misreading a `204` as an outage | medium     | The existing `request()` calls `response.json()` unconditionally; a `204` has no body and the parse throws, landing on the outage state              | New no-content path is additive; existing `request()` path is untouched and covered by its own existing tests |
| Second tab sharing one GoTrue session      | low        | A `local` revoke ends the session both tabs use, which could look like an unintended cross-tab effect if not documented                                | Named explicitly in the design note (§2.3) and in `decisions.md`; not a defect, the intended scope of "this browser" |
| `require-session.ts` comment drift          | low        | Step 5's comment currently promises an exemption for sign-out inside the chain; leaving it unedited would describe a mechanism that no longer needs to exist | Optional comment update, not load-bearing — behaviour does not depend on the edit |

## Deliberately not touched

- **`libs/contracts/**`** — no schema to add (design note §3).
- **`apps/api/src/composition.ts`** — the route joins the already-wired `authRouter`; nothing new
  to wire in.
- **`apps/api/src/http/app.ts`** — `/api/auth` is already mounted unguarded, which is exactly
  where this route needs to sit.
- **`supabase/migrations/**`** — sign-out stores nothing.
- **`apps/api/src/http/middleware/require-session.ts`** — the chain itself is not edited; only
  an optional, non-binding comment.
- **SCR-010** — the screen does not exist. US-004 attaches the sign-out link to it.
- **The Settings menu row** — arrives with the Settings screen.
