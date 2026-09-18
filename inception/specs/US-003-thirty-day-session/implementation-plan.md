# US-003 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                              |
| --------- | ------------------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-003-thirty-day-session.md` |
| **Spec**  | `spec.md`                                                    |
| **Tier**  | Complex                                                      |

## Approval — Gate D1

| Field                 | Value                                       |
| ---------------------- | -------------------------------------------- |
| Status                | **approved**                                 |
| Approved by           | Joy Joshua <joy_j@trigent.com>                |
| Approved on           | 2026-09-18                                   |
| Plan commit approved  | *uncommitted at approval* — base `78cdb13`   |

**On the SHA.** This package was approved in the working tree, before its first commit, same as
US-001's and US-002's were. The base it was read against is `78cdb13` (`main`'s head at the time
this package was written), and the commit that introduces this package **is** the approved
content — `git diff 78cdb13 -- inception/specs/US-003-thirty-day-session/implementation-plan.md`
shows exactly what was approved. Any edit after that commit needs a `change-log.md` row, and
check 16 enforces it. `Approved by` is the human's name and email from `git config user.name` /
`user.email`. The name is self-asserted, so it is attribution, not authentication.

## Before step 1 — what the branch looks like while this runs

`feat/US-003-thirty-day-session` is **red from the first commit until step 10** — `aidlc-check`
fails a `feat/US-###` branch with no AC-citing test, by design.

## Design reference

No new hi-fi frames and no new screen state. SCR-001 ST-01 is the sign-out/expiry destination and
is unchanged; the only visible assertion this story adds against it is AC-05's absence check
(step 8). Everything else is session behaviour with no interface of its own — see the Architect's
design note (`design-note.md`) §0, §5.

## Steps

Ordered. Test-first per acceptance criterion: the failing test named `... (US-003/AC-##)` comes
before the code that turns it green.

### Step 1 — the two pure predicates, test-first

| Field    | Value |
| -------- | ----- |
| Advances | FR-01, FR-02, FR-03 |
| Files    | `apps/api/src/domain/session-lifetime.spec.ts` (create, **first**); `apps/api/src/domain/session-lifetime.ts` (create — `isSessionExpired`, `shouldStampLastSeen`, `SESSION_LIFETIME_DAYS`, `LAST_SEEN_THROTTLE_MINUTES` constants; no clock read, no import from `config/`) |
| Verify   | `npm test --workspace @desk-booking/api` — expected, named `... (US-003/AC-01)`: 29 days not expired, exactly 30 days not expired, 30 days + 1ms expired. Named `... (US-003/AC-03)`: 31 days expired. Named `... (US-003/AC-02)`: `shouldStampLastSeen` false at 59 minutes, true at 60 minutes and 61 minutes |

### Step 2 — configuration gains the two keys, with the cross-field refusal, test-first

| Field    | Value |
| -------- | ----- |
| Advances | FR-12, FR-13 |
| Files    | `apps/api/src/config/index.spec.ts` (modify, **first**); `apps/api/src/config/index.ts` (modify — `SESSION_LIFETIME_DAYS` (`z.coerce.number().int().min(1).max(SESSION_LIFETIME_DAYS_MAX).default(30)`, importing the ceiling from `domain/session-lifetime.ts`), `SESSION_LAST_SEEN_THROTTLE_MINUTES` (`z.coerce.number().int().min(1).max(1440).default(60)`), a `.superRefine` refusing `throttleMs >= lifetimeMs`); `.env.example` (modify — new `# ---- Session (NFR-009) ----` section, both keys commented with their defaults, per `OFFICE_TIMEZONE`'s style) |
| Verify   | `npm test --workspace @desk-booking/api` — expected: defaults apply when both keys are absent; each bound is enforced; a `throttle >= lifetime` configuration fails `loadConfig` with a named `ConfigurationError` problem, not a boot that silently accepts it |

### Step 3 — the repository can read and write `last_seen_at` on the caller's clock

| Field    | Value |
| -------- | ----- |
| Advances | FR-04, FR-05 |
| Files    | `apps/api/src/modules/auth/auth.adapter.spec.ts` — no change expected, listed to confirm; `apps/api/src/modules/auth/auth.repository.ts` (modify — `UserProfileRow` gains `last_seen_at: string`, `COLUMNS` gains the column, `stampLastSeen(id: string, at: Date)` replaces `new Date()` with the argument); any existing repository-level test for `stampLastSeen` (modify — assert the write uses the passed `at`, not wall-clock time) |
| Verify   | `npm test --workspace @desk-booking/api` — expected: `stampLastSeen` writes exactly the ISO string of the `at` argument; the sign-in call site (`auth.service.ts:122`) still compiles unchanged in this step (it starts passing a real `Date` in step 4) |

### Step 4 — the service reports session age and can renew it without failing the request

| Field    | Value |
| -------- | ----- |
| Advances | FR-06, FR-07 |
| Files    | `apps/api/src/modules/auth/auth.service.spec.ts` (modify, **first** — rename the `currentUser` describe block, add `loadSession` and `markSeen` cases); `apps/api/src/modules/auth/auth.service.ts` (modify — `currentUser` renamed `loadSession`, returning `{ user, lastSeenAtMs }` parsed from the row's ISO string; `attemptSignIn`'s `stampLastSeen(profile.id)` call becomes `stampLastSeen(profile.id, new Date(startedAtMs))` or an equivalent single reading — no new clock read at sign-in; + `markSeen(userId, at)` wrapping `profiles.stampLastSeen`, awaited, `catch` + `logger.warn`, never rethrown) |
| Verify   | `npm test --workspace @desk-booking/api` — expected: `loadSession` returns `undefined` for the same two cases `currentUser` did (no profile, inactive); a `markSeen` whose repository call rejects still resolves and logs a warning, and the caller sees no rejection |

### Step 5 — `require-session.ts` step 4, in order (AC-01, AC-02, AC-03)

| Field    | Value |
| -------- | ----- |
| Advances | FR-08, FR-09, FR-10 |
| Files    | `apps/api/src/http/middleware/require-session.ts` (modify — deps gain `nowMs`, `sessionLifetimeMs`, `lastSeenThrottleMs`; step 3 switches to `service.loadSession`; step 4 replaces the comment: one `nowMs()` reading, `isSessionExpired` first (expired → `401 session_expired` via `unauthorized(ERROR_CODES.session_expired, ...)`, **no** `markSeen` call), else `shouldStampLastSeen` → `await service.markSeen(userId, new Date(now))` before `next()`; docblock's "Three distinct 401 codes" → "Four distinct 401 codes") — no test file at this layer exists yet; the behaviour is proven end-to-end in step 6 |
| Verify   | Compiles; the API test suite from step 6 is what actually proves this step, per the QA note's own instruction not to assert against a mock |

### Step 6 — the contract gains `session_expired`, and `composition.ts` wires the two config values (AC-01, AC-02, AC-03, AC-04)

| Field    | Value |
| -------- | ----- |
| Advances | FR-11, FR-14, FR-21 |
| Files    | `libs/contracts/src/error.spec.ts` (modify, **first** — assert `session_expired` parses); `libs/contracts/src/error.ts` (modify — add `'session_expired'` to `errorCodeSchema`, between `session_invalid` and `account_inactive`); `apps/api/src/composition.ts` (modify — `BuildAppOptions` gains `sessionLifetimeMs?`, `lastSeenThrottleMs?`; `buildApp` converts `config().SESSION_LIFETIME_DAYS` and `config().SESSION_LAST_SEEN_THROTTLE_MINUTES` to ms when the overrides are absent, and threads all three (`nowMs`, `sessionLifetimeMs`, `lastSeenThrottleMs`) into `requireSession`'s deps); `apps/api/src/modules/auth/auth.routes.spec.ts` (modify, **first** for this step's API-level assertions — see the concrete sequences below) |
| Verify   | `npm test --workspace @desk-booking/api` — the harness's stub `stampLastSeen` must actually write to its `rows` array (currently a no-op) so the renewal sequence is observable. Named `... (US-003/AC-01)`: a token whose `last_seen_at` is 29 days old (via `buildApp({ nowMs: () => T0, sessionLifetimeMs: ... })`) gets `200`, no challenge. Named `... (US-003/AC-02)`: `last_seen_at = T0 - 20 days`, `GET /session` at `T0` → `200` and the stored `last_seen_at` becomes `T0`; advance `nowMs` to `T0 + 20 days`, `GET /session` → `200` (40 days after sign-in, still valid). Named `... (US-003/AC-02)`, throttle: `GET` at `T0` stamps; `GET` at `T0 + 30min` → `200`, `last_seen_at` **unchanged**; `GET` at `T0 + 90min` → `200`, `last_seen_at` becomes `T0 + 90min`. Named `... (US-003/AC-03)`: `last_seen_at` 31 days old → `401` `session_expired`, **and assert the stored `last_seen_at` was not written** (a call-count assertion is correct here — absence of a write is the criterion, design note §2.3, §10). Named `... (US-003/AC-04)`: a sequence of `GET /session` calls at day 1, day 15, day 29 of one session all `200`, never `401`/`403` |

### Step 7 — the browser rehydrates a stored session on cold boot (AC-01, AC-03)

| Field    | Value |
| -------- | ----- |
| Advances | FR-15, FR-16, FR-17, FR-18, FR-19, FR-20 |
| Files    | `apps/ui/src/lib/auth/auth-context.spec.tsx` (modify, **first**); `apps/ui/src/lib/auth/auth-context.tsx` (modify — `AuthProvider` reads `supabaseBrowserClient.auth.getSession()` on mount via an injectable `getStoredSession` prop, defaulting to the real client, so a test never needs `VITE_SUPABASE_*`; on a stored session, calls `GET /api/auth/session` with its access token; `200` → `setUser` + set the access-token ref; `401` → clear the ref, call `onSignOut`, leave `user` undefined; `unavailable` → leave the stored session untouched; `AuthContextValue` gains `status: 'booting' \| 'signedIn' \| 'signedOut'`, derived from `user`); `apps/ui/src/lib/auth/require-session.spec.tsx` (modify, **first**); `apps/ui/src/lib/auth/require-session.tsx` (modify — render nothing while `status === 'booting'`, `<Navigate>` only once `status === 'signedOut'`) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-003/AC-01)`: a stored session plus a `200` from `GET /session` renders the signed-in tree with no redirect and no password prompt at any point (assert `RequireSession`'s children mount, not merely that no navigation occurred). Named `... (US-003/AC-03)`: a stored session plus a `401` (`session_expired`) from `GET /session` redirects to `/sign-in`, and only after the boot call resolves — a redirect that fires before it resolves is the flicker bug this step exists to prevent. A third case: no stored session at all resolves straight to `signedOut` with zero network calls |

### Step 8 — AC-05's regression guard

| Field    | Value |
| -------- | ----- |
| Advances | FR-22 |
| Files    | `apps/ui/src/screens/sign-in/SignIn.spec.tsx` (modify — one assertion, no component change) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-003/AC-05)`: querying for `/remember\|keep me signed in\|stay signed in/i` on the rendered sign-in screen finds nothing |

### Step 9 — documentation and comments stay true

| Field    | Value |
| -------- | ----- |
| Advances | — (documentation correctness) |
| Files    | `apps/api/src/http/middleware/require-session.ts` docblock (already covered in step 5 — confirm the "four distinct 401 codes" edit landed); `inception/specs/US-001-sign-in/spec.md` FR-18 (modify — status `not started` → closed here, with a note pointing at this package, resolving the disagreement design note §1 found against `US-001-sign-in/traceability.md`) |
| Verify   | Manual read |

### Step 10 — traceability, the manifest, and the gate

| Field    | Value |
| -------- | ----- |
| Advances | all |
| Files    | `inception/specs/US-003-thirty-day-session/traceability.md` (fill); `knowledge/traceability/manifest.json` (modify — `US-003.tests[]`, currently empty, gains every spec file touched above); `inception/specs/index.md` (status to `implemented` at merge) |
| Verify   | `npm run lint && npm run typecheck && npm test && node tools/aidlc-check.mjs` — all green, and the check no longer reports US-003 as a story with no AC-citing test |

## Required before this story is called done — not a code step

**A manual check, output pasted into the PR**, mirroring US-002's: sign in, capture the access
token, wait (or otherwise arrange) for the session to age past the configured lifetime, and
confirm `GET /api/auth/session` with that token returns `401 session_expired`. This is normally
provable entirely by the automated suite via `buildApp`'s injected clock and shortened
`sessionLifetimeMs`/`lastSeenThrottleMs` — call this out as already covered by step 6's tests
rather than a separate manual step, unless a reviewer wants to see it exercised against a real
(non-stubbed) `user_profiles` row once.

## Rollback

Revert the PR. No migration exists to unwind. The two new config keys are optional and defaulted,
so an environment that never sets them is unaffected either way; an environment that does set them
simply stops having its override read once the branch reverts.

## Open questions

None block D1. The three items below are the design note's own "defensible either way, flagging
for override" list, not gaps in the plan:

| Question | Owner | Blocks |
| -------- | ----- | ------ |
| Design note §3(c) — the `.max(30)` ceiling on `SESSION_LIFETIME_DAYS`: should an operator be able to lengthen the window past 30 days, or only shorten it? | Joy Joshua / PO | nothing — droppable without touching any other decision |
| Design note §2.4 — this story uses the existing `nowMs: () => number` idiom rather than migrating the middleware to `infra/clock`'s `Clock` interface. Converging the two clock idioms project-wide is a separate change | Joy Joshua / DEV | nothing |
| Design note §8, open item 3 — a GoTrue-side session timebox as defence in depth is out of scope here and would need its own ADR if ever pursued | Joy Joshua / DevOps / PO | nothing |

**Nothing here blocks D1.**

## Carried forward — does not block D1

| # | Item | Owner | Blocks |
| - | ---- | ----- | ------ |
| 1 | US-001's FR-18 (`last_seen_at` stamped on every request) is closed by this story, not by US-001 — reconciled in step 9 | DEV, in this PR | nothing |
| 2 | AC-04 becomes true of its three named flows (US-007, US-011, US-031) only once those stories add their own test citing `US-003/AC-04` | Manager → US-007/US-011/US-031 | their definitions of done |
| 3 | REQ-036's refresh-on-focus (US-012) will make any open tab renew its session with no human present — flag this when that story is scoped, it is a real consequence of sliding renewal | Architect / PO, at US-012 | nothing now |
| 4 | Whether deactivating an account (US-025) formally kills that user's live session remains open; step 3's existing refusal is the de facto answer today | Joy Joshua / PO | nothing |
