# US-017 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                         |
| --------- | ------------------------------------------------------- |
| **Story** | `inception/stories/user-stories/US-017-add-a-desk.md`   |
| **Spec**  | `spec.md`                                               |
| **Tier**  | Complex                                                 |

## Approval — Gate D1

| Field                | Value           |
| -------------------- | --------------- |
| Status               | **approved**    |
| Approved by          | Joy Joshua <joy_j@trigent.com> |
| Approved on          | 2026-09-19      |
| Plan commit approved | *uncommitted at approval* — base `e1a05a4b1a31195693fd0962ba8d38423c8ee91f` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`; if either is unset, ask them rather than writing `unknown`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**, the commit before this stamp. That SHA is what makes the approval verifiable: a reviewer at D2 runs `git diff <sha> -- <this file>` and sees whether the plan changed after approval. The name is self-asserted, so it is attribution, not authentication.

## Steps

Ordered. Each step names the files it touches, the `FR-##` it advances, and how it is verified. Test-first per acceptance criterion: the failing test named `... (US-###/AC-##)` comes before the code that turns it green.

### Step 1 — The shared desk-number rule and the write contract

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-02, FR-03, FR-04, FR-05                                  |
| Files    | `libs/contracts/src/desks.ts` (modify — add `DESK_NUMBER_PATTERN`, `normalizeDeskNumber`, `deskNumberSchema`, `deskCreateSchema`), `libs/contracts/src/error.ts` (modify — add `'desk_number_taken'`), `libs/contracts/src/desks.spec.ts` (modify — AC-02's table-driven cases, AC-03's normalisation + idempotence, AC-05's collision-equivalence cases) |
| Verify   | `npm test -w @desk-booking/contracts` — all new cases pass; `npm run typecheck -w @desk-booking/contracts` — clean |

### Step 2 — The insert, and the duplicate outcome

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-01, FR-04, FR-05                                         |
| Files    | `apps/api/src/modules/desks/desks.repository.ts` (modify — `insertDesk`, `InsertDeskOutcome`; correct the stale `desks.repository.ts:5` docblock), `apps/api/src/modules/desks/desks.repository.spec.ts` (modify — recorded insert with no `is_active`; `23505` naming `desks_desk_number_key` → duplicate; any other `23505` throws; a `23514` throws) |
| Verify   | `npm test -w @desk-booking/api -- desks.repository` — new cases pass |

### Step 3 — The service maps the outcome

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-01                                                        |
| Files    | `apps/api/src/modules/desks/desks.service.ts` (modify — `createDesk`), `apps/api/src/modules/desks/desks.service.spec.ts` (modify) |
| Verify   | `npm test -w @desk-booking/api -- desks.service` — new cases pass |

### Step 4 — `POST /api/admin/desks`

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-01, FR-02, FR-04, FR-08                                   |
| Files    | `apps/api/src/modules/admin/admin.router.ts` (modify — new route; the four existing `DesksRepository` stub call sites in `admin.routes.spec.ts` will need a no-op `insertDesk` added to typecheck), `apps/api/src/modules/admin/admin.routes.spec.ts` (modify — new `describe('POST /desks')`: AC-01 (201), AC-02 (400 on a raw bad-shape body), AC-04 (409 `desk_number_taken`), AC-08 (403 for an Employee session, extending the existing describe) |
| Verify   | `npm test -w @desk-booking/api` — full suite green; `npm run typecheck -w @desk-booking/api` — clean |

### Step 5 — Extract the shared `Dialog` shell; `ConfirmDialog` composes it

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-11 (enables FR-09)                                        |
| Files    | `apps/ui/src/components/dialog/Dialog.tsx` (create), `apps/ui/src/components/dialog/Dialog.spec.tsx` (create), `apps/ui/src/components/dialog/dialog.css` (create — moved from `confirm-dialog.css`), `apps/ui/src/components/confirm-dialog/ConfirmDialog.tsx` (modify — composes `Dialog`, behaviour-preserving), `apps/ui/src/components/confirm-dialog/confirm-dialog.css` (modify — shrinks to what is not shell) |
| Verify   | `npm test -w @desk-booking/ui -- confirm-dialog` — **`ConfirmDialog.spec.tsx` passes unedited** (the proof the refactor is behaviour-preserving); `npm test -w @desk-booking/ui -- dialog` — new shell tests pass |

### Step 6 — `TextField` gains `helper`

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | (supports FR-02 rendering)                                    |
| Files    | `apps/ui/src/components/text-field/TextField.tsx` (modify — additive `helper?: ReactNode` prop, folded into the composed `aria-describedby`), `apps/ui/src/components/text-field/TextField.spec.tsx` (modify — the helper's association) |
| Verify   | `npm test -w @desk-booking/ui -- TextField` — green, including new + existing cases |

### Step 7 — The browser-side outcome adapter and the in-place list update

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-04, FR-07, FR-10                                          |
| Files    | `apps/ui/src/lib/add-desk.ts` (create — `AddDeskOutcome`, the fetcher), `apps/ui/src/lib/add-desk.spec.ts` (create), `apps/ui/src/lib/use-desks.ts` (modify — `markAdded`, sorted insert), `apps/ui/src/lib/use-desks.spec.ts` (modify) |
| Verify   | `npm test -w @desk-booking/ui -- add-desk use-desks` — green |

### Step 8 — The dialog's state machine (AC-06's guard)

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-06                                                        |
| Files    | `apps/ui/src/screens/desks/use-add-desk-dialog.ts` (create), `apps/ui/src/screens/desks/use-add-desk-dialog.spec.ts` (create — two synchronous `submit()` calls issue exactly one fetch) |
| Verify   | `npm test -w @desk-booking/ui -- use-add-desk-dialog` — green |

### Step 9 — `DeskFormDialog` and its copy

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-02, FR-03, FR-04, FR-06, FR-07, FR-09                      |
| Files    | `apps/ui/src/screens/desks/DeskFormDialog.tsx` (create — ST-01, ST-03, ST-04, ST-05, ST-07), `apps/ui/src/screens/desks/DeskFormDialog.spec.tsx` (create), `apps/ui/src/screens/desks/copy.ts` (modify — SCR-007 strings, `deskAddedToast`), `apps/ui/src/screens/desks/copy.spec.ts` (modify) |
| Verify   | `npm test -w @desk-booking/ui -- DeskFormDialog copy` — green |

### Step 10 — Wire `Desks.tsx`; retire the forcing tests

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-01, FR-06, FR-10                                          |
| Files    | `apps/ui/src/screens/desks/Desks.tsx` (modify — `AddDeskButton` enabled and opens the dialog; renders `DeskFormDialog`; renders the toast on success), `apps/ui/src/screens/desks/Desks.spec.tsx` (modify — **delete** the header forcing test at `:143-150`; **edit** the empty-state loop at `:84-92` to assert enabled, keeping its `US-016/AC-06` citation; add AC-01/06/10 coverage for the add flow), `apps/ui/src/screens/desks/desks.css` (modify only if the plus icon is wired — Step 9 note) |
| Verify   | `npm test -w @desk-booking/ui -- Desks` — green, no forcing-test titles remain for US-017 |

### Step 11 — Housekeeping docblocks (design note §8)

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | (no FR — required by the design note and `ai/gates/delivery.md`'s doc-currency expectation) |
| Files    | `apps/api/src/modules/desks/README.md` (modify — declare the write path, the `23505` mapping, the normalisation contract), `apps/api/src/domain/README.md` (modify — line 10 corrected: the desk-number rule lives in `libs/contracts`, not `domain/`, since it has no clock dependency — see `decisions.md` D-03 for why this also means `ai/standards/api-standards.md:19-21`'s literal text is followed by precedent rather than by the letter), `libs/contracts/src/desks.ts` (modify — file-level docblock, no longer "US-014's slice" only) |
| Verify   | Read-through only; no test |

### Step 12 — Traceability

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | (framework bookkeeping)                                     |
| Files    | `knowledge/traceability/manifest.json` (modify — US-017 entry: `requirements`, `acs`, `tests[]` — every spec file touched above that carries a `US-017/AC-##` citation, per `traceability.md`), `inception/specs/index.md` (modify — the US-017 row) |
| Verify   | `node tools/aidlc-check.mjs` — OK |

## Rollback

Revert the PR. No migration, no data write outside the `desks` table's own new rows, no config or env change. A revert removes the endpoint and the UI entry point; any desks already created by administrators through this flow remain valid rows (creating a desk is not something a revert should undo — the data is real inventory, not test artefacts).

## Open questions

None blocking. The two real decisions this story raised — the status-radio conflict between SCR-007 and US-017, and whether to extract the shared `Dialog` in this PR — were both resolved by the human on 2026-09-19: no radio in this story ([issue #49](https://github.com/jjoyjoshua/new-aidlc-employee-exchange/issues/49) tracks reconciling SCR-007 and the story), and extract `Dialog` now (Step 5). SCR-007's `Surface` line still names `/admin/desks/new` as a stale route reference (design note §4.1, open item 3) — a spec-text correction owned by `/ux`, not a blocker to this plan (see `decisions.md` D-02).
