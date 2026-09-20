# US-027 — Reset somebody's password

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                       |
| ----------------- | --------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-027-reset-somebodys-password.md`   |
| **Traces to**     | REQ-021, BR-001.12, BR-001.17, V-12                                   |
| **Screen**        | SCR-008 — People (ST-10, ST-11, ST-12, ST-13, ST-15)                  |
| **Covering ADRs** | none yet — a design note is expected before implementation (Complex)  |
| **Tier**          | Complex                                                               |
| **Status**        | implemented                                                           |
| **Updated**       | 2026-09-20                                                            |

## Problem

Today `AccountRowMenu`'s **Reset password** item is `aria-disabled` — it is the one item ADR-010 forecast and never wired (`apps/ui/src/screens/people/AccountRowMenu.tsx:36-37`). There is no server endpoint that mints a new credential for an existing account, no client dialog that shows a generated password exactly once, and no way to re-arm `must_change_password` on an account that is already active. The system must instead: accept an Admin-only request naming an account, generate a V-12-compliant password server-side, write it to that account's Supabase Auth credential (invalidating the old one immediately), re-arm `must_change_password`, and return the plaintext password to the caller exactly once, on this one response, never persisted or logged anywhere.

## Functional requirements

| ID     | Requirement                                                                                                                                    | Priority | Serves        | Status      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------- | ----------- |
| FR-01  | `POST /api/admin/users/:id/reset-password` generates a V-12-compliant password server-side and sets it as that account's Supabase Auth credential | Must     | AC-01          | not started |
| FR-02  | The confirmation dialog (ST-10) states, before the reset happens: a new password will be generated and shown once, it is not emailed, the current password stops working immediately, and the person will be asked to choose their own at next sign-in | Must     | AC-02          | not started |
| FR-03  | On success, the dialog shows the new password exactly once in a monospaced, read-aloud-legible field (ST-11), with a **Copy** control that confirms in place | Must     | AC-03          | not started |
| FR-04  | The shown-once result dialog cannot be dismissed by Escape, an outside click, or a close icon — only **Done** closes it, and nothing else on the screen is reachable until then | Must     | AC-04          | not started |
| FR-05  | Once the result dialog is dismissed, the password is retrievable nowhere in the interface — a second reset is the only way to produce a new one | Must     | AC-05          | not started |
| FR-06  | The account's previous password is refused at sign-in immediately after a reset                                                                | Must     | AC-06          | not started |
| FR-07  | After a reset, the account's `must_change_password` flag is (re-)armed so the person is sent to **Set your password** before anything else, on next sign-in | Must     | AC-07          | not started |
| FR-08  | The generated password is never sent in any outbound email and never appears in any persistent log or audit record                             | Must     | AC-08          | not started |
| FR-09  | While a reset is in flight the dialog shows busy with Escape suppressed (ST-12); on failure, nothing has changed and the dialog says so (ST-13), the previous password still works | Must     | AC-09          | not started |
| FR-10  | Resetting an account that is already mid-forced-change (from a prior reset or from account creation) replaces the still-forced password; the forced-change requirement remains armed | Must     | AC-10          | not started |
| FR-11  | Only a signed-in Admin may call the reset endpoint; an Employee session (including resetting their own password) is refused with `403 admin_only` | Must     | AC-11          | not started |

## Non-functional requirements

| ID     | Requirement                                                                                   | Serves    |
| ------ | ----------------------------------------------------------------------------------------------- | --------- |
| NFR-01 | The response carrying the plaintext password sets `Cache-Control: private, no-store`, matching every other PII-bearing admin response | AC-08     |
| NFR-02 | Every screen width already drawn for SCR-008 (360/768/1280) renders ST-10–ST-13 and ST-15's reset item without horizontal scroll or truncation of the credential | NFR-004   |

## Technical constraints

- `modules/users` may not import `modules/auth` (`eslint.config.mjs:12-22` at the repository root, `MAY_IMPORT.users = ['notifications']`). The Supabase Auth write for the new password is a new method on `apps/api/src/modules/users/users.adapter.ts`'s `UsersAuthAdapter`, mirroring `updateEmail`'s "translate a GoTrue error into a typed outcome, never throw" shape (`users.adapter.ts:116-135`) — it does not call or extend `auth.adapter.ts`. `auth.adapter.ts:110-136` already has a `setPassword` making the identical GoTrue call; the new method is a required duplication across the module boundary (design note §4.1), and must mirror its log-line discipline verbatim.
- **Per the Architect design note's blocker finding (F1), the write order is `armMustChangePassword` (the `user_profiles` write) first, then `usersAuth.setPassword` (the Supabase Auth write) second** — the reverse of the order originally planned. This follows `updateAccount`'s own established order (`users.service.ts:231-304`, ADR-012) and is recorded as D-06 in `decisions.md`. There is no preceding `findById`: the write to `user_profiles` is itself the existence check, `RETURNING` the columns needed for the response (mirroring `activateAccount`, `users.repository.ts:461-471`).
- The password must be generated **server-side** (the story's own API-impacts section, not client-supplied) — it cannot reuse `apps/ui/src/lib/generate-password.ts` as-is (browser code, wrong side of the UI/API boundary). A new pure generator function is added under `apps/api/src/domain/`, alongside the module's other pure rule functions (`booking-window.ts`, `sign-in-failure-delay.ts`), built on the same `evaluatePasswordPolicy` self-check `generate-password.ts` already uses (`libs/contracts/src/password.ts:25-33`).
- Per the human's decision (recorded as D-01 in `decisions.md`), the generator does **not** exclude the ambiguous glyphs (`1/l/I/0/O`) the create-path generator excludes — it satisfies V-12 only, relying on the mono, disambiguating font at ST-11 for legibility, matching the hi-fi design's own sample password (`q4Lm1I0oTz8v`, deliberately carrying all four glyphs).
- The response cannot reuse `adminUserSchema` (no field on it carries a raw credential) — a new response schema, `resetPasswordResponseSchema`, is added to `libs/contracts/src/users.ts`, additive-safe (not `.strict()`), matching every other response in that file. Its `password` field is `z.string().min(1)`, **not** `newPasswordSchema` (design note §6, F2) — re-validating a credential the server has already set would turn a policy change into an unrecoverable account.
- The server-side generator (`apps/api/src/domain/generate-reset-password.ts`) takes its random-source function as a parameter rather than reaching for `crypto.getRandomValues` internally — `apps/api/src/domain/` is a declared-pure folder (`domain/README.md:3-4`) and a CSPRNG is exactly the nondeterminism that rule exists to keep out (design note §5.1, F3).
- `Dialog` (`apps/ui/src/components/dialog/Dialog.tsx`) gains one new prop, `dismissible?: boolean` (default `true`, per the human's decision, recorded as D-02) — an additive, backward-compatible change to a shared component's public props (the Complex-tier surface this change crosses). No existing caller's behaviour changes.
- No database migration: `must_change_password` already exists (`supabase/migrations/0001_user_profiles.sql:35`) and already defaults `true`; this story is the first to re-arm it on an account that is already active. The write is a new repository method, not a schema change.
- No `requireActingAdmin` / attribution column: the story does not ask for one, and `changeRole`'s route is the precedent for an admin write with no attribution (`admin.router.ts` role route, vs. the deactivate route's `requireActingAdmin`).
- Row-menu wiring follows `AccountRowMenu`'s existing one-item-at-a-time pattern (ADR-010): the "Reset password" item stops being `aria-disabled` and gains an `onResetPassword` handler, the same shape `onEdit`/`onChangeRole`/`onDeactivate` already take.

## Out of scope

- Self-service password reset for Employees — explicitly excluded this release (BRD-001 §10, AC-11).
- Printing or sending the generated password through any channel other than on-screen, copy-to-clipboard display (resolved in SCR-008's own open-questions log, 2026-09-07).
- Any change to `PasswordField`, `UserFormDialog`, or the account-creation password flow (US-021/US-022) — the reset path's generator is new and separate, not a shared refactor of `generate-password.ts`.
- Any change to how `must_change_password` behaves once a person signs in and sets their own password (US-004's flow) — this story only re-arms the flag; US-004 already handles clearing it.
