# US-024 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                    |
| --------- | ------------------------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-024-change-a-persons-role.md`  |
| **Spec**  | `spec.md`                                                          |
| **Tier**  | Complex                                                            |

## Approval — Gate D1

| Field                | Value           |
| -------------------- | --------------- |
| Status               | **approved**    |
| Approved by          | Joy Joshua <joy_j@trigent.com> |
| Approved on          | 2026-09-20      |
| Plan commit approved | *uncommitted at approval* — base `52aa108a1b21c01126380e3e0eb26e9f7167831f` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`; if either is unset, ask them rather than writing `unknown`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**, the commit before this stamp. That SHA is what makes the approval verifiable: a reviewer at D2 runs `git diff <sha> -- <this file>` and sees whether the plan changed after approval. The name is self-asserted, so it is attribution, not authentication.

## Steps

Test-first per acceptance criterion: the failing test named `... (US-024/AC-##)` comes before the code that turns it green. **Amended after the Architect design note landed** (`design-note.md`, `ADR-013`) — the note found the naive "count and raise" trigger shape does not hold under concurrency (write skew) and corrected Steps 2, 3, 4 and 7 below; see `change-log.md` for the dated record.

### Step 1 — Contract: the request schema and the new error code — **already landed, verify only**

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01, FR-03                                                                                                                                |
| Files    | Already present in the working tree: `libs/contracts/src/error.ts` (`last_active_admin`), `libs/contracts/src/users.ts` (`roleChangeRequestSchema`, `.strict()`, reusing `userRoleSchema`), `libs/contracts/src/users.spec.ts`, `libs/contracts/src/error.spec.ts`. **Do not re-add** — verify the diff is already there before starting Step 2 |
| Verify   | `npm run test -w libs/contracts` — 263 tests green (already run)                                                                            |

### Step 2 — Migration: the BR-001.11 guard, serialised against write skew

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-02                                                                                                                                       |
| Files    | `supabase/migrations/0004_last_active_admin_guard.sql` (create) — a **plain** `AFTER UPDATE OF role, is_active … FOR EACH ROW` trigger (not `CONSTRAINT TRIGGER … DEFERRABLE` — deferral narrows the write-skew window without closing it, design note §2.2), `WHEN (old.is_active and old.role = 'admin' and not (new.is_active and new.role = 'admin'))` so promotions/reactivations/already-deactivated accounts never fire and never take the lock (§2.4). The function takes `pg_advisory_xact_lock(1001011)` as its **first** statement, before the `exists` check, to serialise the one direction that can break the rule (§2.1–§2.3, `ADR-013`) — never `pg_advisory_lock` (session-scoped; would leak across Supabase's transaction-mode pooler). Raises a project-minted SQLSTATE `Z0011` (§3.1), never the default `P0001`. `VOLATILE` (the plpgsql default, unchanged) and `SECURITY INVOKER` (the default) — never `STABLE`/`IMMUTABLE` (§2.6) or `SECURITY DEFINER` (§2.7) |
| Verify   | The gated real-Postgres suite in Step 2a below, run against a disposable Supabase project — this is the actual proof, not manual output |

### Step 2a — Gated concurrency proof (real Postgres)

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-02 (the edge case), AC-04, AC-07, AC-12                                                                                                  |
| Files    | `apps/api/src/modules/admin/admin.concurrency.spec.ts` (modify — a new `describe.runIf(RUN)` block, admin fixtures added alongside the existing `createAccountWithProfile`/`cleanUp` helpers) — five cases per design note §3.5: (1) demote the only active admin → `blocked`, **and assert the raw rejected error's `code` is `'Z0011'`** (the one assumption a fake cannot prove); (2) two admins, one deactivated, demote the active one → `blocked` (AC-07); (3) two active admins, `Promise.all` of two simultaneous demotions → **exactly one `ok` and one `blocked`**, then a direct read confirming exactly one active admin remains — this is the case that fails against a trigger with no advisory lock, and the one this story's correctness rests on; (4) two active admins, demote one → `ok` (negative control); (5) a deactivated admin plus an active admin, demote the deactivated one → `ok` (AC-12). The block must create its own admin fixtures **before** demoting the project's seeded admin (demoting it first would be refused by the very rule under test), and restore state in `finally` |
| Verify   | `RUN_BOOKINGS_CONCURRENCY_TEST=1 npm test --workspace @desk-booking/api -- admin.concurrency` against a disposable Supabase/Postgres project (never shared dev or production) — all 5 new cases green, output pasted into the PR. This is the load-bearing proof for the concurrency edge case; a CI run without the flag proves only the SQLSTATE mapping (Step 3), not the rule itself — the PR says so explicitly |

### Step 3 — Repository: `usersRepository.setRole`

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01, FR-02, FR-03                                                                                                                         |
| Files    | `apps/api/src/modules/users/users.repository.ts` (modify — add `setRole({ id, role, updatedAt }): Promise<SetRoleOutcome>`; writes `role` and `updated_at` only, `.maybeSingle()` per `updateProfileDetails`'s own reasoning for the 404 case; maps `error.code === 'Z0011'` — **code only, never a message match** — to `{ kind: 'blocked' }`, throws on anything else), `apps/api/src/modules/users/users.repository.spec.ts` (modify, test-first — four cases per design note §3.3: `ok`, `not_found`, `blocked` on the `Z0011` fake, and a **negative**: a `P0001` fake with the identical message must `throw`, proving the match is on the code, not the prose) |
| Verify   | `npm run test -w apps/api -- users.repository` — all four cases green, including the negative                                              |

### Step 4 — Service: `usersService.changeRole`

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01, FR-02                                                                                                                                |
| Files    | `apps/api/src/modules/users/users.service.ts` (modify — `changeRole(id, role): Promise<ChangeRoleOutcome>`, `'ok' \| 'not_found' \| 'blocked'`, threading one `nowMs()` reading to `setRole`'s `updatedAt` exactly as `updateAccount` does — no in-app admin count anywhere; the trigger is the sole arbiter, so AC-07's "a deactivated admin does not count" needs no service-side logic to get right), `apps/api/src/modules/users/users.service.spec.ts` (modify, test-first) |
| Verify   | `npm run test -w apps/api -- users.service` green, including a test naming AC-07 by id                                                    |

### Step 5 — Route: `POST /api/admin/users/:id/role`

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01, FR-03, FR-12                                                                                                                         |
| Files    | `apps/api/src/modules/admin/admin.router.ts` (modify — `userIdParamsSchema` reused for `:id`, `roleChangeRequestSchema` for the body; `blocked` → `422 last_active_admin`, `not_found` → `404 user_not_found`; no `requireActingAdmin` — that middleware exists for attribution only, `bookings.cancelled_by`'s own reason, and this write has no actor column to attribute to), `apps/api/src/modules/admin/admin.routes.spec.ts` (modify, test-first, including an explicit AC-13 case: an Employee token against this route) |
| Verify   | `npm run test -w apps/api -- admin.routes` green                                                                                            |

### Step 6 — Frontend fetcher

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01                                                                                                                                        |
| Files    | `apps/ui/src/lib/change-role.ts` (create — `ChangeRoleFetcher`, mirroring `update-account.ts`'s shape), `apps/ui/src/lib/change-role.spec.ts` (create) |
| Verify   | `npm run test -w apps/ui -- change-role` green                                                                                              |

### Step 7 — Row-menu confirmation and refusal (SCR-008 ST-08, ST-09, ST-12–ST-15)

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-04, FR-05, FR-07, FR-08, FR-09, FR-10                                                                                                    |
| Files    | `apps/ui/src/screens/people/RoleChangeDialog.tsx` (create — one mounted `Dialog` switching body/footer on `outcome`, `DeskDeactivateDialog.tsx`'s own shape: default confirmation, `blocked` names the account and offers **only** "Make someone an admin", `failed` offers retry), `.spec.tsx` (create), `apps/ui/src/screens/people/use-role-change-dialog.ts` (create — `open`/`confirm`/`dismiss`, `inFlight` ref, busy/outcome, `use-admin-cancel-dialog.ts`'s own state machine), `.spec.ts` (create), `apps/ui/src/screens/people/AccountRowMenu.tsx` (modify — the role item stops being `aria-disabled`, gains an `onChangeRole` handler, per its own docblock's forecast), `.spec.tsx` (modify), `apps/ui/src/lib/use-users.ts` (modify — **new** `markRoleChanged(account)`, NOT `markUpdated`: `markUpdated` spreads `summary` through unchanged by design, US-024 moves both `employees` and `admins` by ±1 while `total`/`deactivated` stay fixed, including for a deactivated account — design note §4.1), `.spec.ts` (modify), `apps/ui/src/screens/people/People.tsx` (modify — mounts the dialog, passes a callback that focuses the search field on "Make someone an admin", calls `markRoleChanged` + a toast on success), `.spec.tsx` (modify), `apps/ui/src/screens/people/copy.ts` (modify — promotion/demotion confirmation bodies per ST-08's two exact sentences, the ST-09 refusal sentence, the ST-14 toast), `.spec.ts` (modify) |
| Verify   | `npm run test -w apps/ui -- RoleChangeDialog use-role-change-dialog AccountRowMenu use-users People copy` green                             |

### Step 8 — Edit-form role change (SCR-009 ST-02, ST-05)

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-06                                                                                                                                        |
| Files    | `apps/ui/src/screens/people/use-user-form-dialog.ts` (modify — role radios stop being `ariaDisabled`; `submit` on edit mode, when the role differs from the loaded account, calls `changeRole` **first**; only when that succeeds or the role is unchanged does it proceed to `updateAccount` for name/email — D-01), `apps/ui/src/screens/people/UserFormDialog.tsx` (modify — a `lastAdmin` outcome renders the ST-05 refusal directly above the `RadioGroup`, `RadioGroup`'s `value` reverts to `dialog.account.role`), their `.spec.ts`/`.spec.tsx` (modify), `apps/ui/src/screens/people/copy.ts` (modify — the ST-05 refusal reuses the SAME sentence-builder Step 7 added, one function serving both doors per AC-08, not two copies of one rule) |
| Verify   | `npm run test -w apps/ui -- use-user-form-dialog UserFormDialog copy` green                                                                 |

### Step 9 — Self-role-change updates the acting admin's own session (edge case)

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-11                                                                                                                                        |
| Files    | `apps/ui/src/lib/auth/auth-context.tsx` (modify — exposes a way to patch the signed-in `user`'s `role` in local state; `useAuth().user`'s existing shape is reused, no new fetch), `.spec.ts` (modify), `apps/ui/src/screens/people/People.tsx` and `use-user-form-dialog.ts` (modify — call it when the changed account's `id === currentUserId`) |
| Verify   | `npm run test -w apps/ui -- auth-context People use-user-form-dialog` green — a test asserting `RequireRole` redirects immediately after a self-demotion, no reload                    |

### Step 10 — Traceability and documentation

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | all FRs                                                                                                                                      |
| Files    | `inception/specs/US-024-change-a-persons-role/traceability.md` (modify), `knowledge/traceability/manifest.json` (modify — `tests[]`, `decisions[]: ["ADR-013"]`), `apps/api/src/modules/users/README.md` (modify — a `changeRole` section recording the advisory lock, the `Z0011` SQLSTATE, the `DELETE`-branch residual (design note §2.5), and the distinction between this screen's summary-line admin count (every admin row) and BR-001.11's own count (active admins only) — matching the `createAccount`/`updateAccount` sections' own depth, and written **before** US-025 starts), `libs/contracts/src/error.ts` (modify — correct the `last_active_admin` comment's "constraint trigger" wording per `ADR-013`), `inception/specs/index.md` (modify — Status to `implemented`) |
| Verify   | `node tools/aidlc-check.mjs` clean                                                                                                          |

### Step 11 — Full verification

| Field    | Value                                                                              |
| -------- | ------------------------------------------------------------------------------------ |
| Advances | all FRs                                                                              |
| Files    | none — verification only                                                            |
| Verify   | `npm run lint`, `npm run typecheck`, `npm test` (workspace-wide), `node tools/aidlc-check.mjs` — all clean, output pasted into the PR description |

## Rollback

The migration is additive — a new trigger function and its attachment, no column or data change — so reverting the PR fully undoes this story; no forward-only data migration exists to reverse. If the trigger itself needs to come out independently of the rest (e.g. it is blocking a legitimate write no test anticipated), a follow-up migration drops it; US-025 must not land until either this trigger or its replacement exists, since it depends on the identical guard.

## Open questions

None. The trigger's exact SQL and error-signal shape (Step 2) is a Complex-tier design-note item — resolved by the Architect **after** this D1 approval and **before** Step 2 is coded, per `ai/gates/delivery.md`'s own ordering, not a question blocking approval of this plan.

| Question | Owner | Blocks |
| -------- | ----- | ------ |
