# US-021 — Create a user account

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                   |
| ----------------- | ------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-021-create-a-user-account.md` |
| **Traces to**     | REQ-018, REQ-004, REQ-033, BR-001.10, BR-001.17, V-10, V-12, V-18 |
| **Screen**        | SCR-009 — User form. ST-01 Create — default, ST-03 Field validation error, ST-04 Duplicate email, ST-06 Saving, ST-07 Saved, ST-08 Save failed, ST-09 Create — all rules met. ST-02 (Edit) and ST-05 (last-admin refusal) belong to US-023/US-024 — this story never opens the form in edit mode |
| **Covering ADRs** | ADR-011 (proposed) — write ordering and compensation across Supabase Auth and Postgres, see `design-note.md` |
| **Tier**          | Complex |
| **Status**        | approved (Gate D1, 2026-09-20); Architect design note received — ready for implementation |
| **Updated**       | 2026-09-20 |

## Problem

Today `POST /api/admin/users` does not exist — `modules/users` only reads (`users.repository.ts` has `listAccounts`/`getSummaryCounts`, US-020). Nothing in the codebase creates a Supabase Auth user; every existing Auth call (`auth.adapter.ts`) either verifies a credential or overwrites one on an account that already exists. The People screen (`People.tsx:147`, `:237`) already renders an **Add person** button, twice, with no `onClick` — a stub left for this story. No form component for a person exists; `DeskFormDialog.tsx` is its closest sibling in shape but has no password field, no role choice, and no generated-value control. No `RadioGroup`/`RadioOption` component exists in `apps/ui/src/components` (verified — the folder holds no `radio*` entry), and no password-generation utility exists anywhere in the repo (verified — no match for `generatePassword`/`Suggest a password` outside SCR-009's own spec prose).

The system must let a signed-in administrator create an account — name, email, one role, an initial password meeting V-12 — from a new form reachable from the People screen, refuse a duplicate email by naming who holds it, and mark the account so the forced-change flow (US-004) engages on its first sign-in.

## Functional requirements

| ID     | Requirement                                                                                                                                       | Priority | Serves        | Status      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------- | ----------- |
| FR-01  | `POST /api/admin/users` accepts `{ fullName, email, role, password }`, admin-only (inherited from the `/api/admin` mount, no per-route check), and creates one account with exactly the submitted role | Must     | AC-01, AC-02, AC-12 | not started |
| FR-02  | `role` is the existing `userRoleSchema` (`employee` \| `admin`) — the same two-value enum SCR-009's two radio options represent; no third value, no both       | Must     | AC-02          | not started |
| FR-03  | `password` is parsed at the edge with the existing `newPasswordSchema` (V-12, all five rules); a request failing it is refused `400 invalid_request` before any account is touched | Must     | AC-03          | not started |
| FR-04  | The form's `PolicyChecklist` renders the same five rules, in the same three looks (`pending`/`blocking`/`met`) SCR-010 already uses, driven by the same `evaluatePasswordPolicy` | Must     | AC-03, AC-04   | not started |
| FR-05  | A **Suggest a password** control generates a value that passes `evaluatePasswordPolicy` and excludes `1`/`l`/`I`/`0`/`O`, and reveals it immediately | Should   | AC-04 (REQ-033, V-18) | not started |
| FR-06  | Required-field and email-shape checks happen in the browser before any request is sent, mirroring `DeskFormDialog`'s client-side validation | Must     | AC-05          | not started |
| FR-07  | A duplicate email (case-insensitive, active or deactivated) is refused `409 email_taken` naming the existing holder and, if deactivated, pointing at reactivation instead — no account is created | Must     | AC-06          | not started |
| FR-08  | The create form states, before saving, that the person will be asked to choose their own password at first sign-in | Must     | AC-07          | not started |
| FR-09  | A created account's `must_change_password` is `true` — the `user_profiles` column default (`0001_user_profiles.sql:35`), never written explicitly, exactly as `is_active`'s default already goes unwritten by `desks.repository.ts`'s own insert | Must     | AC-08          | not started |
| FR-10  | The success confirmation repeats the delivery instruction, naming the person | Must     | AC-09          | not started |
| FR-11  | No code path emails the created password to anyone — the notifications module is untouched by this story | Must     | AC-10          | not started |
| FR-12  | A save in flight is guarded (double-submit produces at most one account); a non-duplicate, non-validation failure retains every typed value, including the password, and offers a retry | Must     | AC-11          | not started |
| FR-13  | An Employee session reaching `POST /api/admin/users` is refused before this router is reached at all (the existing `requireAdmin` mount) | Must     | AC-12          | not started |

## Non-functional requirements

| ID     | Requirement                                                                                             | Serves          |
| ------ | --------------------------------------------------------------------------------------------------------- | ---------------- |
| NFR-01 | Every password rule and every field error is carried by an icon and a text message, never colour alone (NFR-008) | AC-03, AC-04, AC-05 |
| NFR-02 | Eight form states drawn and built at 360/768/1280 (NFR-004), including the keyboard-raised frame that proves the checklist stays visible while the password field is focused | AC-03, AC-04 |
| NFR-03 | `POST /api/admin/users`'s response is never cached (`Cache-Control: private, no-store`), matching `GET /api/admin/users`'s own convention for the same PII | — |

## Technical constraints

- `modules/users`'s first **write**. Mounted at `/api/admin/users` inside the existing `createAdminRouter` (`admin.router.ts:57`), which is itself mounted behind `requireSession, requireAdmin` at `app.ts:78` — no per-route role check is added, following the same reasoning `admin.router.ts:60-65` and `:93-107` already state for the routes beside it.
- Password writes never touch a local hashing library — none exists in this repo (verified: no `bcrypt`/`argon2`/`scrypt` match anywhere under `apps/api/src`, `libs`, `supabase`). Supabase Auth (GoTrue) owns the credential entirely, via the **service-role** client — the new call is `supabase().auth.admin.createUser({ email, password, email_confirm: true })`.
- **`modules/users` may not import `modules/auth`** — enforced in code, not just documented: `eslint.config.mjs:16-22`'s `MAY_IMPORT.users = ['notifications']` forbids it, and that file is itself a protected path ("any change here is Complex"). So the new Auth call cannot live in or be reused from `auth.adapter.ts`. It lives in a new `apps/api/src/modules/users/users.adapter.ts`, calling `infra/supabase` directly — the same client, the same "translate a GoTrue error into a typed outcome, never throw" shape `auth.adapter.ts:121-136` already uses for `setPassword`, just not that file. `decisions.md` D-06.
- Account creation is **two systems, not one**: an `auth.users` row (GoTrue) and a `user_profiles` row (this app's Postgres schema) with no DB trigger linking them (verified — `0001_user_profiles.sql` defines no trigger, and no trigger file exists anywhere under `supabase/`). The order, and what happens if the second write fails after the first succeeds, is exactly the kind of system-shape trade-off `ai/roles/dev.md` reserves for the Architect — see `implementation-plan.md` Open questions.
- Duplicate detection reads `user_profiles` directly (a `citext` exact match on the normalised email — BR-001.10, `user_profiles_email_key`) **before** ever calling Supabase Auth. This is a **message-composition read, not the uniqueness arbiter** — two indexes (GoTrue's on `auth.users.email`, and `user_profiles_email_key`) actually arbitrate a real concurrent race, the same property `desks.repository.ts` states for its own insert. The pre-check exists because it is the only way to learn the colliding account's name and active state, which AC-06/ST-04 must render, before ever touching Auth. A genuine race is still handled — `users.service.ts` re-reads on a race-duplicate from the Auth adapter (design note §2.4). `decisions.md` D-02, design note §2.7.
- Email normalisation (`trim().toLowerCase()`) happens once, in the request schema's `.transform`, the same shape `deskNumberSchema` already establishes for desk numbers (`libs/contracts/src/desks.ts:98-104`) — the parsed value is both what gets checked for a duplicate and what gets stored, so there is no second place to remember to normalise. `decisions.md` D-01.
- `RadioGroup`/`RadioOption` do not exist yet (verified: `apps/ui/src/components` has no `radio*` folder). SCR-009's own design note (spec line 179) already calls the option component "the library's `Radio option`," signalling a shared component rather than one private to this screen. `decisions.md` D-03.
- No password-generation utility exists yet (verified — no match anywhere in the repo). `decisions.md` D-04.
- Response envelope for a successful create is `adminUserSchema` directly (`libs/contracts/src/users.ts:20-26`, already built by US-020) — the same "one resource, not wrapped" shape `POST /api/admin/desks` uses for `adminDeskSchema` (`admin.router.ts:171`). No new response type.
- Contract conventions carried over unchanged: request schemas `.strict()`, response schemas not `.strict()` (`libs/contracts/src/desks.ts:51-52`, `:117`).
- `People.tsx:147` and `:237` already render `<Button variant="primary">{ADD_PERSON_LABEL}</Button>` with no `onClick` — this story wires both to open the new dialog, the same two call sites `AddDeskButton` occupies in `Desks.tsx:219`/`:304`-equivalent.
- `useUsers`'s state (`use-users.ts`, US-020) holds both `users` and `summary` (`adminSummarySchema`). A created account must update **both** in place — never a refetch, per the "insert/rename in place" convention `Desks.tsx:123-133`'s `handleAdded`/`markAdded` already establishes — and the summary's `total` plus the created role's own counter must increment together, the same pairing `users.service.ts`'s own tally keeps invariant (`employees + admins === total`).

## Out of scope

- Editing an existing account, or SCR-009's ST-02/ST-05 — those are US-023 (details) and US-024 (role change), which is also where the "last active admin" refusal (BR-001.11) belongs; creating a second admin here is unrestricted, per the story's own edge case.
- Any welcome email, or emailing the password in any form — BR-001.12's principle; none is invented.
- A migration — `user_profiles`, its unique email index, and its `must_change_password`/`is_active` defaults already exist (`0001_user_profiles.sql`).
- Reset/replace an existing password (`SCR-008`'s **Reset password** row action) — that is US-027.
- Department, phone number, or start date — BRD-001 gives an account a name, an email, a role and a password, and nothing else.
- An operator-facing orphaned-account cleanup path, or any background reconciliation job for a credential left without a profile after a compensating delete also fails (design note §2.6, ADR-011). The residual risk is closed by a log line and this story's rollback note, not a new surface — either is its own story with its own AC if it is ever needed.
