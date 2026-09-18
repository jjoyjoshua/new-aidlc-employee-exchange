# US-003 — Stay signed in for 30 days

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                              |
| ----------------- | ------------------------------------------------------------ |
| **Story**         | `inception/stories/user-stories/US-003-thirty-day-session.md` |
| **Traces to**     | NFR-009                                                      |
| **Screen**        | SCR-001 ST-01 only — AC-03's destination and AC-05's absent control. No new state |
| **Covering ADRs** | ADR-001, ADR-002, ADR-003 — no new ADR (design note §8)       |
| **Tier**          | Complex                                                      |
| **Status**        | implemented                                                  |
| **Updated**       | 2026-09-18                                                   |

## Problem

Nothing today measures 30 days of disuse. `require-session.ts` step 4 is a named, empty comment
seam; `last_seen_at` exists on `user_profiles` but, contrary to its own docblock, is written only
once — at sign-in — and never again (design note §1). Left alone this story would fail silently:
a session would in effect last forever (nothing ever expires it) while every test that checks "a
31-day-old session is refused" still passes, because nothing renews the column either.

What the system must do instead: refuse a session whose last use was more than 30 days ago
(AC-01, AC-03), let daily use extend that window indefinitely (AC-02), do both without a client
ever performing date arithmetic, and do it without adding a write to every authenticated request
— the throttle db-design.md §1.1 already decided. Cold boot is part of this: today a page reload
always shows the sign-in screen regardless of session age, which passes AC-03 for the wrong
reason and fails AC-01 outright. The design note's mechanism (§2) and boot sequence (§5) are the
whole of what follows; this file states it as requirements and does not re-derive it.

The business case is in the story. This does not restate it.

## Functional requirements

Each `FR-##` is one testable behaviour, traced to the acceptance criterion it serves.

### The rule, in `domain/`

| ID    | Requirement                                                                                                                          | Priority | Serves | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------- |
| FR-01 | `apps/api/src/domain/session-lifetime.ts` exports `isSessionExpired(lastSeenAtMs, nowMs, lifetimeMs)`, true when the gap **strictly exceeds** the lifetime — a gap equal to the lifetime is still valid | Must     | AC-01, AC-03 | implemented |
| FR-02 | The same module exports `shouldStampLastSeen(lastSeenAtMs, nowMs, throttleMs)`, true when the gap is **greater than or equal to** the throttle | Must     | AC-02  | implemented |
| FR-03 | Both functions take every input as an argument, read no clock, and live in `domain/`, per `eslint.config.mjs` Boundary 2            | Must     | —      | implemented |

### The write `require-session.ts` step 4 needs and does not have today

| ID    | Requirement                                                                                                                          | Priority | Serves | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------- |
| FR-04 | `UserProfileRow` gains `last_seen_at`; `COLUMNS` in `auth.repository.ts` selects it — same primary-key query, one more field         | Must     | AC-01, AC-02, AC-03 | implemented |
| FR-05 | `ProfileRepository.stampLastSeen` takes an explicit `at: Date` instead of reading the clock itself                                   | Must     | AC-02  | implemented |
| FR-06 | `AuthService.currentUser` is renamed `loadSession`, returning `{ user: AuthenticatedUser; lastSeenAtMs: number } \| undefined`; `AuthenticatedUser` itself gains no field | Must     | AC-01, AC-02, AC-03 | implemented |
| FR-07 | `AuthService` gains `markSeen(userId, at)`, calling the repository write, awaited, with a caught-and-`warn`-logged failure that does not fail the request | Must     | AC-02  | implemented |

### `require-session.ts` step 4

| ID    | Requirement                                                                                                                          | Priority | Serves | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------- |
| FR-08 | Step 4 reads one `nowMs()`, checks `isSessionExpired` against the loaded `lastSeenAtMs` **before** any write; on expiry, answers `401 session_expired` and calls `markSeen` **zero times** | Must     | AC-03  | implemented |
| FR-09 | When not expired, step 4 calls `shouldStampLastSeen`; when true, calls `markSeen(userId, now)` before `next()`                        | Must     | AC-02  | implemented |
| FR-10 | `requireSession`'s deps gain `nowMs: () => number`, `sessionLifetimeMs: number`, `lastSeenThrottleMs: number` — the same `nowMs` `composition.ts` already builds, threaded through | Must     | —      | implemented |
| FR-11 | `session_expired` is added to `errorCodeSchema` in `libs/contracts/src/error.ts`, between `session_invalid` and `account_inactive`; step 4 raises it via the existing `unauthorized(...)` helper at `401` | Must     | AC-03  | implemented |

### Configuration

| ID    | Requirement                                                                                                                          | Priority | Serves | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------- |
| FR-12 | `apps/api/src/config/index.ts` gains `SESSION_LIFETIME_DAYS` (int, `1..30`, default `30`) and `SESSION_LAST_SEEN_THROTTLE_MINUTES` (int, `1..1440`, default `60`), both optional/defaulted | Must     | —      | implemented |
| FR-13 | The config schema refuses to start when `SESSION_LAST_SEEN_THROTTLE_MINUTES` (in ms) `>= SESSION_LIFETIME_DAYS` (in ms) — the setting that would silently break AC-02 | Must     | AC-02  | implemented |
| FR-14 | `composition.ts` converts both keys to milliseconds once and injects them into `requireSession`'s deps; `buildApp` gains `sessionLifetimeMs?` and `lastSeenThrottleMs?` overrides as the test seam | Must     | —      | implemented |

### The browser: cold-boot rehydration

| ID    | Requirement                                                                                                                          | Priority | Serves | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------- |
| FR-15 | `AuthProvider` gains a boot sequence: on mount, read the stored Supabase session via `supabaseBrowserClient.auth.getSession()`; if present, call `GET /api/auth/session` with its access token | Must     | AC-01  | implemented |
| FR-16 | A `200` from that call sets `user` and the access-token ref from the response, without any password prompt                          | Must     | AC-01  | implemented |
| FR-17 | A `401` (any code) from that call clears the ref, calls `supabaseBrowserClient.auth.signOut({ scope: 'local' })`, and leaves `user` undefined | Must     | AC-03  | implemented |
| FR-18 | An `unavailable` result from that call leaves the stored session untouched and does not sign the user out                            | Must     | —      | implemented |
| FR-19 | `AuthContextValue` gains `status: 'booting' \| 'signedIn' \| 'signedOut'`, derived (not a second source of truth); no stored session at all resolves straight to `signedOut` with no network call | Must     | AC-01  | implemented |
| FR-20 | `RequireSession` renders nothing (or SCR-001's existing loading treatment) while `status === 'booting'`, instead of redirecting       | Must     | AC-01  | implemented |

### AC-04 and AC-05

| ID    | Requirement                                                                                                                          | Priority | Serves | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------- |
| FR-21 | A sequence of authenticated requests spanning day 1, day 15 and day 29 of a session all answer `200` — never `401`, never `403` — proving the only mechanism that could challenge mid-session issues nothing in the window | Must     | AC-04  | implemented |
| FR-22 | No control matching `/remember\|keep me signed in\|stay signed in/i` exists on SCR-001 — a regression assertion, not new UI          | Must     | AC-05  | implemented |

## Non-functional requirements

None beyond NFR-009 itself, which this story exists to satisfy. No new rate-limit, logging, or
performance requirement — step 4 adds one indexed primary-key read already loaded by step 3, and
at most one write per user per throttle interval (design note §2.2, §2.5).

## Technical constraints

- **No migration.** `last_seen_at` already exists on `user_profiles`, `not null default now()`
  (`supabase/migrations/0001_user_profiles.sql:39`). This story reads and writes it; it adds no
  column, constraint, default, or index (design note §7).
- **No new route, no changed response shape**, except the one new string in `errorCodeSchema`.
  `GET /api/auth/session` already exists and already does what the boot sequence needs.
- **The two config keys are optional and defaulted, not newly required** — a required key would
  break every existing `.env` and deployment on the day this merges, to make them retype `30`
  (design note §3(a)).
- **`domain/session-lifetime.ts` reads no clock and imports nothing from `config/`** —
  `eslint.config.mjs` Boundary 2. `config/` may import the `30`-day constant from `domain/`; the
  reverse is banned.
- **Order is load-bearing inside step 4: check expiry, then stamp — never the reverse.** Stamping
  before comparing would resurrect exactly the session the rule exists to kill (design note §2.3).
- **The browser never computes an expiry.** No client-side countdown, idle timer, or date
  arithmetic anywhere in this story (design note §5.3) — the server's answer to
  `GET /api/auth/session` is the only signal.
- **AC-04 is tested structurally against a real route** (`GET /api/auth/session`), not against an
  invented one, and not against `POST /api/auth/sign-out`, which is mounted outside the chain and
  proves nothing about it (design note §6.1).

## Out of scope

- **US-007, US-011, US-031's own tests citing `US-003/AC-04`.** Those stories inherit the chain
  unchanged; nothing new is built for them here. Carried to the Manager as a completeness note
  (design note §11 item 6) so their own PRs pick it up.
- **A GoTrue-side session timebox as defence in depth.** Our expiry is enforced at our boundary
  only; a revoked-by-us session still holds a live GoTrue refresh token that our middleware
  refuses on every request. Correct today, and a different story with its own ADR if the team
  wants a second layer later (design note §8, open item 3).
- **`RequireRole`.** It inherits the boot-aware fix because it is only ever mounted inside
  `RequireSession` today (`routes.tsx`); no change to it is required (design note §5.2).
- **Refresh-on-focus, polling, or any mechanism that re-checks the session on an interval.**
  REQ-036 is a different story and must not be switched on incidentally by this one — sliding
  renewal means any authenticated request counts as use, and turning on background polling here
  would renew a session with no human present (design note §5.3, open item 4).
- **A "your session expired" toast or any new SCR-001 state.** No ST-## specifies one; landing on
  ST-01 is the whole of AC-03's visible behaviour.
- **Resolving whether deactivating an account (US-025) kills that user's live session.** Step 3
  already refuses a deactivated account on its next request, which is the de facto answer; the
  formal question stays open for the PO (story edge case; design note §11 item 8).
