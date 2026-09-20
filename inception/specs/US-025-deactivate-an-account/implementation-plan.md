# US-025 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                    |
| --------- | ------------------------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-025-deactivate-an-account.md`  |
| **Spec**  | `spec.md`                                                          |
| **Tier**  | Complex                                                            |

## Approval — Gate D1

| Field                | Value           |
| -------------------- | --------------- |
| Status               | **approved**    |
| Approved by          | Joy Joshua <joy_j@trigent.com> |
| Approved on          | 2026-09-20      |
| Plan commit approved | *uncommitted at approval* — base `44fa117cfef45eaa7a6df53caeae76a839168280` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**. The name is self-asserted, so it is attribution, not authentication.

## Steps

Test-first per acceptance criterion: the failing test named `... (US-025/AC-##)` comes before the code that turns it green. **Amended after the Architect design note landed** (`design-note.md`) — the note settled Step 2's exact RPC shape, found a fourth outcome (`already_inactive`) Steps 3/4 had nowhere to put, and named two blockers (the function's PostgREST grants, and a forbidden `EXCEPTION` block); see `change-log.md` for the dated record.

### Step 1 — Contract: the preview response schema

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01                                                                                                                                        |
| Files    | `libs/contracts/src/users.ts` (modify — add `deactivationPreviewSchema`: `{ bookings: z.array(z.object({ id: uuid, deskNumber: string, date: dateString })) }`, **no `count` field** (design note §3.3, C15 — it would duplicate `bookings.length` on a payload that is never paginated), not `.strict()` per every response schema in this package; `userIdParamsSchema` reused verbatim for both new routes, no new params schema), `libs/contracts/src/users.spec.ts` (modify). No new error code — `last_active_admin` and `user_not_found` already exist (US-024, US-020) |
| Verify   | `npm run test -w libs/contracts`                                                                                                             |

### Step 2 — Migration: the cascade function — **settled by the Architect design note**

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-02, FR-03, FR-04, FR-05, FR-12                                                                                                            |
| Files    | `supabase/migrations/0005_deactivate_account_cascade.sql` (create) — full SQL in `design-note.md` §2.3. A PL/pgSQL function `deactivate_account_cascade(p_target_id uuid, p_actor_id uuid, p_now timestamptz, p_today date) returns jsonb`, `volatile` (unmarked), `security invoker` (unmarked) — **never `stable`/`immutable`** (PostgREST runs those read-only and both writes fail with `25006`) or `security definer` (§2.6, §2.7). **No `EXCEPTION` block and no `raise` of its own** — the existing `user_profiles_require_active_admin()` trigger's `Z0011` must propagate uncaught, which is what makes AC-10 abort AC-12's cascade in one mechanism (§2.4, §2.8) — **blocker if omitted**. Performs in one transaction: (a) `UPDATE user_profiles SET is_active = false, deactivated_at = p_now, updated_at = p_now WHERE id = p_target_id AND is_active RETURNING …` — `0004`'s trigger fires here unmodified (no new trigger, D-04); on zero rows, a classifying `SELECT` distinguishes `not_found` from `already_inactive` (§2.2 — **not** collapsed into `not_found`, whose approved 404 copy would be false about an account that exists); (b) `WITH cancelled AS (UPDATE bookings SET status = 'cancelled', cancelled_at = p_now, cancelled_by = p_actor_id, cancellation_source = 'deactivation_cascade' WHERE user_id = p_target_id AND status = 'confirmed' AND booking_date >= p_today RETURNING …) SELECT …` — **`WITH … SELECT … INTO`, never an assignment from a scalar subquery** (a data-modifying CTE is only legal at a statement's top level, C13); no `p_status` parameter — the literal `'confirmed'` names the state the function transitions *from* (§2.1, C11); (c) returns `jsonb_build_object('outcome', …, 'profile', …, 'cancelled_bookings', …)` — never `RETURNS TABLE` (§2.2 gives three independent reasons). **`p_now`/`p_today` are parameters, both derived from one service `nowMs()` reading — never `now()`/`current_date` in SQL** (§2.1, C4 — blocker). **The migration ends with `revoke execute on function … from public, anon, authenticated; grant execute … to service_role`** — Postgres grants `EXECUTE` to `PUBLIC` by default and PostgREST publishes every function at `/rest/v1/rpc/<name>`, reachable with the browser's anon key (§2.7, C1 — **blocker**). The migration's closing comment records: `0004`'s lock-ordering precondition holds (this function updates exactly one `user_profiles` row per statement, C7), the overload rule (any future signature change must `drop function` first), and §4.3's stranded-booking residual (a booking inserted in the milliseconds around the cascade can survive it — named, not fixed, open item 2) |
| Verify   | The gated real-Postgres suite in Step 2a — this is the actual proof of atomicity and of the trigger firing unmodified, not manual output |

### Step 2a — Gated atomicity and last-admin proof (real Postgres)

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | AC-04, AC-10, AC-12 (the edge cases)                                                                                                        |
| Files    | `apps/api/src/modules/admin/admin.concurrency.spec.ts` (modify — a new `describe.runIf(RUN)` block, reusing the file's existing admin/employee fixture helpers) — four cases per design note §3.5: (1) the only active admin, holding upcoming bookings, deactivated → `blocked`, **the raw `.rpc()` error's `code` asserted as `'Z0011'` directly**, and a direct read shows `is_active` still `true` and every booking still `confirmed` — AC-12's "all or nothing" proven against the trigger's own abort, not mocked; (2) an employee with 3 upcoming `confirmed`, 1 past `confirmed`, 1 already `cancelled` → cascade succeeds, exactly the 3 upcoming rows become `cancelled` with `cancellation_source = 'deactivation_cascade'` and the right `cancelled_by`, the other two untouched (AC-02, AC-03 — this is also what proves the function's literal `'confirmed'` predicate agrees with the service's `displayStatusPredicate`, C11); (3) two admins, one already deactivated, deactivate the active one with zero upcoming bookings → succeeds, no bookings touched (AC-07's data shape); **(4) — new, design note §3.5 — two active admins, both the last two, both holding upcoming bookings, deactivated via `Promise.all`: exactly one `ok` and one `blocked`, the loser's account still `is_active` AND every one of the loser's bookings still `confirmed`, exactly one active admin remains.** Case 4 is the one that proves the trigger fires from inside a PL/pgSQL function and that the abort reaches the second table — no other test in either story reaches it |
| Verify   | `RUN_BOOKINGS_CONCURRENCY_TEST=1 npm test --workspace @desk-booking/api -- admin.concurrency` against a disposable Supabase/Postgres project — all new cases green, output pasted into the PR |

### Step 3 — Repository: `usersRepository.previewDeactivation` and `deactivateAccount`

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01, FR-02                                                                                                                                 |
| Files    | `apps/api/src/modules/users/users.repository.ts` (modify — `previewDeactivation(id, status, from)` reads `bookings` **directly** (`.from('bookings').select('id, booking_date, desks(desk_number)')`, `admin-bookings.repository.ts:143-144`'s own embedded-select precedent), filtered `.eq('user_id', id).eq('status', 'confirmed').gte('booking_date', from)` — per `app-architecture.md` §2's written exception granting `users` this cascade (D-02, corrected rationale); `deactivateAccount({ id, actorId, now, today })` calls `.rpc('deactivate_account_cascade', { p_target_id, p_actor_id, p_now, p_today })` — **these four argument names are a wire contract, spelled in exactly one place** (design note §2.1, §3.1) — mapping the payload's `outcome` to **four** kinds: `{ kind: 'ok', profile, cancelledBookings }` (`cancelledBookings` carrying `id, desk_id, desk_number, booking_date, cancellation_source` per row, C16) `\| { kind: 'already_inactive', profile }` `\| { kind: 'blocked' }` `\| { kind: 'not_found' }`. Matches `error.code === LAST_ACTIVE_ADMIN_SQLSTATE` only (the existing constant, reused — not re-declared) and **throws on everything else, including `PGRST202`** (schema-cache/argument-name mismatch, never mapped to an outcome, C6) |
| Verify   | `npm run test -w apps/api -- users.repository` — five cases per design note §3.5, including the negative (`P0001` with `Z0011`'s exact message must throw) |

### Step 4 — Service: `usersService.previewDeactivation` and `deactivateAccount`

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01, FR-02, FR-03                                                                                                                          |
| Files    | `apps/api/src/modules/users/users.service.ts` (modify — computes `today` via `officeToday(nowMs(), officeTimezone)` / `displayStatusPredicate('confirmed', today)` exactly as `desks.service.ts:150-158` does, threads it and one `nowMs()` reading down; no in-app admin count on any branch, same discipline as `changeRole`; **collapses the repository's `already_inactive` outcome into `{ kind: 'ok', account, cancelledCount: 0 }`, with a `logger.warn`** — design note §2.2, §3.2, C8 — so every AC-13 promise stays true with no invented copy and no new error code; reduces `cancelledBookings` to a plain `cancelledCount` at the service boundary, deliberately not forwarding the rows further than this story needs them, `desks.service.ts:113-115`'s own precedent for how a future caller — US-029 — should widen this explicitly rather than finding a dead field), `apps/api/src/modules/users/users.service.spec.ts` (modify, test-first, including the `already_inactive` → `ok` collapse as its own case). **`UsersServiceDeps` gains `officeTimezone: string`** (design note §3.2, C9) — `apps/api/src/composition.ts` (modify — passes it through, already read at `:101`), and every existing `createUsersService({...})` call in `users.service.spec.ts` needs the new field or typecheck fails |
| Verify   | `npm run test -w apps/api -- users.service` — including a test naming the `already_inactive` collapse explicitly, and `npm run typecheck -w apps/api` (catches any missed `createUsersService` call site) |

### Step 5 — Routes: `GET .../deactivation-preview`, `POST .../deactivate`

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01, FR-02, FR-04, FR-10                                                                                                                   |
| Files    | `apps/api/src/modules/admin/admin.router.ts` (modify — both routes reuse `userIdParamsSchema` for `:id`; **the deactivate route reads `requireActingAdmin(req)` for `cancelled_by` — deliberately unlike US-024's role route, because this write has a real attribution column and `/bookings/:id/cancel` is the standing precedent** (design note §0, C19); `blocked` → `422 last_active_admin`, `not_found` → `404 user_not_found`; **no `already_inactive`/`account_already_inactive` branch — the service never returns one**, C8), `apps/api/src/modules/admin/admin.routes.spec.ts` (modify, test-first, including an explicit AC-14 case: an Employee token against both routes) |
| Verify   | `npm run test -w apps/api -- admin.routes`                                                                                                   |

### Step 6 — Frontend fetchers

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01, FR-02                                                                                                                                 |
| Files    | `apps/ui/src/lib/deactivate-account.ts` (create — `DeactivationPreviewFetcher`, `DeactivateAccountFetcher`, mirroring `change-role.ts`'s shape), `.spec.ts` (create) |
| Verify   | `npm run test -w apps/ui -- deactivate-account`                                                                                              |

### Step 7 — Row-menu confirmation, refusal and cascade (SCR-008 ST-05, ST-06, ST-07, ST-12–ST-15)

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-06, FR-07, FR-08, FR-09                                                                                                                   |
| Files    | `apps/ui/src/screens/people/DeactivateAccountDialog.tsx` (create — one mounted `Dialog` switching body/footer on `phase`/`outcome`, `DeskDeactivateDialog.tsx`/`RoleChangeDialog.tsx`'s own shape: a loading phase while the preview fetches, then ST-05 (zero bookings) or ST-06 (lists bookings, count in the confirming action's label) as the default body, `blocked` (ST-07) offering only "Make someone an admin", `failed` (ST-13) offering retry), `.spec.tsx` (create), `apps/ui/src/screens/people/use-deactivate-account-dialog.ts` (create — `open` triggers the preview fetch, `confirm`/`dismiss`/`routeToPromote`, `inFlight` ref, busy/outcome — `use-role-change-dialog.ts`'s own state machine, extended with the preview phase), `.spec.ts` (create), `apps/ui/src/screens/people/AccountRowMenu.tsx` (modify — the deactivate branch of the existing item stops being `aria-disabled` and gains an `onDeactivate` handler, per its own docblock's forecast at `:36`,`:72-73`; the activate branch is untouched), `.spec.tsx` (modify), `apps/ui/src/lib/use-users.ts` (modify — new `markDeactivated(account)`: moves `summary.deactivated` by +1 only, `total`/`employees`/`admins` unchanged — **not** `markRoleChanged`'s shape, which moves the role buckets), `.spec.ts` (modify), `apps/ui/src/screens/people/People.tsx` (modify — mounts the dialog, passes a callback that focuses the search field on "Make someone an admin", calls `markDeactivated` + a toast on success), `.spec.tsx` (modify), `apps/ui/src/screens/people/copy.ts` (modify — ST-05/ST-06's two confirmation bodies, ST-06's counted label, the ST-07 refusal, the ST-14 toast), `.spec.ts` (modify) |
| Verify   | `npm run test -w apps/ui -- DeactivateAccountDialog use-deactivate-account-dialog AccountRowMenu use-users People copy`                     |

### Step 8 — Traceability and documentation

| Field    | Value                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | all in-scope FRs                                                                                                                             |
| Files    | `inception/specs/US-025-deactivate-an-account/traceability.md` (modify), `knowledge/traceability/manifest.json` (modify — `tests[]`; `acs[]` is US-025's full, current AC set, AC-01–07/AC-10–14, matching the story file after D-01's removal of the original AC-08/AC-09), `apps/api/src/modules/users/README.md` (modify — a `deactivateAccount` section recording: the RPC's four argument names as a wire contract, the `revoke`/`grant`, the overload rule, the `STABLE`-under-PostgREST trap, the reused `Z0011` mapping, the `app-architecture.md` §2 boundary exception, §4.3's stranded-booking residual, and a pointer to D-01/issue #59 so US-029 knows the cascade's return shape is theirs to consume — design note §6.2 F14), `apps/api/src/modules/bookings/README.md` (modify — corrects its "written from exactly two objects" claim, design note C17), `inception/specs/index.md` (modify — Status to `implemented`) |
| Verify   | `node tools/aidlc-check.mjs` clean                                                                                                          |

### Step 9 — Full verification

| Field    | Value                                                                              |
| -------- | ------------------------------------------------------------------------------------ |
| Advances | all in-scope FRs                                                                     |
| Files    | none — verification only                                                            |
| Verify   | `npm run lint`, `npm run typecheck`, `npm test` (workspace-wide), `node tools/aidlc-check.mjs` — all clean, output pasted into the PR description |

## Rollback

The migration adds one new function; it touches no existing column, index or trigger. Reverting the PR fully undoes this story. `0004`'s trigger is untouched throughout, so no other story's guard is at risk from a rollback here.

## Open questions

None blocking this plan's approval or Step 2 being coded — the Architect design note (`design-note.md`) has landed and settled Step 2's RPC shape. Four items remain, all routed to the human, none blocking:

| Question | Owner | Blocks |
| -------- | ----- | ------ |
| D-05's `already_inactive` → `ok` collapse, versus a new `409 account_already_inactive` (design note open item 1) | Joy Joshua | Nothing in this PR — D-05 is the default; a `409` shape would be a Gate 1 change |
| §4.3's stranded-booking residual (a booking made in the milliseconds around a cascade can survive it) — confirm accepted as named, not fixed (open item 2) | Joy Joshua | Nothing in this PR |
| Self-deactivation copy — should SCR-008 suppress Deactivate on the acting admin's own row? (open item 3) | Joy Joshua / UX | Nothing in this PR — server permits it either way |
| Formal PO sign-off on `db-design.md` open question 3, now that `require-session.ts` already answers it in shipped code (open item 4) | Joy Joshua / BA | Nothing in this PR — a Gate 1 formality |

**Resolved:** SCR-008 ST-05/ST-06/ST-07 have been read off the real Figma frames (node-ids 252-1291/1354/1394, 252-1466/1508/1548, 252-1605/1689/1750 — desktop/tablet/mobile) and match `spec.md`'s written UI section exactly, no discrepancy — see `change-log.md` (design note open item 6).
