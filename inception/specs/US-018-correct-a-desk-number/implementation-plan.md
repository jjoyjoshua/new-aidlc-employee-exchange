# US-018 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                    |
| --------- | -------------------------------------------------------------------|
| **Story** | `inception/stories/user-stories/US-018-correct-a-desk-number.md`  |
| **Spec**  | `spec.md`                                                          |
| **Tier**  | Complex                                                            |

## Approval — Gate D1

| Field                | Value           |
| -------------------- | --------------- |
| Status               | **approved**    |
| Approved by          | Joy Joshua <joy_j@trigent.com> |
| Approved on          | 2026-09-19      |
| Plan commit approved | *uncommitted at approval* — base `67d78d102bd117eb01c8358460fb314eaeac0e7b` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**.

## Steps

Test-first per acceptance criterion: the failing test named `... (US-018/AC-##)` comes before the code that turns it green.

### Step 1 — Contract: the request/response schemas

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-02                                                                                              |
| Files    | `libs/contracts/src/desks.ts` (modify — add `deskIdParamsSchema`, `deskUpdateSchema`, `deskUpdateResponseSchema`), `libs/contracts/src/desks.spec.ts` (modify) |
| Verify   | `npm test -w libs/contracts` — expected: new cases green, including that `deskUpdateSchema` reuses `deskNumberSchema` (accepts/rejects the same inputs as `deskCreateSchema`) and is a distinct object from it |

### Step 2 — Repository: `updateDeskNumber`

| Field    | Value                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------|
| Advances | FR-01, FR-04, FR-05                                                                                                            |
| Files    | `apps/api/src/modules/desks/desks.repository.ts` (modify — add `updateDeskNumber`, `UpdateDeskOutcome`), `apps/api/src/modules/desks/desks.repository.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- desks.repository` — expected: the recorded `.update(...)` payload is exactly `{ desk_number, updated_at }` keyed on `.eq('id', ...)`, with no preceding `.select()` (AC-07's no-pre-check assertion); `23505` on `desks_desk_number_key` → `duplicate`; any other `23505` throws; `23514` throws; zero matched rows → `not_found` |

### Step 3 — Service: `renameDesk`

| Field    | Value                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01, FR-06                                                                                              |
| Files    | `apps/api/src/modules/desks/desks.service.ts` (modify — add `renameDesk`), `apps/api/src/modules/desks/desks.service.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- desks.service` — expected: a desk with `bookedAhead: 3` renames successfully with **no** call to `listUpcomingConfirmedDeskIds` (AC-03's absence-is-the-proof); `updated_at` derived from the injected clock; renaming to the current value returns `{ kind: 'ok' }` (AC-07); exactly one repository interaction, nothing else (AC-05's structural half) |

### Step 4 — Route: `PATCH /api/admin/desks/:id`

| Field    | Value                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------|
| Advances | FR-01, FR-04, FR-13                                                                                             |
| Files    | `apps/api/src/modules/admin/admin.router.ts` (modify), `apps/api/src/modules/admin/admin.routes.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- admin.routes` — expected: `200` with `{ id, deskNumber, isActive }` and no `bookedAhead` on success; `409 desk_number_taken` on collision; `400 invalid_request` on a malformed body with no repository call; `404 desk_not_found` on zero matched rows; an Employee session gets `403`; no session gets `401` |

### Step 5 — Shared component: `TextField`'s `describedBy`

| Field    | Value                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------|
| Advances | NFR-01                                                                                                  |
| Files    | `apps/ui/src/components/text-field/TextField.tsx` (modify — additive `describedBy?: string` prop, composed into the existing `aria-describedby` list, never replacing it), `apps/ui/src/components/text-field/TextField.spec.tsx` (modify) |
| Verify   | `npm test -w apps/ui -- TextField` — expected: a caller-supplied `describedBy` is present in `aria-describedby` alongside the helper/error ids, and every existing `TextField` case (including `ConfirmDialog.spec.tsx`'s indirect use) stays green |

### Step 6 — List update: `use-desks.ts`'s `markRenamed`

| Field    | Value                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------|
| Advances | FR-11                                                                                                            |
| Files    | `apps/ui/src/lib/use-desks.ts` (modify — add `markRenamed`, extract the shared sort comparator), `apps/ui/src/lib/use-desks.spec.ts` (modify) |
| Verify   | `npm test -w apps/ui -- use-desks` — expected: renaming `A-01` → `B-05` moves the row across the zone boundary (not merely updating it in place), and the desk's `bookedAhead` is preserved unchanged |

### Step 7 — Browser fetcher: `rename-desk.ts`

| Field    | Value                                                                             |
| -------- | ------------------------------------------------------------------------------------|
| Advances | FR-01, FR-04, FR-12                                                                |
| Files    | `apps/ui/src/lib/rename-desk.ts` (create), `apps/ui/src/lib/rename-desk.spec.ts` (create) |
| Verify   | `npm test -w apps/ui -- rename-desk` — expected: `ok`/`duplicate`/`failed` outcomes; a `404` folds into `failed` |

### Step 8 — Dialog state machine: generalise to `use-desk-form-dialog.ts`

| Field    | Value                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------|
| Advances | FR-12                                                                                                                        |
| Files    | `apps/ui/src/screens/desks/use-add-desk-dialog.ts` → renamed `apps/ui/src/screens/desks/use-desk-form-dialog.ts` (modify — generalise to `mode`/`desk`, add `openEdit`), `use-add-desk-dialog.spec.ts` → renamed `use-desk-form-dialog.spec.ts` (modify) |
| Verify   | `npm test -w apps/ui -- use-desk-form-dialog` — expected: two synchronous `submit()` calls in edit mode issue exactly one fetch (the `inFlight` guard, asserted with no intervening `await`) |

### Step 9 — Copy strings

| Field    | Value                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------|
| Advances | FR-07, FR-08                                                                                                   |
| Files    | `apps/ui/src/screens/desks/copy.ts` (modify — `editDeskDialogTitle`, `SAVE_CHANGES_LABEL`, `upcomingHoldersWarning`, `deskRenamedToast`), `apps/ui/src/screens/desks/copy.spec.ts` (modify) |
| Verify   | `npm test -w apps/ui -- copy` — expected: the singular (`1 person has…`) and plural (`N people have…`) forms both covered |

### Step 10 — `DeskFormDialog`: edit mode (ST-02)

| Field    | Value                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------|
| Advances | FR-07, FR-08, FR-12                                                                                                                            |
| Files    | `apps/ui/src/screens/desks/DeskFormDialog.tsx` (modify — `mode`, `desk` props, the ST-02 note wired via `describedBy`, select-on-open), `apps/ui/src/screens/desks/DeskFormDialog.spec.tsx` (modify) |
| Verify   | `npm test -w apps/ui -- DeskFormDialog` — expected: `bookedAhead: 3` renders the warning with the real count and it is in the field's `aria-describedby`; `bookedAhead: 0` renders no warning at all; `bookedAhead: 1` renders the singular; the field is prefilled and its contents selected on open; opening the dialog issues no fetch |

### Step 11 — `DeskInventoryRow`: wire the Edit button

| Field    | Value                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------|
| Advances | FR-01                                                                                                                |
| Files    | `apps/ui/src/screens/desks/DeskInventoryRow.tsx` (modify — Edit enabled, gains `onEdit`; the toggle unchanged), `apps/ui/src/screens/desks/DeskInventoryRow.spec.tsx` (modify — split the existing disabled-controls test, keeping the `US-016` citation on the toggle half, adding a `US-018/AC-01` case for Edit) |
| Verify   | `npm test -w apps/ui -- DeskInventoryRow` — expected: Edit is enabled and calls `onEdit(desk)`; the toggle is still disabled with `UNAVAILABLE_CONTROL_REASON` |

### Step 12 — `Desks.tsx`: wire the edit flow end to end

| Field    | Value                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01 through FR-12 (integration)                                                                          |
| Files    | `apps/ui/src/screens/desks/Desks.tsx` (modify — `openEdit`, the rename fetcher, the saved toast), `apps/ui/src/screens/desks/Desks.spec.tsx` (modify) |
| Verify   | `npm test -w apps/ui -- Desks.spec` — expected: clicking Edit on a row with upcoming bookings opens the dialog showing the warning; saving a new number re-sorts the row and shows the saved toast; a duplicate keeps the dialog open with the refusal |

### Step 13 — Gated real-Postgres proof (AC-06, AC-07)

| Field    | Value                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-05, FR-10                                                                                                                    |
| Files    | `apps/api/src/modules/admin/admin.concurrency.spec.ts` (create — two `it()`s under the same `RUN_BOOKINGS_CONCURRENCY_TEST` gate, local fixtures matching `bookings.repository.concurrency.spec.ts`'s shape). **Not** added to `modules/bookings`'s own concurrency file as originally planned: it needs both `desksRepository` and `availabilityRepository`/`adminBookingsRepository` in one test, and `eslint.config.mjs`'s module boundary (ADR-004) forbids `bookings` and `desks` from importing each other — `modules/admin` already legitimately composes across both, the same way `admin.router.ts`/`admin.routes.spec.ts` do |
| Verify   | `RUN_BOOKINGS_CONCURRENCY_TEST=1 npm test -w apps/api -- admin.concurrency` against a disposable Supabase project — expected: renaming a desk to its own current value raises no `23505`; renaming a desk with bookings and re-reading `listMyBookingsInWindow`, `listBookings` and `listAllDesks` shows the new number in all three. Skipped (not failed) without the flag, so CI stays green with no database configured |

### Step 14 — Framework housekeeping

| Field    | Value                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------|
| Advances | traceability honesty, not an FR                                                                                                              |
| Files    | `apps/api/src/modules/desks/README.md` (create/modify — write path, no-pre-check rule, the CHECK-holds-for-UPDATE finding), `libs/contracts/src/desks.ts` docblock (modify — one line), `apps/api/src/modules/desks/desks.repository.ts` docblock (modify — one line), `ai/standards/api-standards.md` (modify — two edits: the stale desk-format-lives-in-domain line, and the `PATCH` vs `POST /:id/<verb>` convention), `inception/specs/index.md` (modify — the US-018 row), `knowledge/traceability/manifest.json` (modify — the US-018 entry, and US-017's `tests[]` repathed for the renamed hook spec) |
| Verify   | `node tools/aidlc-check.mjs` — expected: no failures, including the manifest-path check for both US-017 and US-018 |

### Final verification (whole-repo)

| Command                | Expected                                    |
| ------------------------ | ---------------------------------------------- |
| `npm run typecheck`     | clean                                         |
| `npm run lint`          | clean                                         |
| `npm test`              | all green, no skipped test outside the gated file |
| `node tools/aidlc-check.mjs` | no failures                              |

## Rollback

Revert the PR. There is no data migration to reverse — `desk_number` and `updated_at` are pre-existing columns, and a rename is a plain `UPDATE` with no side effects outside the `desks` row itself (AC-05: nothing is sent, nothing else is written). A revert restores the prior code and the prior desk numbers remain whatever an administrator last saved through it; no compensating data step is needed.

## Open questions

None outstanding. The design note's open items 1–8 are resolved by adopting its recommendations (see `decisions.md` D-01 through D-06); items 6 and 7 are forward notes for a future story/file and do not block this one.
