# PR: feat(admin): add a desk with a unique number [US-017]

## Linked artifacts

- Story: `inception/stories/user-stories/US-017-add-a-desk.md` (Gate 1 baseline: `0130e45`)
- Design note: `inception/specs/US-017-add-a-desk/design-note.md` (Architect, advisory)
- ADR: none — see `decisions.md` and the design note §8 for why
- Related: [issue #49](https://github.com/jjoyjoshua/new-aidlc-employee-exchange/issues/49) (`change-request`, does not block this PR) — reconciling SCR-007's approved status-radio frames against this story's own ACs, which name no such control

## AC → evidence

| AC | Implemented in | Proven by (test name) |
| --- | --- | --- |
| AC-01 | `desks.repository.ts`'s `insertDesk` (no `is_active` named — the column default is the AC); `admin.router.ts`'s `POST /desks` | `desks.repository.spec.ts`: `'inserts with the given desk_number ONLY — no is_active, no id, no timestamps (US-017/AC-01)'`; `admin.routes.spec.ts`: `'a valid body creates the desk and returns 201 with bookedAhead: 0 (US-017/AC-01)'`; `Desks.spec.tsx`: `'a successful add inserts the new desk into the list, in number order, with no second GET /desks fetch, and shows a toast (US-017/AC-01)'` |
| AC-02 | `libs/contracts/src/desks.ts`'s `DESK_NUMBER_PATTERN`, `deskCreateSchema`; `DeskFormDialog.tsx`'s client-side check before `onSubmit` | `desks.spec.ts`: the table-driven `deskCreateSchema` cases (`US-017/AC-02`); `DeskFormDialog.spec.tsx`: `'refuses %s with the shape message and never calls onSubmit (US-017/AC-02)'`; `admin.routes.spec.ts`: `'a malformed body is refused at the edge with 400 invalid_request, and no insert is attempted (US-017/AC-02)'` |
| AC-03 | `libs/contracts/src/desks.ts`'s `normalizeDeskNumber` (trim, then upper), applied by `deskCreateSchema`'s `.transform` | `desks.spec.ts`: `'normalises a lower-case entry to upper case on the parsed OUTPUT (US-017/AC-03)'`; `desks.repository.spec.ts`: `'the insert carries the value passed in verbatim — normalisation is the caller's (US-017/AC-03)'` |
| AC-04 | `desks.repository.ts`'s `23505` → `{kind:'duplicate'}` mapping; `libs/contracts/src/error.ts`'s `desk_number_taken`; `admin.router.ts`'s `409`; `DeskFormDialog.tsx`'s warning `Alert` with the case-collision sentence | `desks.repository.spec.ts`: `'returns { kind: "duplicate" } on a 23505 naming desks_desk_number_key (US-017/AC-04, AC-05)'`; `admin.routes.spec.ts`: `'a duplicate desk number gets 409 desk_number_taken (US-017/AC-04)'`; `DeskFormDialog.spec.tsx`: the ST-04 duplicate describe block |
| AC-05 | `0002_desks.sql`'s existing `desks_desk_number_format` CHECK + `desks_desk_number_key` unique index (unmodified — no migration); `normalizeDeskNumber`'s trim | `desks.spec.ts`: `'treats a-01, "A-01 " and "A-01" as the same normalised value (US-017/AC-04, AC-05)'` |
| AC-06 | `use-add-desk-dialog.ts`'s synchronous `inFlight` ref; `Button`'s existing `busy`/`disabled` behaviour | `use-add-desk-dialog.spec.ts`: `'submit() issues exactly one request even when called twice while one is in flight ... (US-017/AC-06)'`; `Desks.spec.tsx`: `'a second activation while the first save is in flight issues exactly one request (US-017/AC-06)'` |
| AC-07 | `lib/add-desk.ts`'s `AddDeskOutcome` mapping (every non-duplicate failure → `failed`); `DeskFormDialog.tsx`'s ST-07 rendering, retaining the typed value | `add-desk.spec.ts`: `'maps every other error code to failed (US-017/AC-07)'`, `'maps a transport failure (unavailable) to failed (US-017/AC-07)'`; `DeskFormDialog.spec.tsx`: the ST-07 describe block |
| AC-08 | Inherited: `require-admin.ts`'s mount at `/api/admin` (`http/app.ts`) | `admin.routes.spec.ts`: `'refuses an Employee session with 403 admin_only, reaching the real mount (US-017/AC-08)'` |
| AC-09 | `components/dialog/dialog.css` — mobile-first sheet, `@media (min-width: 768px)` override (moved unchanged from `confirm-dialog.css`) | `Dialog.spec.tsx`: `'is a mobile-first bottom sheet by default, with the centred 480px card only from 768px up (US-017/AC-09)'` |

## Command output (pasted, not summarized)

```
$ npm run lint
> eslint .
(no output — clean)

$ npm run typecheck
> tsc -p tsconfig.json --noEmit   (contracts, build)
> tsc -p tsconfig.json --noEmit   (api)
> tsc -p tsconfig.json --noEmit   (ui)
> tsc -p tsconfig.json --noEmit   (contracts)
(no errors)

$ npm test
> @desk-booking/api@0.1.0 test
 Test Files  19 passed | 1 skipped (20)
      Tests  372 passed | 6 skipped (378)

> @desk-booking/ui@0.1.0 test
 Test Files  60 passed (60)
      Tests  581 passed (581)

> @desk-booking/contracts@0.1.0 test
 Test Files  7 passed (7)
      Tests  168 passed (168)

$ node tools/aidlc-check.mjs
aidlc-check: OK (framework 0.5.0, 519 IDs, 36 warnings)
```

## QA evidence

- Positive, negative and boundary cases per AC are listed in `design-note.md` §10's test-placement table and implemented as described above, at the lowest level that can prove each: contract-level for the format/normalisation rule (shared by both sides), repository-level for the `23505`/`23514` mapping, route-level for the HTTP contract, and component-level for the three refusal renderings (ST-03/ST-04/ST-07), which are the ones easiest to conflate.
- **The behaviour-preservation proof for the `Dialog` extraction is `ConfirmDialog.spec.tsx` passing completely unedited** — its 12 tests (US-007/AC-07, US-011, US-015's cancel flows) are the evidence that pulling the shared shell out of `ConfirmDialog` and into a new `Dialog` component changed nothing about the existing cancel dialogs used by `MyBookings` and `AllBookings`.
- Edge cases from the story's own notes: a desk number previously held by a now-deactivated desk is still a duplicate — the unique index makes no distinction on `is_active`, so this holds without a dedicated code path or test; the 26×99 format ceiling is enforced structurally by the regex, not by a separate check.
- The one thing most likely to ship wrong, per the design note (§2.4): normalising the desk number only in the browser and not on the schema. `admin.routes.spec.ts`'s `'normalises the body BEFORE it reaches the repository'` test posts a raw lower-case body directly, bypassing the browser's own validation, to prove the server-side `.transform` is what actually does the normalising.

## Verification gaps — disclosed, not hidden

1. **No live manual check in a running browser**, for the same reason US-016's PR disclosed: no backing Supabase/Postgres project in this environment. Please check the bottom-sheet-to-modal transition at the 768px boundary and the keyboard-raised 360px case in a live app before merging.
2. **The `icon-plus.svg` fidelity fix the design note names as optional (§6.3, open item 7) was not done.** The header **Add desk** button still renders as text-only, not the icon-plus-label frame Figma draws. No AC requires it; flagged so it reads as a deliberate deferral rather than an oversight.
3. **`inception/specs/US-011-cancel-my-own-booking/traceability.md`'s FR-10 row was corrected** (one file path, `confirm-dialog.css` → `dialog.css`) because this PR moved the CSS it pointed at. `ConfirmDialog.tsx`'s behaviour is unchanged; only where the styling rules physically live moved. Called out here since it touches another story's package.
4. **The status-radio conflict between SCR-007's approved frames and this story's own ACs is real and unresolved** — built to the story (no radio), tracked in [issue #49](https://github.com/jjoyjoshua/new-aidlc-employee-exchange/issues/49) for the PO/BA to reconcile. Does not block this PR.

## Checklist

- [x] Self-reviewed against `ai/quality/review-checklist.md`
- [x] `knowledge/traceability/manifest.json` updated; `node tools/aidlc-check.mjs` green locally
- [ ] Regression test citing the issue — n/a, this is a new story, not a bug fix
- [x] No unrelated changes; docs updated (`apps/api/src/modules/desks/README.md`, `apps/api/src/domain/README.md`, `libs/contracts/src/desks.ts`'s file docblock, this spec package, US-011's own `traceability.md`/`change-log.md` for the moved `dialog.css`)
