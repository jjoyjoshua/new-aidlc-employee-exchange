# US-026 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                    |
| --------- | ------------------------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-026-reactivate-an-account.md`  |
| **Spec**  | `spec.md`                                                          |
| **Tier**  | Complex                                                            |

## Approval — Gate D1

| Field                | Value           |
| -------------------- | --------------- |
| Status               | **approved**    |
| Approved by          | Joy Joshua <joy_j@trigent.com> |
| Approved on          | 2026-09-20      |
| Plan commit approved | *uncommitted at approval* — base `5ed8d73bc1b6edecefc31cad54b95715f074df0a` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`; if either is unset, ask them rather than writing `unknown`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**, the commit before this stamp. The name is self-asserted, so it is attribution, not authentication.

## Steps

Test-first per acceptance criterion: the failing test named `... (US-026/AC-##)` comes before the code that turns it green. **Step 1 waits on a short Architect design note** confirming two points the spec already found by reading the code (no migration needed; `deactivated_at` stays untouched) — routed after `go`, before any code, per the DEV charter's Complex-tier rule.

### Step 0 — Architect design note (before any code) — done

| Field    | Value                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | confirms FR-01, FR-02                                                                                                                              |
| Files    | `inception/specs/US-026-reactivate-an-account/design-note.md` (created)                                                                            |
| Verify   | Human reads the note; no `blocker` finding open before Step 1 starts — **landed: all four claims confirmed, no blocker/major, five `minor`/`nit` findings (F1–F5) folded into Steps 1, 3 and 5 below** |

### Step 1 — Repository: `usersRepository.activateAccount`

| Field    | Value                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01, FR-02, FR-03                                                                                                                                 |
| Files    | `apps/api/src/modules/users/users.repository.ts` (modify — `activateAccount(id, updatedAt)`: `.from('user_profiles').update({ is_active: true, updated_at }).eq('id', id).select('id, full_name, email, role, is_active').maybeSingle()`, mirroring `setRole`'s exact shape at `users.repository.ts:341-352` but with no `blocked` branch — the trigger's own `WHEN` clause requires `old.is_active`, which is false on every reactivation, so the function is never entered (design note §2, provable, not merely inherited). No `already_active` outcome either — a plain `UPDATE` cannot see the pre-write state and a repeat is genuinely idempotent, unlike US-025's `already_inactive` (design note §3). `.maybeSingle()`, never `.single()`, for `updateProfileDetails`'s stated reason: zero matched rows must answer `{ kind: 'not_found' }`. **F3 (design note §6.3):** `updated_at` IS set here, deliberately unlike `setDeskActive`'s omission — `desks.updated_at` is scoped by `0002_desks.sql` to renaming only, a scope `user_profiles.updated_at` does not share; say so in the docblock so the asymmetry with `setDeskActive` reads as intentional, not copied carelessly), `apps/api/src/modules/users/users.repository.spec.ts` (modify, test-first, including explicit assertions that the update omits `role` and `must_change_password` — AC-03/AC-05 proven by absence, design note §1) |
| Verify   | `npm run test -w apps/api -- users.repository`                                                                                                     |

### Step 2 — Service: `usersService.activateAccount`

| Field    | Value                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------- |
| Advances | FR-01                                                                                            |
| Files    | `apps/api/src/modules/users/users.service.ts` (modify — `activateAccount(id)`: one `nowMs()` reading, calls the repository, maps `{ kind: 'ok', profile }` to `{ kind: 'ok', account: mapAccount(profile) }`, passes `not_found` through unchanged — `changeRole`'s own shape at `users.service.ts:310-314`, simpler still since there is no `blocked` outcome to handle), `apps/api/src/modules/users/users.service.spec.ts` (modify, test-first) |
| Verify   | `npm run test -w apps/api -- users.service`                                                     |

### Step 3 — Route: `POST .../activate`

| Field    | Value                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-03, FR-04, FR-05                                                                                                                   |
| Files    | `apps/api/src/modules/admin/admin.router.ts` (modify — `router.post('/users/:id/activate', ...)`, `userIdParamsSchema` reused for `:id`, no body parsed, no `requireActingAdmin` per spec's technical constraint; `not_found` → `404 user_not_found`, same code the role/deactivate routes already use. Mirrors `/desks/:id/activate` at `admin.router.ts:465-482` for control flow, but **F1 (design note §6.1): sets `res.setHeader('Cache-Control', 'private, no-store')` before the `200` response** — every other `/api/admin/users/*` route does this (`:226, :266, :289, :324`) because the body carries email and full name; the desk route is the one mirror in this story that must NOT be followed literally, since a desk body carries no PII), `apps/api/src/modules/admin/admin.routes.spec.ts` (modify, test-first, including an explicit AC-08 case: an Employee token against the route, and an assertion on the `Cache-Control` header) |
| Verify   | `npm run test -w apps/api -- admin.routes`                                                                                                   |

### Step 4 — Frontend fetcher

| Field    | Value                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01                                                                                                                    |
| Files    | `apps/ui/src/lib/activate-account.ts` (create — `ActivateAccountFetcher`, `{ kind: 'ok'; account: AdminUser } \| { kind: 'failed' }`, mirroring `activate-desk.ts:17-21`'s shape exactly), `.spec.ts` (create) |
| Verify   | `npm run test -w apps/ui -- activate-account`                                                                            |

### Step 5 — Row-menu activation, no dialog (SCR-008 ST-14, ST-15)

| Field    | Value                                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-05, FR-06, FR-07                                                                                                                                |
| Files    | `apps/ui/src/screens/people/AccountRowMenu.tsx` (modify — the `!account.isActive` branch stops calling `renderDisabledItem`, gains an `onActivate` prop and a `handleActivate` function shaped like `handleDeactivate` at `:218-222`, **but F2 (design note §6.2): the live button does NOT carry `people-menu__item--danger`** — SCR-008 ST-15 attributes the divider/danger styling to the destructive slot (Deactivate), the sibling desk-inactive chip is asserted "quiet-neutral, never danger" (`DeskInventoryRow.spec.tsx:51`), and the story's own edge case says activating "restores access, harms nobody"), `.spec.tsx` (modify, including an assertion that the live Activate item has no `--danger` class), `apps/ui/src/screens/people/AccountRow.tsx` (modify — threads `onActivate` alongside `onDeactivate` at every level named in `AccountRow.tsx:49-53,71-78,97-103`), `.spec.tsx` (modify), `apps/ui/src/screens/people/People.tsx` (modify — a `handleToggleActivate`-shaped handler, direct call with an in-flight ref guard and no dialog, mirroring `Desks.tsx:186-211`'s `handleToggleActive` activate branch exactly: success calls `markReactivated` + a toast, failure sets a page-level `Alert` state), `.spec.tsx` (modify), `apps/ui/src/lib/use-users.ts` (modify — new `markReactivated(account)`: moves `summary.deactivated` by **−1 only**, the exact inverse of `markDeactivated`'s `+1 only` at `use-users.ts:92-98`), `.spec.ts` (modify), `apps/ui/src/screens/people/copy.ts` (modify — `reactivatedToast(fullName)` mirroring `deactivatedToast` at `copy.ts:258`, and **F5 (design note §6.5): `activateFailedAlert(fullName)`**, not `activateAccountFailedAlert` — matching this file's own `deactivateFailedAlert` at `copy.ts:252`, since the naming collision the longer name was avoiding is with `desks/copy.ts`, a different module), `.spec.ts` (modify) |
| Verify   | `npm run test -w apps/ui -- AccountRowMenu AccountRow People use-users copy`                                                                     |

### Step 6 — Traceability and documentation

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | all in-scope FRs                                                                                                                             |
| Files    | `inception/specs/US-026-reactivate-an-account/traceability.md` (modify), `knowledge/traceability/manifest.json` (modify — `tests[]`), `apps/api/src/modules/users/README.md` (modify — an `activateAccount` section recording: no migration needed and why, the reused `mapAccount`/`adminUserSchema` shape, and a pointer to `0004`'s closing comment), `inception/specs/index.md` (modify — Status to `implemented`) |
| Verify   | `node tools/aidlc-check.mjs` clean                                                                                                          |

### Step 7 — Full verification

| Field    | Value                                                                              |
| -------- | ------------------------------------------------------------------------------------ |
| Advances | all in-scope FRs                                                                     |
| Files    | none — verification only                                                            |
| Verify   | `npm run lint`, `npm run typecheck`, `npm test` (workspace-wide), `node tools/aidlc-check.mjs` — all clean, output pasted into the PR description |

## Rollback

The migration layer is untouched — this story adds no SQL at all. Reverting the PR fully undoes it: one new route, one new repository/service method, and the UI wiring that calls it.

## Open questions

None blocking this plan's approval.

| Question | Owner | Blocks |
| -------- | ----- | ------ |
| Should `deactivated_at` be cleared on reactivation, or kept as "when this account was last deactivated" (D-01's default)? | Joy Joshua | Nothing in this PR — D-01's default (leave it untouched) ships; changing it later is a one-line follow-up |
| Should activation show a confirmation dialog after all, since it restores access to office data (unlike a desk)? (US-026 story file's own open note) | Joy Joshua | Nothing in this PR — FR-05's no-dialog default ships; the walkthrough asks |
