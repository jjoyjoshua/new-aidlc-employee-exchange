# US-027 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                     |
| --------- | ----------------------------------------------------------------------- |
| **Story** | `inception/stories/user-stories/US-027-reset-somebodys-password.md`     |
| **Spec**  | `spec.md`                                                              |
| **Tier**  | Complex                                                                |

## Approval — Gate D1

| Field                | Value                          |
| -------------------- | -------------------------------- |
| Status               | approved                       |
| Approved by          | Joy Joshua <joy_j@trigent.com> |
| Approved on          | 2026-09-20                     |
| Plan commit approved | *(fill in once committed)*     |

`go` was given in chat on 2026-09-20. `Approved by` is the human's name and email from `git config user.name` / `user.email`; if either is unset, ask them rather than writing `unknown`. `Plan commit approved` is normally the SHA of a commit holding this plan **as they read it**, made before this stamp, so a D2 reviewer can `git diff <sha> -- <this file>` and see whether the plan changed after approval. Here the human asked to combine the spec-package commit with the implementation commit rather than committing the plan separately first, so **the developer must fill in the `Plan commit approved` cell with that commit's own SHA right after making it** (`git rev-parse HEAD`), replacing the placeholder above — `aidlc-check` treats an unfilled or non-hex value as "records no plan commit" and fails until that cell holds a real, reachable SHA. The name is self-asserted, so it is attribution, not authentication.

**Before any code is written**, Complex tier requires an Architect design note into the same PR (`ai/gates/delivery.md` §Flow). That happened after this plan's `go`, before Step 1 below starts, and landed as `design-note.md` alongside this plan, plus [ADR-014](../../../knowledge/decisions/ADR-014-generated-credential-alphabets.md). Its one **blocker** finding (F1: the write order in what was Step 5) is corrected below, along with every major/minor finding it raised; see `design-note.md` §10 for the full disposition table and `decisions.md` D-06 for the write-order decision it produced.

**Note on the charter's `npm run nx -- <target> <project>` convention** (`ai/roles/dev.md:45`): this repository has no Nx project files (verified — no `project.json` anywhere, `nx.json` absent). The actual commands are `npm test -w apps/api`, `npm test -w apps/ui`, `npm run build:contracts`, `npm run typecheck`, `npm run lint`, all confirmed against the root `package.json`. The steps below use the real commands.

## Steps

Ordered. Each step names the files it touches, the `FR-##` it advances, and how it is verified. Test-first per acceptance criterion: the failing test named `... (US-027/AC-##)` comes before the code that turns it green.

### Step 1 — Server-side password generator, and correcting the create-path generator's docblock

| Field    | Value                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| Advances | FR-01                                                                                                       |
| Files    | `apps/api/src/domain/generate-reset-password.ts` (create — takes `randomInt: (maxExclusive: number) => number` as a parameter, per design note §5.1/F3; `domain/` is declared pure and a CSPRNG is not), `apps/api/src/domain/generate-reset-password.spec.ts` (create), `apps/ui/src/lib/generate-password.ts` (modify — correct the `:10-12` docblock, which currently cites "SCR-008 ST-10's own reasoning" for its exclusion set; after D-01/ADR-014 that citation is contradictory. Cite REQ-033/V-18 and decision B2 instead, and note the reset path deliberately differs under ADR-014 — design note §5.3/F4) |
| Verify   | `npm test -w apps/api -- generate-reset-password` — expected: all pass, including (a) a stubbed-`randomInt` test asserting the "one guaranteed char per V-12 class, then filler, then shuffle" structure directly, (b) a 200-sample property run with the real crypto-backed RNG asserting every password satisfies `evaluatePasswordPolicy`, is accepted by `newPasswordSchema`, and draws every character from the union of the four declared alphabets (design note §5.4/F9 — this also proves the special-character set stayed `!@#$%^&*-_=+?`, unchanged from `generate-password.ts:19`) |

### Step 2 — Contract: reset-password response schema

| Field    | Value                                                                                   |
| -------- | -------------------------------------------------------------------------------------------- |
| Advances | FR-01                                                                                        |
| Files    | `libs/contracts/src/users.ts` (modify — add `resetPasswordResponseSchema` with `password: z.string().min(1)`, **not** `newPasswordSchema` — design note §6/F2, so a server-side policy change can never make an already-set credential unrenderable), `libs/contracts/src/users.spec.ts` (modify) |
| Verify   | `npm run build:contracts && npm test -w libs/contracts -- users` — expected: all pass         |

### Step 3 — Auth adapter: set a new password

| Field    | Value                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-06                                                                                                                   |
| Files    | `apps/api/src/modules/users/users.adapter.ts` (modify — add `setPassword(userId, password)`; the interface docblock states this duplicates `auth.adapter.ts:110-136`'s identical GoTrue call, required by the `modules/users` → `modules/auth` import ban at `eslint.config.mjs:12-22` **in the repository root**, and mirrors that method's `catch`-to-`unavailable` shape and `{ userId, message: error.message }` log line verbatim — design note §4.1/F8, §4.2/F7), `apps/api/src/modules/users/users.adapter.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- users.adapter` — expected: all pass, including an `unavailable` mapping for any GoTrue error/throw, mirroring `updateEmail`'s own test shape, and an explicit assertion the call is `updateUserById(userId, { password })` with no other key (AC-06, design note §12 item 2) |

### Step 4 — Repository: re-arm `must_change_password`

| Field    | Value                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-07                                                                                                                              |
| Files    | `apps/api/src/modules/users/users.repository.ts` (modify — add `armMustChangePassword`, modelled on `activateAccount` (`users.repository.ts:461-471`): names only `must_change_password`/`updated_at`, unconditional write with no `already_armed` branch, `.maybeSingle()`, `RETURNING id, full_name, email, role, is_active` — design note §2.3/C9), `apps/api/src/modules/users/users.repository.spec.ts` (modify), `apps/api/src/modules/users/README.md` (modify — records this story as `must_change_password`'s first re-armer on an already-active account, and that no compensating un-arm exists on a subsequent Auth failure — design note §2.4/F13/C17) |
| Verify   | `npm test -w apps/api -- users.repository` — expected: all pass, including a `not_found` branch for a nonexistent id, and a case proving an already-`true` row stays `true` with `ok` (AC-10) |

### Step 5 — Service: orchestrate the reset, `user_profiles` write first

| Field    | Value                                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01, FR-06, FR-07, FR-08, FR-09, FR-10                                                                                                                                                                 |
| Files    | `apps/api/src/modules/users/users.service.ts` (modify — add `resetPassword(id)`: **`armMustChangePassword` first** (the write is the existence check, `not_found` short-circuits, no `findById`) → generate the password → `usersAuth.setPassword` **second** → on `unavailable`, log `{ id }` only and return `unavailable` with the profile already armed but the password unchanged → on success return `{ account, password }`. **This order is D-06 / design note §2.1, correcting the original draft's Auth-first sequence (blocker F1)** — the reverse order could strand an account holding a credential nobody has seen if the profile write then failed), `apps/api/src/modules/users/users.service.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- users.service` — expected: all pass, including: (a) an AC-08 test that stubs the RNG to a known value, spies **all four** logger levels, and asserts `JSON.stringify` of every call argument across every branch (including the `unavailable` branch) never contains that value (design note §3.2/F6/C7); (b) a dedicated case where `armMustChangePassword` succeeds and `setPassword` then fails, asserting the outcome is `unavailable` and the profile write is NOT rolled back (D-06's accepted residual, design note §2.4); (c) an AC-10 case (account already `must_change_password: true`) resulting in the flag staying `true` with a new password; (d) an assertion that `modules/notifications` is never imported or called on this path (AC-08's "never emailed", proven structurally — design note §12 item 8) |

### Step 6 — Route: `POST /api/admin/users/:id/reset-password`

| Field    | Value                                                                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-08, FR-09, FR-11                                                                                                                                                                   |
| Files    | `apps/api/src/modules/admin/admin.router.ts` (modify — new route, no body, `Cache-Control: private, no-store`), `apps/api/src/modules/admin/admin.routes.spec.ts` (modify)                    |
| Verify   | `npm test -w apps/api -- admin.routes` — expected: all pass, including `404 user_not_found`, `400 invalid_request` (a non-uuid `:id`, design note F14), `503 service_unavailable` (Auth unreachable, profile left armed), `403 admin_only` (Employee session, changes nothing), `401` (no token), the happy path returning `{ account, password }` with the `Cache-Control: private, no-store` header explicitly asserted (NFR-01, design note §2.5/C4 — not just the body), and an end-to-end AC-07 case proving the **affected** account (not the acting admin) is sent to Set your password at its next sign-in — sign in as the reset account with the returned password and assert the session response carries `mustChangePassword: true`, mirroring `bookings.routes.spec.ts`'s cross-route assertion shape (design note §12 item 3) |

### Step 7 — `Dialog`: the `dismissible` prop (D-02)

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-04                                                                                                                                        |
| Files    | `apps/ui/src/components/dialog/Dialog.tsx` (modify — new optional `dismissible?: boolean`, default `true`; when `false`, omit the close button entirely and return early from the `Escape` branch **regardless of `busy`**, checking `dismissible` before `busy`; also amend the `:16-27` docblock that refuses `scrim`/`anchor`/`modal` by name to state the admitting principle — `dismissible` modifies chrome this component already owns, unlike those three — design note §7.2/F10/C14), `apps/ui/src/components/dialog/Dialog.spec.tsx` (**modify** — this file already exists, design note F12) |
| Verify   | `npm test -w apps/ui -- Dialog` — expected: all existing `Dialog`-consumer specs (`UserFormDialog`, `RoleChangeDialog`, `DeactivateAccountDialog`, `ConfirmDialog`) stay green with **zero changes to their own spec files**, proving the default is unchanged (this is the regression proof itself, not just a claim); new cases cover `dismissible={false}` omitting the close icon, Escape doing nothing, the `dismissible={false} busy={false}` combination specifically (the one the result phase actually ships, design note §7.3/C12), and a backdrop-click case documented as **inherited** behaviour (`.dialog__overlay` has no click handler today — design note §7.1/C13) rather than new |

### Step 8 — Frontend fetcher

| Field    | Value                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------- |
| Advances | FR-01                                                                                           |
| Files    | `apps/ui/src/lib/reset-password.ts` (create), `apps/ui/src/lib/reset-password.spec.ts` (create) |
| Verify   | `npm test -w apps/ui -- reset-password` — expected: all pass, mirroring `change-role.spec.ts`'s outcome-mapping cases |

### Step 9 — Copy

| Field    | Value                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-02, FR-03                                                                                                                   |
| Files    | `apps/ui/src/screens/people/copy.ts` (modify — confirm/result dialog copy, exact AC-02 clauses), `apps/ui/src/screens/people/copy.spec.ts` (modify) |
| Verify   | `npm test -w apps/ui -- copy` — expected: all pass, including a test asserting the confirm-dialog copy contains all four AC-02 clauses **in the order** `SCR-008-people.md:171` requires (presence alone is not the assertion — design note §12 item 7) |

### Step 10 — State hook: `useResetPasswordDialog`

| Field    | Value                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-05, FR-09                                                                                                                                              |
| Files    | `apps/ui/src/screens/people/use-reset-password-dialog.ts` (create), `apps/ui/src/screens/people/use-reset-password-dialog.spec.ts` (create)               |
| Verify   | `npm test -w apps/ui -- use-reset-password-dialog` — expected: all pass, including the double-submit guard (`RoleChangeDialog`'s own pattern) and a case proving `dismiss()`/`Done` clears the password from state entirely (AC-05) |

### Step 11 — `ResetPasswordDialog` component

| Field    | Value                                                                                                                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-02, FR-03, FR-04, FR-09                                                                                                                                                                                                       |
| Files    | `apps/ui/src/screens/people/ResetPasswordDialog.tsx` (create), `apps/ui/src/screens/people/ResetPasswordDialog.spec.tsx` (create), `apps/ui/src/screens/people/people.css` (modify — credential field + Copy button styling using `--f-mono`/`--t-mono`/`--lh-mono`) |
| Verify   | `npm test -w apps/ui -- ResetPasswordDialog` — expected: all pass, one `describe` per ST (confirm/ST-10, busy/ST-12, failed/ST-13, result/ST-11), including: a `navigator.clipboard.writeText` mock asserting Copy announces "Copied" via a live region, not merely a re-rendered label (`SCR-008-people.md:227`, design note §12 item 9); `dismissible={false}` wired for the result phase only; and the result dialog's `initialFocusRef` pointed at the password field itself, not at Done, so a screen-reader user hears the credential before the instructions (`SCR-008-people.md:225`, design note §12 item 10) |

### Step 12 — Wire the row menu and the screen

| Field    | Value                                                                                                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-11 (client-side entry point), all remaining ACs end-to-end                                                                                                                                                                  |
| Files    | `apps/ui/src/screens/people/AccountRowMenu.tsx` (modify — un-disable, add `onResetPassword`), `apps/ui/src/screens/people/AccountRowMenu.spec.tsx` (modify), `apps/ui/src/screens/people/AccountRow.tsx` (modify — thread prop), `apps/ui/src/screens/people/People.tsx` (modify — instantiate dialog, wire fetcher), `apps/ui/src/screens/people/People.spec.tsx` (modify) |
| Verify   | `npm test -w apps/ui -- AccountRowMenu AccountRow People` — expected: all pass, including: an end-to-end People test opening the menu, choosing Reset password, confirming, and asserting the shown-once password renders; an AC-11 case asserting an Employee session's People screen never renders the row menu at all (`require-role`'s guard, design note §12 item 4); a case resetting an already-deactivated account's password and asserting it still succeeds (story edge case 2, design note §12 item 5); and a self-reset case (the acting admin resets their own row) asserting ST-11 still renders rather than a silent failure from the next request's `403 password_change_required` (design note §8/F5/C16 — the copy question for this case is routed to UX as an open item, not built here) |

### Step 13 — Traceability and manifest

| Field    | Value                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Advances | all                                                                                                                             |
| Files    | `traceability.md` (modify — every row to `implemented`), `knowledge/traceability/manifest.json` (modify — `US-027.tests` filled) |
| Verify   | `node tools/aidlc-check.mjs` — expected: exits 0                                                                                |

### Step 14 — Full suite and PR description

| Field    | Value                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Advances | all                                                                                                                             |
| Files    | `pr-description.md` (create, from `ai/templates/pr-description.md`)                                                             |
| Verify   | `npm run lint && npm run typecheck && npm test` — expected: all green; output pasted into the PR description, never summarised  |

## Rollback

Revert the PR. No migration, no data backfill, no config change — the only persisted effect is per-account (`must_change_password` and the Supabase Auth credential on accounts an Admin actually reset), which a code revert does not need to undo: an already-reset account keeps its new password and forced-change flag exactly as intended, the same way reverting US-025 would not "un-deactivate" accounts it had already deactivated.

## Open questions

| Question                                         | Owner         | Blocks |
| ------------------------------------------------ | ------------- | ------ |
| _(none — both load-bearing decisions were resolved with the human before this plan was written: D-01, D-02)_ | — | — |

A non-empty table blocks the D1 approval. Answer or close every row before asking for `go`.
