# PR: feat(admin): cancel an employee's booking on their behalf [US-015]

## Linked artifacts

- Story: `inception/stories/user-stories/US-015-cancel-a-booking-on-behalf.md` (Gate 1 baseline: `f57aecd357a8eb585be4ebf444e08db98487a024`)
- Design note: `inception/specs/US-015-cancel-a-booking-on-behalf/design-note.md` (Architect, advisory)
- ADR: none — see `decisions.md` D-03 for why

## AC → evidence

| AC | Implemented in | Proven by (test name) |
| --- | --- | --- |
| AC-01 | `AdminBookingRow.tsx` (Cancel button when `status==='confirmed'`) | `AdminBookingRow.spec.tsx`: `'renders one row with all four data fields and a Cancel button when confirmed (US-013/AC-03, US-015/AC-01)'` |
| AC-02 | `admin-bookings.repository.ts`'s `cancelAnyBooking` (`.eq('status','confirmed')`, `.gte('booking_date', today)`); `AdminBookingRow.tsx`'s reason text | `admin.routes.spec.ts`: `'a past-dated or non-existent booking id gets 404 booking_not_found (US-015/AC-02)'`; `AdminBookingRow.spec.tsx`: `'a completed row has no Cancel button, shows an em dash, and states the reason (US-015/AC-02)'` |
| AC-03 | `AllBookings.tsx`'s `ConfirmDialog` composition, `copy.ts`'s `cancelDialogTitle`/`cancelDialogBody` | `AllBookings.spec.tsx`: `"opening the dialog names that row's employee, desk and date (US-015/AC-03)"` |
| AC-04 | `admin-bookings.repository.ts`'s atomic `UPDATE`; `use-all-bookings.ts`'s `markCancelled` (no refetch) | `AllBookings.spec.tsx`: `'with status=confirmed active in filter state, the cancelled row stays present and reads Cancelled — no second fetch'` (cites US-015/AC-04 in its `describe`, exact scenario the design note flagged as the most likely wrong turn) |
| AC-05 | `admin-bookings.repository.ts`'s `cancelAnyBooking` write (`cancelled_by`); `copy.ts`'s `cancelledToast` | `admin-bookings.repository.spec.ts` (AC-05 in `describe`); `copy.spec.ts`: `'matches the real frame exactly, naming the employee, never an email address (US-015/AC-05, US-015/AC-06)'` |
| AC-06 | `admin-bookings.repository.ts`'s `cancelAnyBooking` write (`cancellation_source: 'admin'`) | Same repository test, asserting `cancellation_source` distinctly from `cancelled_by` (the QA note's exact warning); `copy.spec.ts` above |
| AC-07 | `use-admin-cancel-dialog.ts`'s synchronous `inFlight` guard; the atomic `UPDATE`'s `status='confirmed'` predicate | `use-admin-cancel-dialog.spec.ts`: `'confirm() issues exactly one request even when called twice while one is in flight — the second refused before any state read (US-015/AC-07)'`; **plus** a gated real-Postgres race test, not run in this environment — see Verification gaps |
| AC-08 | `use-admin-cancel-dialog.ts` (retryable outcome, dialog stays open) | `AllBookings.spec.tsx`: `'a failure keeps the dialog open with a danger alert and a Try again confirm label; the row stays Confirmed (US-015/AC-08)'` |
| AC-09 | `admin-bookings.service.ts`'s write-then-classify `cancelAnyBooking`; `use-all-bookings.ts`'s `markCancelled` on the `409` branch | `admin-bookings.service.spec.ts`: `'a write miss followed by a cancelled state classifies as already_cancelled (US-015/AC-09)'`; `AllBookings.spec.tsx` (already-cancelled describe, cites AC-09) |
| AC-10 | Structural absence — no checkbox/multi-select anywhere in `AllBookings.tsx`/`AdminBookingRow.tsx` | `AllBookings.spec.tsx`: `'has no checkbox role and one Cancel control per cancellable row, in both layouts (US-015/AC-10)'` |

## Command output (pasted, not summarized)

```
$ npm run lint
> eslint .
(no output — clean)

$ npm run typecheck
> tsc -p tsconfig.json --noEmit   (api)
> tsc -p tsconfig.json --noEmit   (ui)
> tsc -p tsconfig.json --noEmit   (contracts)
(no errors)

$ npm test
> @desk-booking/api@0.1.0 test
 Test Files  19 passed | 1 skipped (20)
      Tests  347 passed | 6 skipped (353)

> @desk-booking/ui@0.1.0 test
 Test Files  53 passed (53)
      Tests  489 passed (489)

> @desk-booking/contracts@0.1.0 test
 Test Files  7 passed (7)
      Tests  140 passed (140)

$ node tools/aidlc-check.mjs
aidlc-check: OK (framework 0.5.0, 519 IDs, 36 warnings)
```

## Verification gaps — disclosed, not hidden

1. **The gated real-Postgres concurrency tests are written but not run.** `bookings.repository.concurrency.spec.ts` gains two new tests under `RUN_BOOKINGS_CONCURRENCY_TEST=1` (a two-actor race — the booking's owner vs. an admin — and a two-admin race), proving the design note's §3.4 claim that `status='confirmed'` alone arbitrates concurrent cancels with no row-version column. They typecheck and are correctly **skipped** (not failed) without the flag, matching this repo's own convention (US-007, US-013). This environment has no disposable Supabase/Postgres project to point them at. **Please run them against a throwaway project before merging**, or accept the risk knowingly — the reasoning is proven by inspection (§3.4 of the design note) but not exercised.
2. **No live manual check of ST-07–ST-11 in a running browser.** This environment has no backing database to sign in against, so Step 13's "manual UI check at 1280/768/360px" could not be completed here. Every visual detail was confirmed against the real Figma frames before implementation (see `change-log.md`'s first two rows), and 976 automated tests (including full-DOM component tests for both layouts at every breakpoint's CSS class) pass, but nobody has looked at the rendered pixels yet.

## QA evidence

- Positive, negative and boundary cases per AC are listed in `design-note.md` §9's test-placement table and implemented as described above.
- Edge cases from the story's own QA notes: AC-05/AC-06 asserted as two *distinct* repository-level facts (not just "an email would be sent") so a shared "cancelled" template bug would fail loudly; AC-09 has the two-actor mirror of US-011's own AC-09; AC-02 has an explicit past-dated-booking test at the route level.
- No screenshots — see Verification gaps above.

## Checklist

- [x] Self-reviewed against `ai/quality/review-checklist.md`
- [x] `knowledge/traceability/manifest.json` updated; `node tools/aidlc-check.mjs` green locally
- [ ] Regression test citing the issue — n/a, this is a new story, not a bug fix
- [x] No unrelated changes; docs updated (`ai/standards/api-standards.md`, `apps/api/src/modules/bookings/README.md`, this spec package)
