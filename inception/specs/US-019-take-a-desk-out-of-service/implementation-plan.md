# US-019 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                         |
| --------- | ------------------------------------------------------------------------|
| **Story** | `inception/stories/user-stories/US-019-take-a-desk-out-of-service.md` |
| **Spec**  | `spec.md`                                                              |
| **Tier**  | Complex                                                                |

## Approval — Gate D1

| Field                | Value           |
| -------------------- | --------------- |
| Status               | **approved**    |
| Approved by          | Joy Joshua <joy_j@trigent.com> |
| Approved on          | 2026-09-19      |
| Plan commit approved | *uncommitted at approval* — base `e96bfbaf5690f740c6eccab237b5f979ab34afeb` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**.

## Steps

Test-first per acceptance criterion: the failing test named `... (US-019/AC-##)` comes before the code that turns it green.

### Step 1 — ADR-009 and the standards edit (no code)

| Field    | Value                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| Advances | FR-07 (grounds it)                                                                                          |
| Files    | `knowledge/decisions/ADR-009-structured-error-detail.md` (create), `ai/standards/api-standards.md` (modify — one paragraph in the Errors section pointing at ADR-009) |
| Verify   | Read-through only; no test. `node tools/aidlc-check.mjs` still passes with the new file present            |

### Step 2 — Contract: the error body's `details` field and the desk-blocked schema

| Field    | Value                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------|
| Advances | FR-07                                                                                                                        |
| Files    | `libs/contracts/src/error.ts` (modify — `errorBodySchema` gains optional `details: z.record(z.unknown())`), `libs/contracts/src/error.spec.ts` (modify), `libs/contracts/src/desks.ts` (modify — add `deskBlockedDetailsSchema`, `DeskBlockedDetails`, `deskStateResponseSchema`, `DeskStateResponse`; add `'desk_has_upcoming_bookings'` to `errorCodeSchema` in `error.ts`), `libs/contracts/src/desks.spec.ts` (modify) |
| Verify   | `npm test -w libs/contracts` — expected: an error body with no `details` still parses and re-serialises byte-identical to today (no `details` key present); one with `details` parses it as an untyped record; `deskBlockedDetailsSchema` accepts `{ upcomingBookings: 3 }` and rejects `{ upcomingBookings: 0 }` |

### Step 3 — Server: `HttpError` carries optional `details`

| Field    | Value                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-07                                                                                                            |
| Files    | `apps/api/src/http/errors.ts` (modify — `HttpError` constructor gains an optional fourth argument; `toBody()` spreads it in only when present; `unprocessable` gains the parameter), `apps/api/src/http/errors.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- errors` — expected: every existing `toBody()` case is byte-identical (no `details` key); a `details`-carrying error includes it |

### Step 4 — Repository: `countUpcomingConfirmedForDesk`, `setDeskActive`

| Field    | Value                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------|
| Advances | FR-05, FR-06, FR-10                                                                                                                        |
| Files    | `apps/api/src/modules/desks/desks.repository.ts` (modify — add both methods and their outcome types), `apps/api/src/modules/desks/desks.repository.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- desks.repository` — expected: `countUpcomingConfirmedForDesk` issues `{ count: 'exact', head: true }` filtered by `desk_id`, `status`, `booking_date >= from`, and returns a number, never rows; `setDeskActive` records exactly `.update({ is_active })` keyed on `.eq('id', ...)` with **no `updated_at`** and **no `23505` handling**; zero matched rows → `not_found` |

### Step 5 — Service: `deactivateDesk`, `activateDesk`

| Field    | Value                                                                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------|
| Advances | FR-01, FR-02, FR-05, FR-06, FR-10                                                                                                            |
| Files    | `apps/api/src/modules/desks/desks.service.ts` (modify — add both methods and their outcome types), `apps/api/src/modules/desks/desks.service.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- desks.service` — expected: a desk with 3 upcoming Confirmed bookings returns `{ kind:'blocked', upcomingBookings:3 }` and `setDeskActive` is **never called** (AC-05's structural half); a desk with 0 upcoming deactivates successfully; the same desk id blocked-then-cleared succeeds on a second call with nothing cached (AC-07); `activateDesk` makes **no** call to `countUpcomingConfirmedForDesk` (AC-09's server-side half); the predicate comes from `displayStatusPredicate`, asserted by checking the repository call's `status`/`from` arguments trace back to it, not a literal |

### Step 6 — Route: `POST /api/admin/desks/:id/deactivate`, `.../activate`

| Field    | Value                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01, FR-02, FR-07, FR-14                                                                                        |
| Files    | `apps/api/src/modules/admin/admin.router.ts` (modify — two routes, placed after `PATCH /desks/:id`), `apps/api/src/modules/admin/admin.routes.spec.ts` (modify — extend the `noDesks` base with two throwing stubs, per the design note's mechanical note 1) |
| Verify   | `npm test -w apps/api -- admin.routes` — expected: deactivate success → `200` with `{ id, deskNumber, isActive }`, no `bookedAhead`; blocked → `422 desk_has_upcoming_bookings` with `details.upcomingBookings` equal to the fake's count, asserted on the **raw** JSON body; not-found → `404 desk_not_found`; activate success → `200`; an Employee session → `403` on both routes, reaching the real mount; no session → `401` |

### Step 7 — Regression: AC-02 is already built

| Field    | Value                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------|
| Advances | FR-03                                                                                                       |
| Files    | `apps/api/src/modules/admin/admin.routes.spec.ts` or `apps/api/src/modules/bookings/bookings.routes.spec.ts` (modify — one new test only; no production file in `modules/bookings` changes) |
| Verify   | `npm test -w apps/api -- bookings.routes` (or wherever the test lands) — expected: deactivate a desk, then `POST /api/bookings` naming it, asserts `422 desk_inactive`. A diff to any file under `apps/api/src/modules/bookings/**` other than this spec fails review |

### Step 8 — `Dialog`: additive `icon` prop

| Field    | Value                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------|
| Advances | NFR-01                                                                                                     |
| Files    | `apps/ui/src/components/dialog/Dialog.tsx` (modify — `icon?: ReactNode`, rendered before the title, `aria-hidden`), `apps/ui/src/components/dialog/Dialog.spec.tsx` (modify) |
| Verify   | `npm test -w apps/ui -- Dialog.spec` — expected: a caller-supplied `icon` renders in the header; omitting it renders exactly as today; `ConfirmDialog.spec.tsx` stays green **unedited**, proving the addition is additive |

### Step 9 — Copy strings

| Field    | Value                                                                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------|
| Advances | FR-04, FR-05, FR-08, FR-09, FR-12, FR-13                                                                                                     |
| Files    | `apps/ui/src/screens/desks/copy.ts` (modify — deactivate-confirm and blocked-dialog strings, ST-08 retry copy, ST-09/ST-10 toasts, the activation-failure banner string; delete `UNAVAILABLE_CONTROL_REASON`), `apps/ui/src/screens/desks/copy.spec.ts` (modify) |
| Verify   | `npm test -w apps/ui -- copy` — expected: `blockedDialogBody`/`seeBookingsLabel` cover both the singular (`count === 1`) and plural forms; every string matches its frame-verified text in `design-note.md` §8.4 verbatim |

### Step 10 — `DeskDeactivateDialog` (ST-05, ST-06, ST-07, ST-08)

| Field    | Value                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-04, FR-05, FR-08, FR-09, FR-13                                                                                                                              |
| Files    | `apps/ui/src/screens/desks/DeskDeactivateDialog.tsx` (create — composes `Dialog` directly, four states), `apps/ui/src/screens/desks/DeskDeactivateDialog.spec.tsx` (create) |
| Verify   | `npm test -w apps/ui -- DeskDeactivateDialog` — expected: ST-05 renders title/body/`Deactivate`/`Keep it active`; ST-06 renders the count in **both** the body and the primary button label, footer has exactly two controls and none mentions cancelling, `role="alertdialog"`, initial focus on the body text not the button; ST-07 disables both footer controls and the close icon, keeps the `Deactivate` label with a spinner; ST-08 shows a danger `Alert`, changes dismiss to `Close` and confirm to `Try again`; the primary action in ST-06 is an `<a>`/`Link` with the correct `href` |

### Step 11 — `lib/deactivate-desk.ts`, `lib/activate-desk.ts`

| Field    | Value                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------|
| Advances | FR-01, FR-02, FR-05, FR-13                                                                                                       |
| Files    | `apps/ui/src/lib/deactivate-desk.ts` (create), `apps/ui/src/lib/deactivate-desk.spec.ts` (create), `apps/ui/src/lib/activate-desk.ts` (create), `apps/ui/src/lib/activate-desk.spec.ts` (create) |
| Verify   | `npm test -w apps/ui -- deactivate-desk activate-desk` — expected: `deactivate-desk` maps `200`→`ok`, a `422 desk_has_upcoming_bookings` with a valid `details.upcomingBookings`→`blocked`, the **same code with a missing or non-positive count**→`failed` (never a wrong number), and `404`/`5xx`/unavailable→`failed`; `activate-desk` maps `200`→`ok` and everything else→`failed` |

### Step 12 — `use-desks.ts`: `markStateChanged`

| Field    | Value                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------|
| Advances | FR-12                                                                                                       |
| Files    | `apps/ui/src/lib/use-desks.ts` (modify — add `markStateChanged`), `apps/ui/src/lib/use-desks.spec.ts` (modify) |
| Verify   | `npm test -w apps/ui -- use-desks` — expected: deactivating sets `isActive: false` **and** `bookedAhead: 0`, with no re-sort (row keeps its index); activating sets `isActive: true` and leaves `bookedAhead` untouched |

### Step 13 — `DeskInventoryRow`: the toggle goes live

| Field    | Value                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------|
| Advances | FR-01, FR-02, FR-11, FR-14                                                                                                                  |
| Files    | `apps/ui/src/screens/desks/DeskInventoryRow.tsx` (modify — toggle enabled, gains `onToggleActive`; docblock corrected), `apps/ui/src/screens/desks/DeskInventoryRow.spec.tsx` (modify — replace the surviving forcing test with a positive enabled-and-calls-back test, per the design note's mechanical note 3, keeping a `US-016/AC-08` citation on the still-true half) |
| Verify   | `npm test -w apps/ui -- DeskInventoryRow` — expected: the toggle is enabled at every width, labelled `Deactivate` when active / `Activate` when inactive, and calls `onToggleActive(desk)` |

### Step 14 — `Desks.tsx`: wire the flow end to end

| Field    | Value                                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-02, FR-04–FR-06, FR-08, FR-09, FR-11–FR-14 (integration)                                                                                             |
| Files    | `apps/ui/src/screens/desks/Desks.tsx` (modify — dialog open/close, activate called directly with no dialog, `markStateChanged`, the toasts, the page-level activation-failure `Alert`), `apps/ui/src/screens/desks/Desks.spec.tsx` (modify) |
| Verify   | `npm test -w apps/ui -- Desks.spec` — expected: clicking **Activate** issues the request with **no dialog rendered at any point**; clicking **Deactivate** on an eligible desk opens ST-05, confirming issues the request and on success updates the row and shows the toast; a blocked response switches the **same mounted dialog** to ST-06 with the server's count (not the row's own, provably `0` on this path); a row whose held `bookedAhead` is stale-high still shows ST-06 correctly (the AC-08 browser-side case); a failed activation shows the page-level `Alert` with the row reverted |

### Step 15 — Framework housekeeping

| Field    | Value                                                                                                                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Advances | traceability honesty, not an FR                                                                                                                                                                                              |
| Files    | `apps/api/src/modules/desks/README.md` (modify — the new write path, the no-`updated_at` decision, the new count method and why it differs from `listUpcomingConfirmedDeskIds`, the §6.2 race window and its named closing fix), `apps/api/src/modules/desks/desks.repository.ts:2-5` docblock (modify), `apps/api/src/modules/desks/desks.service.ts:36-38,:94-97` docblocks (modify — mark the predictions fulfilled), `inception/specs/index.md` (modify — add the US-019 row), `knowledge/traceability/manifest.json` (modify — the US-019 entry, `requirements[]`, `acs[]`, `tests[]`) |
| Verify   | `node tools/aidlc-check.mjs` — expected: no failures                                                                                                                                                                          |

### Final verification (whole-repo)

| Command                      | Expected                                          |
| ----------------------------- | -------------------------------------------------- |
| `npm run typecheck`           | clean                                              |
| `npm run lint`                | clean                                              |
| `npm test`                    | all green                                          |
| `node tools/aidlc-check.mjs`  | no failures                                        |

## Rollback

Revert the PR. There is no data migration to reverse: `is_active` already exists and already defaults `true`, and neither endpoint sets `updated_at`. A revert leaves whatever `is_active` value administrators last set through the endpoints — a desk left `Inactive` after a revert stays reachable and correctable through direct SQL if ever needed, exactly as it is today before this story ships. No compensating data step is required.

## Open questions

None outstanding. The design note's open items 1–4 are resolved by the human's confirmed choices (all four recommended defaults — see `decisions.md` D-01 through D-04). Open item 5 (the activation-failure AC gap) is out of scope per `spec.md` and is a candidate `change-request` for `/ba`, pending the human's decision to file it. Open items 6 and 7 are non-blocking notes (§8.5's cross-screen import, ADR-009's number) and are resolved in `decisions.md`.
