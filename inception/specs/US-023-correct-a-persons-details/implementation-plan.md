# US-023 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                  |
| --------- | ------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-023-correct-a-persons-details.md` |
| **Spec**  | `spec.md`                                        |
| **Tier**  | Complex                                          |

## Approval — Gate D1

| Field                | Value           |
| -------------------- | --------------- |
| Status               | **approved**    |
| Approved by          | Joy Joshua <joy_j@trigent.com> |
| Approved on          | 2026-09-20      |
| Plan commit approved | *uncommitted at approval* — base `f4efe0907b2683b4d4340ddc7d51bd21589d5fc9` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`; if either is unset, ask them rather than writing `unknown`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**, the commit before this stamp. That SHA is what makes the approval verifiable: a reviewer at D2 runs `git diff <sha> -- <this file>` and sees whether the plan changed after approval. The name is self-asserted, so it is attribution, not authentication.

**Both calls flagged for approval accepted as written (2026-09-20, Joy Joshua):** ADR-012's reversed write order (`user_profiles` before Supabase Auth on update) stands as drafted, `proposed`; SCR-009 ST-02's role radios ship visible-and-`aria-disabled` per ADR-010 rather than omitted. Steps 4 and 8 below implement both.

## Steps

Ordered. Each step names the files it touches, the `FR-##` it advances, and how it is verified. Test-first per acceptance criterion: the failing test named `... (US-023/AC-##)` comes before the code that turns it green.

### Step 1 — Contract: extract shared field schemas, add the update request/response shapes, add one error code

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-01, FR-02, FR-03, FR-04 (client/server validation parity) |
| Files    | `libs/contracts/src/users.ts` (modify — extract `fullNameSchema`/`emailSchema`, add `userUpdateSchema`, `userIdParamsSchema`), `libs/contracts/src/users.spec.ts` (modify), `libs/contracts/src/error.ts` (modify — add `user_not_found`) |
| Verify   | `npm run nx -- test contracts` — `createAccountRequestSchema`'s existing tests pass unmodified (pure extraction, D-08 in US-021's decisions if that ID is reused — confirm no collision); new tests for `userUpdateSchema` accepting valid input and rejecting empty name / implausible email (US-023/AC-04) |

### Step 2 — Repository: read-before-write, and the update-or-restore statement

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-01, FR-02, FR-03, FR-07                                 |
| Files    | `apps/api/src/modules/users/users.repository.ts` (modify — add `findById`, `updateProfileDetails`; `findByEmail` gains optional `excludeId`), `apps/api/src/modules/users/users.repository.spec.ts` (modify) |
| Verify   | `npm run nx -- test api --testPathPattern=users.repository` — new tests: `findById` returns the row / `undefined` for a missing id; `findByEmail(email, excludeId)` excludes that id (US-023/AC-03); `updateProfileDetails` writes exactly `full_name`/`email`/`updated_at` and maps a `user_profiles_email_key` violation to `{ kind: 'duplicate' }`, any other `23505` to a thrown error; existing `findByEmail(email)` two-arg-omitted tests stay green unmodified |

### Step 3 — Adapter: the one-attribute Auth email update

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-05, FR-07                                                |
| Files    | `apps/api/src/modules/users/users.adapter.ts` (modify — add `updateEmail`), `apps/api/src/modules/users/users.adapter.spec.ts` (modify) |
| Verify   | `npm run nx -- test api --testPathPattern=users.adapter` — new tests: `updateEmail` calls `auth.admin.updateUserById(userId, { email, email_confirm: true })` and constructs no `password` key (US-023/AC-07); maps GoTrue's `email_exists` to `{ kind: 'duplicate' }`, any other error to `{ kind: 'unavailable' }`, logged |

### Step 4 — Service: `updateAccount` — the write order, the guard, the compensation

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-01, FR-02, FR-03, FR-05, FR-06, FR-07, FR-08              |
| Files    | `apps/api/src/modules/users/users.service.ts` (modify — add `updateAccount`, `UsersServiceDeps` gains `nowMs`), `apps/api/src/modules/users/users.service.spec.ts` (modify) |
| Verify   | `npm run nx -- test api --testPathPattern=users.service` — the design note's C1–C6 as tests, each named `... (US-023/AC-##)`: (a) email unchanged → no Auth call at all (assert the adapter fake's `updateEmail` is never invoked); (b) profile-level self-collision guard: deleting it in a scratch edit makes the self-save-with-unchanged-email test fail, proving it is load-bearing (AC-03); (c) `excludeId` deleted from the `findByEmail` pre-check makes a *different* test fail (AC-03, defence-in-depth, per `decisions.md` framing — do not conflate the two); (d) a duplicate email (active and deactivated holder) is refused before any write, naming the holder (AC-02); (e) Auth write fails after the profile write succeeds → both old `fullName` and old `email` are restored, logged, and the caller sees `failed` (AC-01, AC-08); (f) **`usersAuthAdapter.deleteAccount` is asserted never called, on every branch** (AC-07, the story's own named risk); (g) no `password` or `must_change_password` key is ever constructed on either write (AC-07); (h) `updated_at` is written with the injected `nowMs()` value on every successful write, including the restore |

### Step 5 — Route + wiring: `PATCH /api/admin/users/:id`

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-01, FR-02, FR-04, FR-09                                  |
| Files    | `apps/api/src/modules/admin/admin.router.ts` (modify — new handler after the existing `POST /users`), `apps/api/src/modules/admin/admin.router.spec.ts` (modify), `apps/api/src/composition.ts` (modify — `usersService` gains `nowMs,`) |
| Verify   | `npm run nx -- test api --testPathPattern=admin.router` — `200` with the updated `adminUserSchema` body (`toEqual`, not `toMatchObject` — US-023 inherits `users/README.md`'s discipline); `400` on a malformed body; `404 user_not_found` on a missing id; `409 email_taken` with `details`; `503`/`500` mapped as in `spec.md`; **a real Employee session through the real `/api/admin` mount receives `403 admin_only`** (US-023/AC-09) — the mount-level test, not a handler-level assumption |

### Step 6 — UI: `RadioGroup` grows an `aria-disabled` path (D-05)

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | (supports FR-01's edit UI; no FR of its own — SCR-009 ST-02 compliance) |
| Files    | `apps/ui/src/screens/people/RadioGroup.tsx` (modify — new optional `ariaDisabled` prop, additive), `apps/ui/src/screens/people/RadioGroup.spec.tsx` (modify) |
| Verify   | `npm run nx -- test ui --testPathPattern=RadioGroup` — existing create-mode (`disabled`) tests unchanged and green; new test: `ariaDisabled` renders `aria-disabled="true"` on each option while every radio stays focusable (`tabIndex` unaffected) — the ADR-010 property |

### Step 7 — UI: `useUserFormDialog` grows edit mode; `update-account.ts` fetcher

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-08                                                        |
| Files    | `apps/ui/src/screens/people/use-user-form-dialog.ts` (modify — `mode`, `account`, `submit` branches), `apps/ui/src/screens/people/use-user-form-dialog.spec.ts` (modify), `apps/ui/src/lib/update-account.ts` (create), `apps/ui/src/lib/update-account.spec.ts` (create) |
| Verify   | `npm run nx -- test ui --testPathPattern="use-user-form-dialog|update-account"` — existing create-mode dialog tests (AC-08's double-submit guard, US-021) stay green unmodified because they share the same `inFlight` ref; new edit-mode tests for the same guard (US-023/AC-08) and for `update-account.ts`'s outcome mapping (`ok`/`duplicate`/`not_found`/`failed`, mirroring `create-account.ts` and `rename-desk.ts`) |

### Step 8 — UI: `UserFormDialog` edit-mode render (SCR-009 ST-02, reusing ST-03/04/06/08)

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-01, FR-04                                                |
| Files    | `apps/ui/src/screens/people/UserFormDialog.tsx` (modify), `apps/ui/src/screens/people/UserFormDialog.spec.tsx` (modify), `apps/ui/src/screens/people/copy.ts` (modify — edit-mode strings), `apps/ui/src/screens/people/copy.spec.ts` (modify) |
| Verify   | `npm run nx -- test ui --testPathPattern=UserFormDialog` — edit mode renders no `PasswordField`/`PolicyChecklist`/suggest control/delivery warning, shows "To change their password, use **Reset password** on the people list.", title `Edit person — {fullName}` (`(you)` when editing self), submit label `Save changes` (US-023/AC-01); role radios render via Step 6's `ariaDisabled` path (US-023, SCR-009 ST-02); client-side validation parses with `userUpdateSchema` and marks fields with a reason, sending no request (US-023/AC-04); duplicate-email refusal reuses the existing `Alert`/`emailTakenMessage` path with focus moving to the email field, its content selected (US-023/AC-02, AC-03); create mode's existing tests (US-021) stay green unmodified |

### Step 9 — UI: wire the People screen — `markUpdated`, the row menu's **Edit**, `openEdit`

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-01                                                        |
| Files    | `apps/ui/src/lib/use-users.ts` (modify — add `markUpdated`), `apps/ui/src/lib/use-users.spec.ts` (modify), `apps/ui/src/screens/people/People.tsx` (modify — `openEdit(account)`, wire `AccountRowMenu`'s **Edit**), `apps/ui/src/screens/people/People.spec.tsx` (modify), `apps/ui/src/screens/people/AccountRowMenu.tsx` (modify — **Edit** stops being `aria-disabled`), `apps/ui/src/screens/people/AccountRowMenu.spec.tsx` (modify) |
| Verify   | `npm run nx -- test ui --testPathPattern="use-users|People|AccountRowMenu"` — `markUpdated` replaces the row by id, re-sorts by `byFullName`, leaves `summary` unchanged, never removes a row under an active search (US-023/AC-01, `decisions.md` D-03); clicking **Edit** on a row opens the dialog in edit mode prefilled with that account (US-023/AC-01); a successful save closes the dialog and shows the "{fullName} updated." toast (SCR-009 ST-07); existing US-020/US-021 tests (search, add, the other three still-disabled menu items) stay green unmodified |

### Step 10 — Docs: close the loop the design note opened

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | (no FR — review/maintainability, required by `decisions.md`/design-note constraint C16) |
| Files    | `apps/api/src/modules/users/README.md` (modify — the two-sentence ordering rule from ADR-012, the US-004/V-15 consequence, AC-06's structural proof) |
| Verify   | Read-only check: the README states, in one place a future author of US-025/US-027 will find it, "creation writes Auth first (the FK forces it); an update of both systems writes our own table first and compensates by restoring, per ADR-012" |

### Step 11 — Manual verification in the browser

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | (verification, not code — required by `ai/AI-DLC.md`'s UI rule) |
| Files    | none                                                        |
| Verify   | Run the app; as an admin, edit a person's name only, email only, and both; attempt a duplicate email (active and deactivated holder); attempt an implausible email and an empty name; confirm the toast, the list re-sort, and that role radios are visible but inert with a reason on hover/focus; confirm signing in with the old email fails and the new one works after a save (AC-05, to the extent the local Supabase project allows) |

## Rollback

Revert the PR. No migration runs, so no data-shape rollback is needed. If a diverged account (design-note.md §2.9's residual) is produced in production before a revert lands, it self-heals on the next successful edit of that same account (ADR-012 item 6) — no manual data fix is required as part of the rollback itself, though the greppable log line ADR-012 requires lets it be found and retried sooner.

## Open questions

| Question                                         | Owner         | Blocks |
| ------------------------------------------------ | ------------- | ------ |
| Whether `email_confirm: true` is *required* for a changed address to sign in immediately, or GoTrue confirms it some other way | DEV, against the live Supabase project (US-021's A16 precedent) | Nothing in this plan — the attribute is passed regardless (design-note.md §3.4, reason 1 alone justifies it); this only affects how confidently Step 11's manual AC-05 check can be read if it fails |

This table intentionally does not repeat the two calls in the Approval section above — those need your explicit `go`, not a resolution DEV can supply by reading code, and are called out there instead of buried in this table.
