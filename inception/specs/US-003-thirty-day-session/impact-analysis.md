# US-003 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                              |
| ----------- | ------------------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-003-thirty-day-session.md` |
| **Tier**    | Complex                                                      |
| **Updated** | 2026-09-18                                                   |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                                                                                                             |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract                  | **yes**  | One new error code (`session_expired`) in `libs/contracts/src/error.ts` — no request/response schema change, no new route                                                                                |
| Persistence                | no       | `last_seen_at` already exists (`0001_user_profiles.sql:39`); this story reads and writes it, adds no column, constraint, default, or index                                                                |
| Trust                      | **yes**  | The auth chain itself — `require-session.ts` step 4 stops being a comment and becomes a real expiry check with a write side-effect                                                                       |
| Dependency & integration   | no       | No new dependency, no new external integration                                                                                                                                                            |
| Operational                | **yes**  | Two new config keys read in `apps/api/src/config/index.ts` (optional, defaulted — see decisions.md D-01) and threaded through `composition.ts`                                                            |

**Three of the five surfaces are crossed**, all three of them protected paths named in
`ai/standards/task-surfaces.md`: `apps/api/src/http/middleware/**`, `libs/contracts/**`, and
`apps/api/src/config/**`. This is the Complex tier's own definition applying directly — a session
lifetime rule cannot be built any other way once the story hands its mechanism to `/architect`
rather than to a default.

## Files and callers

| File                                             | Symbol                          | Change                                                          | Callers found (`file:line`)                                          |
| ------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/api/src/domain/session-lifetime.ts`        | `isSessionExpired`, `shouldStampLastSeen` | new file — two pure predicates, no dependents to break            | none yet — new module, called by `require-session.ts` and its own spec |
| `libs/contracts/src/error.ts`                    | `errorCodeSchema`                | + `'session_expired'`                                            | `apps/api/src/http/errors.ts:19` (re-exports `ERROR_CODES` — picks up the new member automatically); every `switch (code)` on the browser side already has a default branch (contract's own design, `error.ts:29-36`) |
| `apps/api/src/config/index.ts`                   | `schema`, `Config`               | + `SESSION_LIFETIME_DAYS`, `SESSION_LAST_SEEN_THROTTLE_MINUTES`, `.superRefine` | `apps/api/src/composition.ts:48-56` (the only reader of `config()` in this module); no other module touches `process.env` (lint-enforced) |
| `apps/api/src/modules/auth/auth.repository.ts`   | `UserProfileRow`, `COLUMNS`, `stampLastSeen` | `last_seen_at` added to both; `stampLastSeen(id, at: Date)`       | `apps/api/src/modules/auth/auth.service.ts:122` (`attemptSignIn` — must pass a `Date` explicitly once the signature changes) |
| `apps/api/src/modules/auth/auth.service.ts`      | `currentUser` → `loadSession`, + `markSeen` | rename + shape change; new method                                 | `apps/api/src/http/middleware/require-session.ts:69` (its only caller — a rename with one call site to update); `require-session.ts` step 4 (new caller of `markSeen`) |
| `apps/api/src/http/middleware/require-session.ts` | `requireSession`, `RequireSessionDeps` | deps gain `nowMs`, `sessionLifetimeMs`, `lastSeenThrottleMs`; step 4 implemented | `apps/api/src/composition.ts:58-61` (the only construction site)       |
| `apps/api/src/composition.ts`                    | `BuildAppOptions`, `buildApp`    | + two ms conversions, two new deps threaded, two new overrides    | `apps/api/src/index.ts` (production boot — unchanged call, new env keys optional so no call-site edit needed); every existing API spec building `buildApp({...})` (unaffected — new options are additive) |
| `apps/ui/src/lib/auth/auth-context.tsx`          | `AuthProvider`, `AuthContextValue` | + boot sequence, `status` field                                  | `apps/ui/src/lib/auth/require-session.tsx:22` (reads `user`; extended to also read `status`); `apps/ui/src/routes.tsx` (mounts `AuthProvider` — unchanged) |
| `apps/ui/src/lib/auth/require-session.tsx`       | `RequireSession`                 | holds while `status === 'booting'` instead of redirecting immediately | `apps/ui/src/routes.tsx` (wraps the shell — unchanged mount)          |

**The one caller that needs care:** `auth.service.ts:122`'s `stampLastSeen(profile.id)` call
becomes a compile error the moment the repository signature requires `at: Date` — a
compile-time catch, which is the same device US-002 used for `revokeSession`'s scope argument
(design note §2.4, `US-002/D-03`).

**The one rename that needs care:** `currentUser` → `loadSession` has exactly one caller
(`require-session.ts:69`) — `GET /session`'s handler reads `req.user`, already attached by step
6 of the chain, and never calls `currentUser` itself (`auth.router.ts:127-134`). This is a
one-call-site rename, not a public API change.

## Regression risk

| Area                                          | Risk   | Why                                                                                                                                                                          | Covered by                                                                                          |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Stamping before comparing (design note §2.3)    | **high** | Reversing step 4's order resurrects a session that should be dead, silently — no single-request test catches it, only a two-request sequence does                          | `auth.routes.spec.ts` AC-03 test asserts both the `401` **and** that `last_seen_at` was not written    |
| `throttle >= lifetime` misconfiguration          | **high** | Renders AC-02 false in production while every unit test (which supplies its own values) stays green — a plausible typo (`...MINUTES=43200`)                                | Config `.superRefine` refuses to boot; `config/index.spec.ts` asserts the refusal                    |
| A failing `markSeen` write turning a good request into a 500 | **high** | A transient DB error on the renewal path must not fail the request it is piggybacking on                                                                                    | `markSeen` awaits, catches, logs `warn`, never rethrows (design note §2.5); service-level test asserts the caller sees no rejection |
| Cold-boot flicker: `RequireSession` redirects before rehydration resolves | medium | Without the `booting` status, every reload — including a session with 29 days left — redirects to sign-in before the boot request completes, failing AC-01                  | `require-session.spec.tsx` asserts no navigation while `status === 'booting'`; `auth-context.spec.tsx` on the boot sequence itself |
| An outage during boot signing a valid session out | medium | If a `service_unavailable` boot response is treated the same as a `401`, a brief API outage would sign out every user with a perfectly valid 30-day session                | FR-18 / step 7: `unavailable` explicitly leaves the stored session untouched                          |
| AC-04 tested vacuously                          | medium | US-007/US-011/US-031 do not exist; a test against an invented route would pass regardless of whether the chain actually issues no challenge                                | Test runs against the one real authenticated route (`GET /session`) across a simulated 29-day window |
| `currentUser` rename missed at a second call site | low    | A rename with an overlooked caller is a silent behavioural change if that caller expected the old return shape                                                              | Impact analysis above confirms exactly one caller; `npm run typecheck` catches any other reference    |
| Two concurrent requests both deciding to stamp   | low    | Last write wins; both write nearly the same instant                                                                                                                          | Explicitly accepted, no lock added — design note §2.1, §2.5; not a defect                             |

## Deliberately not touched

- **`supabase/migrations/**`** — `last_seen_at` already exists with the right type and default.
- **`apps/api/src/modules/auth/auth.router.ts`** — no new route; `GET /session` already does what
  the boot sequence needs.
- **`apps/api/src/http/app.ts`** — the chain is already mounted on everything it guards.
- **`apps/ui/src/routes.tsx`** — `RequireSession` already wraps the shell (US-002).
- **`apps/ui/src/lib/supabase-client.ts`** — persistence and refresh are already the client's
  defaults; this story reads what is stored, it does not change how it is stored.
- **`apps/ui/src/lib/api-client.ts`** — a `401` already arrives as `{ kind: 'error', code }`;
  `session_expired` needs no new handling path, only a value the existing switch's default branch
  already tolerates.
- **`RequireRole`** — mounted only inside `RequireSession` today, so it inherits the boot-aware
  fix without its own change (design note §5.2).
