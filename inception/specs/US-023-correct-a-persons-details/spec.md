# US-023 — Correct a person's name or email

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                   |
| ----------------- | ------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-023-correct-a-persons-details.md` |
| **Traces to**     | REQ-019, BR-001.10, V-10                          |
| **Screen**        | SCR-009 — User form (ST-02, reusing ST-03/04/06/08 as built by US-021) |
| **Covering ADRs** | ADR-002, ADR-004, ADR-009, ADR-010, ADR-011, **ADR-012** |
| **Tier**          | Complex                                           |
| **Status**        | implemented                                       |
| **Updated**       | 2026-09-20                                        |

## Problem

Today an account's name and email can only be set at creation (`POST /api/admin/users`, US-021). There
is no way to correct a typo afterwards. The system must gain an admin-only update path that changes
`full_name`/`email` on an existing account, refuses an email already held elsewhere (including by a
deactivated account), and keeps that account's identity, role, active state, booking history, password
and administrator-set flag untouched. Because email is also the Supabase Auth sign-in identifier, a
changed email must be written to both `user_profiles` and Supabase Auth with no shared transaction
between them — the ordering and compensation ADR-012 settles.

## Functional requirements

| ID    | Requirement                                                                                                                 | Priority | Serves | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------- |
| FR-01 | Saving a changed full name and/or email on an existing account updates the stored row; `id`, `role`, `isActive` and booking history are unchanged and the new values appear in the people list | Must     | AC-01  | implemented |
| FR-02 | Saving an email already held by another account — active or deactivated — is refused; the refusal names that account and whether it is deactivated, and the edited account is unchanged | Must     | AC-02  | implemented |
| FR-03 | Saving the edit form with the email left unchanged is never refused as a collision with itself | Must     | AC-03  | implemented |
| FR-04 | An empty name, an empty email, or an email that is not a plausible address is caught in the browser before any request is sent; the offending field is marked with the reason in text | Must     | AC-04  | implemented |
| FR-05 | After a successful email change, the person's next sign-in succeeds with the new address; the old address no longer signs them in | Must     | AC-05  | implemented |
| FR-06 | After a successful email change, a subsequent booking event for that person is addressed using the account's current email | Should   | AC-06  | implemented |
| FR-07 | Saving a name and/or email change never writes the password hash and never sets the account's administrator-set flag | Must     | AC-07  | implemented |
| FR-08 | A save in flight is guarded against a double submit; a save that fails for a reason other than a duplicate retains the entered values, changes nothing server-side, and offers a retry | Must     | AC-08  | implemented |
| FR-09 | A signed-in Employee attempting to change any account's details is refused | Must     | AC-09  | implemented |

## Non-functional requirements

None beyond what SCR-009's shared components (`Dialog`, `TextField`, `Alert`) already satisfy for
NFR-004 (mobile) and NFR-008 (non-colour signalling) — inherited from US-021's build, not re-earned
here.

## Technical constraints

- **Write order is `user_profiles` then Supabase Auth, reversed from create** (ADR-012). Supabase Auth
  is not called at all when the normalised email is unchanged.
- **A failed Auth write, after a successful profile write, compensates** by restoring both the prior
  `fullName` and prior `email` to `user_profiles` — never a partial revert — logged, never thrown, never
  surfaced to the caller (ADR-012, ADR-011 item 3).
- **`usersAuthAdapter.deleteAccount` is never called from this path.** `user_profiles.id` is
  `on delete cascade`; calling it here would destroy the profile row and everything keyed to it
  (ADR-012 Decision item 3).
- **The Auth call is `updateUserById(id, { email, email_confirm: true })` and constructs no `password`
  key.** The adapter method is named `updateEmail`, not `updateAccount`.
- **`updateProfileDetails` names exactly `full_name`, `email`, `updated_at`** — never
  `must_change_password`, never `is_active`.
- **`userUpdateSchema` is declared independently of `createAccountRequestSchema`**, sharing extracted
  `fullNameSchema`/`emailSchema` — not `.omit()` from the create schema, so a future required create
  field cannot silently appear on edit.
- **A duplicate-email refusal reuses `emailTakenDetailsSchema` verbatim** — no new details schema.
- **Admin-only enforcement is inherited from the existing `/api/admin` mount** (`requireAdmin`); no
  per-route guard is added.
- **`RadioGroup` gains an `aria-disabled` path, not native `disabled`**, for SCR-009 ST-02's role
  radios — ADR-010's established pattern, since a role change is US-024's and this form cannot save one.
- **`updated_at` is written on every successful update**, from one `nowMs()` reading threaded through
  the service — the column's first writer in this codebase.

## Out of scope

- **Changing a role** from this form — US-024's story, including the last-admin refusal (SCR-009 ST-05).
- **Ending the signed-in session** when that person's own email changes — BRD-001 says nothing about
  it; nothing is invented.
- **Re-notifying past or already-sent booking events** after an email change — only future events use
  the new address.
- **An operator repair path for a diverged Auth/profile email** — ADR-012 declines to build one
  speculatively, the same call ADR-011 made for a create-time orphan.
- **Self-service profile editing** — BR-001.11 confines this form to administrators; there is no
  self-service path anywhere in this release.
