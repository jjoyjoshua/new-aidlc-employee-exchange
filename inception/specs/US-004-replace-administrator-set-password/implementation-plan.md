# US-004 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                                |
| --------- | ---------------------------------------------------------------------------------- |
| **Story** | `inception/stories/user-stories/US-004-replace-administrator-set-password.md`     |
| **Spec**  | `spec.md`                                                                          |
| **Tier**  | Complex                                                                            |

## Approval — Gate D1

| Field                | Value                                       |
| -------------------- | -------------------------------------------- |
| Status               | **approved**                                 |
| Approved by          | Joy Joshua <joy_j@trigent.com>               |
| Approved on          | 2026-09-18                                   |
| Plan commit approved | *uncommitted at approval* — base `d2c164d`   |

**On the SHA.** This package was approved in the working tree, before its first commit, same as
US-001's and US-002's were. The base it was read against is `d2c164d` (`main`, post US-003
merge), and the commit that introduces this package **is** the approved content —
`git diff d2c164d -- inception/specs/US-004-replace-administrator-set-password/implementation-plan.md`
shows exactly what was approved. Any edit after that commit needs a `change-log.md` row, and
check 16 enforces it. `Approved by` is the human's name and email from `git config user.name` /
`user.email`. The name is self-asserted, so it is attribution, not authentication.

## Before step 1 — what the branch looks like while this runs

`feat/US-004-replace-administrator-set-password` is red from the first commit until step 8 —
`aidlc-check` fails a `feat/US-###` branch with no AC-citing test, by design.

## Design reference

`design-note.md` (Architect, advisory) settles every open shape question: the endpoint contract
(§2), the `libs/contracts` slice (§3), the step-5 gate mechanism and its **three** exemptions
(§4), the V-15 probe and its revoke scope (§5), the write ordering (§6), and the browser guards
and components (§7). Steps below cite it by section rather than re-deriving it.

**Two human confirmations already stamped into `decisions.md`** (Gate D1, 2026-09-18): the five
password-handling constraints (D-06) and no revocation of other live sessions on success (D-05).
Both are binding on the steps below.

## Steps

Ordered. Test-first per acceptance criterion: the failing test named `... (US-004/AC-##)` comes
before the code that turns it green.

### Step 1 — V-12 policy, shared by both sides (design note §3.1)

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-17                                                                                                                        |
| Files    | `libs/contracts/src/password.spec.ts` (create, **first** — all five rules, independently, both ways); `libs/contracts/src/password.ts` (create — `PASSWORD_RULE_IDS`, `evaluatePasswordPolicy`, `newPasswordSchema`); `libs/contracts/src/index.ts` (modify — re-export) |
| Verify   | `npm test --workspace @desk-booking/contracts` — expected: every rule independently true/false, and a password missing any one rule fails `newPasswordSchema` |

### Step 2 — The endpoint shapes and the two new error codes (design note §3.1)

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-06, FR-18, FR-19                                                                                                          |
| Files    | `libs/contracts/src/auth.ts` (modify — `setPasswordRequestSchema`, `setPasswordResponseSchema`); `libs/contracts/src/error.ts` (modify — `password_same_as_current`, `password_change_not_required`); `libs/contracts/src/auth.spec.ts`, `error.spec.ts` (modify) |
| Verify   | `npm test --workspace @desk-booking/contracts` — expected: `setPasswordRequestSchema` rejects an unknown field (`.strict()`) and a `confirmPassword` field; the two new codes parse under `errorCodeSchema` |

### Step 3 — The auth-chain gate, test-first (design note §4.1–§4.2)

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-02, FR-03, FR-05                                                                                                   |
| Files    | `apps/api/src/http/middleware/require-session.spec.ts` (modify, **first** — the AC-02 table from design note §4.5: employee and admin with the mark set get `403 password_change_required` before `requireAdmin`; the exempt instance passes through regardless of the mark); `apps/api/src/http/middleware/require-session.ts` (modify — `passwordChangeGate: 'enforced' \| 'exempt'` required on `RequireSessionDeps`; step 5 written into the named seam) |
| Verify   | `npm test --workspace @desk-booking/api` — expected: an existing US-001/US-003 test still passes with `passwordChangeGate: 'enforced'` supplied explicitly (compile error otherwise); the new mark-set cases refuse with `403 password_change_required` |

### Step 4 — Composition wires both instances; `GET /session` moves to the exempt one (design note §4.3 — the finding)

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-04                                                                                                                        |
| Files    | `apps/api/src/composition.ts` (modify — `session` and `sessionForPasswordChange`, both named; `createAuthRouter` takes the exempt one) |
| Verify   | `npm run typecheck --workspace @desk-booking/api` — expected: compiles with both instances named and used; `apps/api/src/http/app.ts` untouched (design note §4.4) |

### Step 5 — The repository can clear the mark

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-12                                                                                                                        |
| Files    | `apps/api/src/modules/auth/auth.repository.ts` (modify — `clearMustChangePassword(id): Promise<void>`)                     |
| Verify   | `npm run typecheck --workspace @desk-booking/api` — no behaviour test yet; exercised end-to-end in step 7                    |

### Step 6 — The adapter can write a password (design note §6)

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-12, FR-13                                                                                                                 |
| Files    | `apps/api/src/modules/auth/auth.adapter.spec.ts` (modify, **first**); `apps/api/src/modules/auth/auth.adapter.ts` (modify — `AuthAdapter.setPassword(userId, newPassword)` via `supabase().auth.admin.updateUserById`; a rejection or throw maps to `unavailable`, same treatment `signInWithPassword` already gives a downstream failure) |
| Verify   | `npm test --workspace @desk-booking/api` — expected: a successful admin call resolves; a failure or throw resolves `{ kind: 'unavailable' }`, never rejects |

### Step 7 — The service: probe, revoke, write order — the story's core (design note §5, §6)

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-08, FR-09, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16                                                               |
| Files    | `apps/api/src/modules/auth/auth.service.spec.ts` (modify, **first** — not-required when the mark is clear; a probe that succeeds yields `same-as-current` **and** the probe's token no longer verifies afterwards (assert behaviour, not the mock — `testing-standards.md`); a probe that reports `unavailable` writes nothing; the write order — credential before mark, and a mark-clear failure still returns `ok`); `apps/api/src/modules/auth/auth.service.ts` (modify — `setPassword(userId, newPassword)` re-reads the profile itself, per design note §5.3) |
| Verify   | `npm test --workspace @desk-booking/api` — expected: all four outcomes (`ok`, `not-required`, `same-as-current`, `unavailable`) produced correctly; the probe's revoke call uses scope `'local'` (assert via the stub's token map, not a spy on the call) |

### Step 8 — The route: `POST /set-password`, and `GET /session` re-mounted (design note §2, §10)

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01–FR-16 (proven end-to-end)                                                                                             |
| Files    | `apps/api/src/modules/auth/auth.routes.spec.ts` (modify, **first** — the AC-06 sequence from design note §10: sign in with the old password, set-password, old password now `401`, new password `200` with the mark clear; AC-02's table against `/api/admin/*`; AC-03's `403 password_change_not_required` on an already-clear mark; AC-08's sign-out-mid-flow-then-sign-in-again sequence, plus `GET /session` still reachable with the mark set); `apps/api/src/modules/auth/auth.router.ts` (modify — `POST /set-password` parses `setPasswordRequestSchema`, calls the service, shapes the response/errors per design note §2.4) |
| Verify   | `npm test --workspace @desk-booking/api` — expected: every row of design note §10's API-level table passes against the real `createApp`, not a hand-built Express app |

**Branch turns green here** — every server-side AC (AC-02, AC-03, AC-05, AC-06, AC-08) has a
passing API-level test as of this step.

### Step 9 — `landingPathFor` — one function, three call sites (design note §7.1)

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-20                                                                                                                        |
| Files    | `apps/ui/src/lib/auth/landing.spec.ts` (create, **first** — four `(mustChangePassword, role)` inputs, four outputs); `apps/ui/src/lib/auth/landing.ts` (create); `apps/ui/src/screens/sign-in/SignIn.tsx` (modify — `navigate(landingPathFor(result.user), { replace: true })` replaces the inline role ternary); `apps/ui/src/screens/sign-in/SignIn.spec.tsx` (modify — a mark-set user lands on `/set-password`) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected: `landing.spec.ts` covers all four combinations; `SignIn.spec.tsx`'s existing role-routing assertions still pass plus the new mark-set case |

### Step 10 — The two browser guards, exact complements (design note §7.2)

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-21, FR-22, FR-23                                                                                                          |
| Files    | `apps/ui/src/lib/auth/require-session.spec.tsx` (modify, **first** — a mark-set user redirects to `/set-password`, screen never mounts); `apps/ui/src/lib/auth/require-session.tsx` (modify — the mark redirect); `apps/ui/src/lib/auth/require-password-change.spec.tsx` (create, **first** — the complement invariant over all four `(user, mark)` combinations); `apps/ui/src/lib/auth/require-password-change.tsx` (create); `apps/ui/src/routes.tsx` (modify — `/set-password`, outside the shell) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected: for every `(user, status)` pair, exactly one of the two guards renders its children |

### Step 11 — `setPassword` on the auth context (design note §7.3)

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-24                                                                                                                        |
| Files    | `apps/ui/src/lib/auth/auth-context.spec.tsx` (modify, **first** — `ok` sets `user` with the mark cleared before resolving; `password_same_as_current` maps to `same-as-current`; every other failure maps to `failed`); `apps/ui/src/lib/auth/auth-context.tsx` (modify — `setPassword(newPassword)`) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected: the three-outcome mapping in design note §7.3 holds exactly            |

### Step 12 — `policy-checklist`, a new shared component (design note §7.4)

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-25, NFR-02                                                                                                                |
| Files    | `apps/ui/src/components/policy-checklist/PolicyChecklist.spec.tsx` (create, **first** — met/pending/blocking render distinct icon+text, never colour alone; the live region announces a rule as it becomes met); `apps/ui/src/components/policy-checklist/PolicyChecklist.tsx`, `policy-checklist.css` (create) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected: all three statuses covered per rule; `aria-live="polite"` present       |

### Step 13 — `toast`, the smallest thing that makes ST-05 exist (design note §7.5)

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-28                                                                                                                        |
| Files    | `apps/ui/src/components/toast/Toast.spec.tsx` (create, **first**); `apps/ui/src/components/toast/Toast.tsx`, `toast.css` (create — `role="status"`, one dismiss control, no auto-dismiss timer per `decisions.md` open item 2) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected: renders children, `role="status"`, dismiss control present and functional |

### Step 14 — The screen: all six states (design note §7.6)

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-26, FR-27                                                                                                                 |
| Files    | `apps/ui/src/screens/set-password/SetPassword.spec.tsx` (create, **first** — ST-01 pending checklist and focused field; ST-02 blocking rules + mismatch message + no request sent + focus management; ST-03 both fields cleared + assertive alert; ST-04 busy button, read-only fields, no double submit; ST-05 navigation with toast state; ST-06 fields retain contents; the **Sign out** control present and functional, test citing both `US-004/AC-08` and `US-002/AC-04` per US-002's design note §7 obligation); `apps/ui/src/screens/set-password/SetPassword.tsx`, `set-password.css` (create) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected: all six states pass; the navigation call and the state update happen in the same continuation (design note §7.6 — no `setTimeout`, no extra `await` between them) |

### Step 15 — The destination screens render the toast (design note §7.5)

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-28                                                                                                                        |
| Files    | `apps/ui/src/screens/my-bookings/MyBookings.tsx`, `MyBookings.spec.tsx` (modify); `apps/ui/src/screens/all-bookings/AllBookings.tsx`, `AllBookings.spec.tsx` (modify) — render the toast when `location.state.toast === 'password-saved'`, then clear it with a replace navigation |
| Verify   | `npm test --workspace @desk-booking/ui` — expected: the toast renders once from navigation state and does not replay on a subsequent render |

### Step 16 — Standards and architecture docs stay true (design note §4.3, §8)

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | —                                                                                                                            |
| Files    | `inception/architecture/app-architecture.md` (modify — §5.1 step 4 names three exemptions: the password-change route, `GET /api/auth/session`, and sign-out); `ai/standards/api-standards.md` (modify — the `422` row gains V-15; the `403` section's exemption list gains the mirror code) |
| Verify   | Manual read — both documents describe the system as it now is, the same treatment ADR-003 and US-002 gave their own consequential edits |

### Step 17 — Traceability, the manifest, and the gate

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | —                                                                                                                            |
| Files    | `inception/specs/US-004-replace-administrator-set-password/traceability.md` (fill every `FR-##`/`NFR-##` row); `knowledge/traceability/manifest.json` (modify — `US-004.tests[]`, currently empty; add `SCR-001`, `SCR-002`, `SCR-005` to `US-004.screens[]` per design note open item 7 — AC-06 refuses on SCR-001 ST-04, AC-07 lands on SCR-002/SCR-005; add `US-004` to `SCR-001.stories[]`, `SCR-002.stories[]`, `SCR-005.stories[]`); `inception/specs/index.md` (add the US-004 row, status `implemented` at merge) |
| Verify   | `npm run lint && npm run typecheck && npm test && node tools/aidlc-check.mjs` — expected: all green, and the check no longer reports US-004 as a story with no AC-citing test |

## Required before this story is called done — not a code step

**Done — 2026-09-18.** A manual check was run against the real Supabase project (design note
§6.4): create a throwaway user, sign in, capture the access token, call
`auth.admin.updateUserById` with the exact arguments `auth.adapter.ts` uses, then retry
`auth.getUser` with the **same** token.

**Result: the token was revoked.** AC-07 would have failed on the first real user despite every
test above being green. The fix specified in design note §6.4 for exactly this outcome is
implemented as **step 18** below, with its own `decisions.md` row (D-12).

### Step 18 — the re-sign-in fallback, test-first (design note §6.4, confirmed)

| Field    | Value                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-15                                                                                                                        |
| Files    | `libs/contracts/src/auth.ts` (modify — `setPasswordResponseSchema` gains an optional `session`), `auth.spec.ts` (modify, first); `apps/api/src/modules/auth/auth.service.ts` (modify — re-sign-in after a successful write, best-effort), `auth.service.spec.ts` (modify, first); `apps/api/src/modules/auth/auth.router.ts` (modify — the response carries `session` when present); `auth.routes.spec.ts` (modify, first — the AC-06 sequence now also proves the OLD token is refused and the NEW one returned in the response works); `apps/ui/src/lib/auth/auth-context.tsx` (modify — `setPassword` stores a returned session exactly as `signIn` does), `auth-context.spec.tsx` (modify, first) |
| Verify   | `npm run lint && npm run typecheck && npm test && node tools/aidlc-check.mjs` — expected: all green; the AC-06 sequence test proves the pre-change token is refused and the response's session works |

## Rollback

Revert the PR. No migration exists to roll back — `must_change_password` already existed before
this story and this story only reads and clears it. Any account whose mark was cleared by this
code before a revert keeps a self-chosen password; that is not a defect a revert needs to undo.

## Open questions

| Question | Owner | Blocks |
| -------- | ----- | ------ |
| D-09 (`decisions.md`) — V-12's "special character" and length-counting definitions | Joy Joshua → `/ba` | nothing |
| Decisions open item 2 — toast dismissal: control only, or also a timer | `/ux` | nothing |

**Nothing here blocks D1.** Both are confirmations of a default already argued in `decisions.md`,
not decisions the plan is waiting on.

## Carried forward — does not block D1

| # | Item                                                                                                    | Owner                    | Blocks              |
| - | ----------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------- |
| 1 | The V-15 probe produces a failed Supabase sign-in event on every good password choice; must be excluded from any future lockout rule (US-001 open item 3) | Joy Joshua / PO           | a future lockout decision |
| 2 | Set-password requests widen the surface of US-001 open item 3 (no auth rate limit) — gap unchanged        | Joy Joshua / PO / DevOps  | Gate 3               |
| 3 | US-002 §7's debt — the SCR-010 sign-out link with a test citing `US-002/AC-04` — closed in step 14 of this PR | DEV, this PR              | US-002's definition of done |
| 4 | US-001 open item 10 — "US-004 must land before any booking story" — closes on this story's merge; tell the Manager | Manager                   | delivery order       |
