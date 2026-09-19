# PR: feat(bookings): cancel my own booking [US-011]

## Linked artifacts

- Story: `inception/stories/user-stories/US-011-cancel-my-own-booking.md` (Gate 1 baseline: `0130e45`)
- Design note (advisory): `inception/specs/US-011-cancel-my-own-booking/design-note.md`
- Spec package: `inception/specs/US-011-cancel-my-own-booking/`

## AC → evidence

| AC    | Implemented in | Proven by (test name) |
| ----- | -------------- | ---------------------- |
| AC-01 | `BookingRow.tsx`, `MyBookings.tsx` | `BookingRow.spec.tsx`: `'renders a Cancel control that calls onCancel, when it is supplied (US-011/AC-01)'` |
| AC-02 | `bookings.repository.ts` (`.gte('booking_date', today)`), `bookings.service.ts` | `bookings.routes.spec.ts`: `'refuses a past-dated Confirmed booking with 404, and the row is still confirmed afterwards (US-011/AC-02)'`; cross-endpoint consistency test in the same file |
| AC-03 | `ConfirmDialog.tsx` (focus trap/restore, close icon), `MyBookings.tsx` | `ConfirmDialog.spec.tsx`: `'traps Tab focus within the dialog (US-011/AC-03)'`; `MyBookings.spec.tsx` dialog-naming/Escape test |
| AC-04 | `bookings.router.ts`, `use-cancel-dialog.ts`, `use-my-bookings.ts` (`markCancelled`) | `MyBookings.spec.tsx`: `'flips the row to Cancelled in Past (US-011/AC-05), shows a toast naming the desk/date/email (US-011/AC-04), ...'` |
| AC-05 | same as AC-04 | same test |
| AC-06 | `MyBookings.tsx` (no new auth surface) | same test's negative assertion (`US-011/AC-06`) |
| AC-07 | `use-cancel-dialog.ts` (in-flight ref guard), `ConfirmDialog.tsx` (Escape `!busy` guard) | `use-cancel-dialog.spec.ts`: `'confirm() issues exactly one request even when called twice while one is in flight (US-011/AC-07)'`; `MyBookings.spec.tsx` double-activation test |
| AC-08 | `ConfirmDialog.tsx` (`error` prop), `use-cancel-dialog.ts` (`retryable` outcome) | `MyBookings.spec.tsx`: US-011/AC-08 failed-cancellation test |
| AC-09 | `libs/contracts/src/error.ts` (`booking_already_cancelled`), `bookings.repository.ts` (`findMyBookingState`), `bookings.service.ts`, `bookings.router.ts` (409), `ConfirmDialog.tsx` (`singleAction`) | `bookings.routes.spec.ts`: `'the two-actor test: an admin-style cancel wins first, then the owner's own cancel gets 409 with attribution unchanged (US-011/AC-09)'` |
| AC-10 | `bookings.service.ts` (single-write invariant; US-029 sends the actual email) | `bookings.service.spec.ts`: `'maps a successful UPDATE to ok, and issues no disambiguating read at all — exactly one write, the invariant US-011/AC-10's "no second email" rests on'` |

## Command output (pasted, not summarized)

```
$ npm run lint
> employee-desk-booking@0.1.0 lint
> eslint .

(no output — clean)

$ npm run typecheck
> employee-desk-booking@0.1.0 typecheck
> npm run build:contracts && npm run typecheck --workspaces --if-present

> @desk-booking/contracts@0.1.0 build
> tsc -p tsconfig.json

> @desk-booking/api@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit

> @desk-booking/ui@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit

> @desk-booking/contracts@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit

$ npm test
> employee-desk-booking@0.1.0 test
> npm run build:contracts && npm test --workspaces --if-present

> @desk-booking/api@0.1.0 test
> vitest run

 Test Files  14 passed | 1 skipped (15)
      Tests  263 passed | 2 skipped (265)

> @desk-booking/ui@0.1.0 test
> vitest run

 Test Files  43 passed (43)
      Tests  347 passed (347)

> @desk-booking/contracts@0.1.0 test
> vitest run

 Test Files  6 passed (6)
      Tests  108 passed (108)

$ node tools/aidlc-check.mjs
aidlc-check: OK (framework 0.5.0, 518 IDs, 36 warnings — all pre-existing, none from this PR)
```

## QA evidence

- **Positive**: every AC has at least one test citing `US-011/AC-##` (see table above and
  `traceability.md`).
- **Negative**: AC-02's past-date refusal (row unchanged afterwards, not just the status code);
  AC-08's failure path (dialog stays open, row stays Confirmed).
- **Boundary / race**: AC-09's two-actor test (an admin-style cancel wins first; the owner's own
  cancel gets `409` with the first actor's attribution untouched) — the story's own QA note calls
  this the one most likely to be missed. AC-07's double-activation test (exactly one request,
  synchronous `inFlight` ref guard, not just a disabled button).
- **Regression guard**: `ExistingBookingState.spec.tsx` gained two cases proving the widened
  shared `cancel-booking.ts` fetcher still converges the already-shipped Book-a-desk "already
  booked that date" flow to success on `already_cancelled`/`refused`, exactly as it did on the old
  `404`-only shape (`US-007/AC-07` regression guard) — this is the fix for a regression the design
  note identified before any code was written (§8.2).
- **A live pre-existing defect fixed in passing**: `ConfirmDialog`'s Escape handler had no `busy`
  guard, so pressing Escape mid-cancel could dismiss the dialog while a request was still in
  flight — a bug on the already-shipped Book-a-desk dialog too, not just this story's new one.
- **UI verified against the real Figma frames**, not the written screen spec alone (node ids in
  `traceability.md`) — this surfaced three real gaps in the pre-existing shared `ConfirmDialog`
  component (missing close icon, wrong width/overlay tokens, no mobile bottom sheet), all fixed
  here and documented in `decisions.md`.
- No browser/e2e tests — none of this story's ACs need one; every AC is provable at the
  unit/component/API level (see `design-note.md` §10's test-placement table).

## Checklist

- [x] Self-reviewed against `ai/quality/review-checklist.md`
- [x] `knowledge/traceability/manifest.json` updated; `node tools/aidlc-check.mjs` green locally
- [x] No unrelated changes; docs updated where behavior/commands changed (`bookings/README.md`,
      US-007's `traceability.md` corrected for the `cancel-booking.ts` move, four docblocks
      correcting US-007/D-03's now-partially-superseded claim)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
