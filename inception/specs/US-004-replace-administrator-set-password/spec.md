# US-004 — Replace an administrator-set password at first sign-in

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-004-replace-administrator-set-password.md`     |
| **Traces to**     | REQ-029, BR-001.17, V-12, V-15                                                     |
| **Screen**        | SCR-010 (ST-01–ST-06); destinations SCR-002 / SCR-005 for AC-07; SCR-001 ST-04 for AC-06 |
| **Covering ADRs** | ADR-001, ADR-002, ADR-003 — no new ADR (design note §8)                           |
| **Tier**          | Complex                                                                            |
| **Status**        | draft                                                                              |
| **Updated**       | 2026-09-18                                                                         |

## Problem

`must_change_password` already exists on `user_profiles` (default `true`, written by US-001 for
this story), the wire already carries `mustChangePassword`, and `require-session.ts` already
names step 5 as this story's seam — but nothing reads the flag yet. Today an administrator-set
credential is unrestricted after sign-in: every screen is reachable, there is no route to change
a password at all, and the flag never clears.

What the system must do instead: refuse every other application function while the flag is set
(server-enforced, not merely a client redirect), offer exactly one place to clear it
(`POST /api/auth/set-password`, and only there), enforce the five-rule password policy (V-12) and
the no-reuse rule (V-15) before writing anything, and do all of this without ever leaving the
account without a working credential — the administrator-set password must keep working right up
until a new one is confirmed and accepted.

The business case is in the story. This does not restate it. The full design reasoning — the
step-5 gate mechanism, the V-15 probe, the write ordering, the browser guards — is in
`design-note.md`; this file is its functional-requirement breakdown.

## Functional requirements

### The gate (server)

| ID    | Requirement                                                                                                                   | Priority | Serves | Status      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------- |
| FR-01 | `requireSession` step 5 refuses with `403 password_change_required` when `must_change_password = true`, on every mount that takes the **enforced** chain instance | Must     | AC-02  | not started |
| FR-02 | The gate runs `requireSession` steps 1–4 first — an invalid, expired or inactive session is still refused by its own code, never masked by the password gate | Must     | AC-02  | not started |
| FR-03 | The gate precedes `requireAdmin` on `/api/admin/*` — an admin with the mark set gets `403 password_change_required`, not `admin_only` | Must     | AC-02  | not started |
| FR-04 | `POST /api/auth/set-password` and `GET /api/auth/session` run the **exempt** chain instance — both reachable with the mark set, both still requiring a valid session | Must     | AC-02, AC-08 | not started |
| FR-05 | The exemption is a required constructor argument (`passwordChangeGate: 'enforced' \| 'exempt'`) on `requireSession`, never a route-string allowlist | Must     | —      | not started |

### The endpoint

| ID    | Requirement                                                                                                                   | Priority | Serves | Status      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------- |
| FR-06 | `POST /api/auth/set-password` accepts `{ newPassword }` only, `.strict()`; no `confirmPassword`, no account identifier in the body | Must     | AC-04  | not started |
| FR-07 | The body is validated against `newPasswordSchema` (V-12, all five rules) before anything else runs; a failure answers generic `400 invalid_request` with no issue list and no echo of the value | Must     | AC-04  | not started |
| FR-08 | If `must_change_password` is already `false` for the caller, the route answers `403 password_change_not_required` and writes nothing | Must     | AC-03  | not started |
| FR-09 | Before writing, the service probes the candidate password with `AuthAdapter.signInWithPassword`; success means it equals the administrator-set password, and the route answers `422 password_same_as_current` | Must     | AC-05  | not started |
| FR-10 | A probe session that succeeds is revoked immediately with scope `'local'` through the existing `AuthAdapter.revokeSession` — never `'global'`, and never left unrevoked | Must     | —      | not started |
| FR-11 | A probe that cannot reach Supabase answers `503 service_unavailable` and writes nothing — V-15 fails closed | Must     | —      | not started |
| FR-12 | On success: the credential is written first (`auth.admin.updateUserById`), the `must_change_password` flag is cleared second — never the reverse | Must     | AC-06, AC-08 | not started |
| FR-13 | A failure writing the credential answers `503`/`500` and changes nothing — the administrator-set password and the mark both remain exactly as they were | Must     | AC-08  | not started |
| FR-14 | A failure clearing the mark after a successful credential write still answers `200` — the credential change is real and must not be reported as failed; the account is logged at `error` and the server-side gate remains authoritative on the next request | Must     | —      | not started |
| FR-15 | On success the route answers `200 { user, session? }` with `mustChangePassword: false`; `session` is a fresh one, present whenever the server's own re-sign-in with the new password succeeded — required because the credential write itself revokes the caller's prior access token (confirmed 2026-09-18 against the real Supabase project; design note §6.4) | Must     | AC-06, AC-07 | not started |
| FR-16 | No other live session is revoked on a successful change — only the probe session (FR-10) | Must     | —      | not started |

### Contract (`libs/contracts`)

| ID    | Requirement                                                                                                                   | Priority | Serves | Status      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------- |
| FR-17 | `evaluatePasswordPolicy` and `newPasswordSchema` are exported from `libs/contracts/src/password.ts`, usable by both the browser and the route from one definition | Must     | AC-04  | not started |
| FR-18 | `setPasswordRequestSchema` and `setPasswordResponseSchema` are exported from `libs/contracts/src/auth.ts` | Must     | —      | not started |
| FR-19 | `password_same_as_current` and `password_change_not_required` are added to the shared error-code enum | Must     | AC-05, AC-03 | not started |

### The browser

| ID    | Requirement                                                                                                                   | Priority | Serves | Status      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------- |
| FR-20 | `landingPathFor(user)` decides the one destination for a signed-in user (`/set-password` when the mark is set, else the role's home); `SignIn.tsx` uses it in place of its current inline ternary | Must     | AC-01  | not started |
| FR-21 | `RequireSession` redirects to `/set-password` when the current user's mark is set, before rendering the shell's children | Must     | AC-02  | not started |
| FR-22 | A new `RequirePasswordChange` guard redirects away from `/set-password` (to `landingPathFor(user)`) when the mark is **not** set, and renders the screen otherwise | Must     | AC-03  | not started |
| FR-23 | `/set-password` is registered in `routes.tsx`, outside the shell's route element (no `app-shell` on this screen) | Must     | AC-01, AC-02, AC-03 | not started |
| FR-24 | `AuthContextValue` gains `setPassword(newPassword)`, returning `{ kind: 'ok' \| 'same-as-current' \| 'failed' }`; on `ok` it sets `user` from the response before returning | Must     | AC-04–AC-07 | not started |
| FR-25 | A new shared `policy-checklist` component renders five per-rule statuses (`met \| pending \| blocking`), never colour alone, with a live region announcing each rule as it is met | Must     | AC-04  | not started |
| FR-26 | The **Set your password** screen (SCR-010) implements ST-01–ST-06 exactly as specified — pending checklist on load, blocking on a refused submit, both fields cleared on ST-03, contents retained on ST-06, busy-but-labelled button on ST-04 | Must     | AC-04, AC-05, AC-06 | not started |
| FR-27 | A **Sign out** control is present on SCR-010, beneath the card, calling the existing `signOut()` | Must     | AC-08  | not started |
| FR-28 | A new shared `toast` component carries the "Password saved" confirmation onto the destination screen (SCR-002 or SCR-005) via navigation state, cleared after one render | Must     | AC-07  | not started |

## Non-functional requirements

| ID     | Requirement                                                                                   | Serves |
| ------ | ----------------------------------------------------------------------------------------------- | ------ |
| NFR-01 | No password — request body, probe candidate, or stored value — is ever written to a log line (§0, task-surfaces.md `§Escalate`) | RISK-005 |
| NFR-02 | The checklist and any invalid-field styling are conveyed by icon and text, never colour alone (NFR-008) | AC-04 |

## Technical constraints

- **No migration.** `must_change_password` already exists, defaulting `true` (`0001_user_profiles.sql`).
- **V-12 is evaluated by one function**, shared verbatim between the browser's live checklist and the server's edge validation — never two copies of the same five regexes (design note §3.2).
- **The `confirmPassword` field never crosses the wire.** The mismatch check is client-only (design note §2.2).
- **`requireSession`'s password-change exemption is a required constructor argument**, never a request-path string comparison (design note §4.2).
- **The V-15 probe's revoke scope is `'local'`, never `'global'`** — `'global'` would sign the user out of the very screen they are trying to complete (design note §5.1).
- **Write the credential before clearing the mark, never the reverse** (design note §6.2) — the only ordering under which every partial failure is recoverable.
- **`apps/api/src/http/app.ts` is not modified** — composition hands each mount the chain instance it needs (design note §4.4).

## Out of scope

- **No voluntary password change.** BRD-001 §10 excludes it; AC-03 is what makes the exclusion testable.
- **No password history.** Reusing a previously-used (not the current) password is allowed.
- **No admin-facing reset (US-027) or account creation (US-021).** This story only consumes the mark; `newPasswordSchema` is exported so those stories inherit the rule rather than re-derive it.
- **No lockout, rate limit, or password-strength meter.** Unchanged from US-001 open item 3 — though the V-15 probe widens that gap's surface (design note §5.4, carried as an open item).
- **No toast provider, queue, or auto-dismiss timer.** One component, one message, dismissed by the reader (design note §7.5).
- **No revocation of the user's other live sessions on success** (confirmed with the human at Gate D1 — see `decisions.md`).
