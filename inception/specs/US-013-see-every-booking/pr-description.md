# PR: feat(admin): see every booking in the office [US-013]

## Linked artifacts

- Story: `inception/stories/user-stories/US-013-see-every-booking.md`
- Design note: `inception/specs/US-013-see-every-booking/design-note.md` (Architect, advisory — settles the endpoint contract, pagination shape, and the two DEV scope calls)
- ADR: none — the one real trade-off (offset vs keyset pagination) is recorded as a standards edit in `ai/standards/api-standards.md` §Pagination instead (design note §8, confirmed with the human)
- Fixes: none (net-new story)

## AC → evidence

| AC    | Implemented in | Proven by (test name) |
| ----- | --------------- | ----------------------- |
| AC-01 | `apps/ui/src/lib/auth/landing.ts:14` (unchanged — US-001/US-004 already send an admin here) | `landing.spec.ts: 'lands a signing-in admin on All bookings, not a dashboard (US-013/AC-01)'` |
| AC-02 | `admin-bookings.repository.ts` (`gte('booking_date', from)`, no status predicate) | `admin.routes.spec.ts: '... with all four fields, statuses derived (US-013/AC-02, US-013/AC-03, US-013/AC-06)'` |
| AC-03 | `admin-bookings.repository.ts`, `AdminBookingRow.tsx` (four fields, no fifth) | `admin.routes.spec.ts` (same as above); `AdminBookingRow.spec.tsx: 'renders one row with all four fields, and no action cell (US-013/AC-03)'` |
| AC-04 | `admin.router.ts` (`?page=`), `admin-bookings.service.ts` (`nextPage`), `use-all-bookings.ts` (`loadMore`) | `admin.routes.spec.ts: '51 matching rows shows a next page, and ?page=2 returns the 51st'`; `AllBookings.spec.tsx: 'is present iff nextPage is not null, and a press appends rows'` |
| AC-05 | `admin-bookings.repository.ts` (`from` takes any date, no floor) | `admin-bookings.repository.spec.ts: '... no date floor in the query (US-013/AC-05)'`; verified over 500 real days back in `bookings.repository.concurrency.spec.ts` |
| AC-06 | `admin-bookings.service.ts` (`bookingDisplayStatus`, reused from ADR-007) | `admin-bookings.service.spec.ts`; `admin.routes.spec.ts` (same test as AC-02/AC-03) |
| AC-07 | `admin-bookings.service.ts` (`total`), `all-bookings/copy.ts` (`countLine`) | `admin.routes.spec.ts: 'with 137 matching rows, page 1 carries total: 137'`; `copy.spec.ts` |
| AC-08 | `AllBookings.tsx` (`EmptyState`, `decisions.md` D-07) | `AllBookings.spec.tsx: 'renders only the empty-system message, with no "Add desks" action'` |
| AC-09 | `AllBookings.tsx` (`AdminSkeletonRow`, `Alert tone="danger"`) | `AllBookings.spec.tsx` (loading + load-error describe blocks) |
| AC-10 | inherited — `app.ts:78`'s existing `requireAdmin` mount, no new code | `admin.routes.spec.ts: 'refuses an Employee session with 403 and no booking data (US-013/AC-10)'` |
| AC-11 | `AdminBookingRow.tsx` (`layout` prop), `all-bookings.css` (`@media (min-width: 1024px)`) | `AdminBookingRow.spec.tsx` (table `<th>` order + card field order) |

## Command output (pasted, not summarized)

```
> npm run lint
> eslint .
(no output — clean)

> npm run typecheck
✓ libs/contracts, apps/api, apps/ui all pass tsc --noEmit

> npm test
apps/api:       Test Files  17 passed | 1 skipped (18)   Tests  292 passed | 4 skipped (296)
apps/ui:        Test Files  47 passed (47)                Tests  396 passed (396)
libs/contracts: Test Files  6 passed (6)                  Tests  120 passed (120)

> node tools/aidlc-check.mjs
aidlc-check: OK (framework 0.5.0, 519 IDs, 36 warnings — all pre-existing, e.g. missing Jira keys)

> RUN_BOOKINGS_CONCURRENCY_TEST=1 npm test --workspace @desk-booking/api -- concurrency
(against the project's disposable Supabase project)
✓ availabilityRepository.insertConfirmedBooking — real Postgres arbitration (US-007/FR-02) (2)
✓ adminBookingsRepository.listBookingsFromDate — real Postgres (US-013/AC-03, AC-04) (2)
  ✓ the user_profiles embed resolves via user_id, never cancelled_by — the HOLDER's name, not the canceller's
  ✓ a page far beyond the last row resolves to an empty page, never a thrown error
Test Files  1 passed (1)   Tests  4 passed (4)
```

## QA evidence

- Positive: default view returns today-onward bookings at every status (AC-02); paging boundary exactly at 50/51 (AC-04); no date floor proven with a fixture 500 days back (AC-05); Completed derivation reused verbatim from ADR-007, never re-implemented (AC-06).
- Negative/boundary: a non-numeric or out-of-bound `page` is rejected at the edge with `400 invalid_request`; an Employee session against the route gets `403 admin_only` with no booking data in the body (AC-10); a thrown repository error propagates as `500`, never swallowed into an empty page, keeping AC-08's real-empty-system distinguishable from a load failure.
- Runtime-only risks the fake-client unit tests structurally cannot prove, verified separately against real Postgres (design note §3.1, §3.4): the two-FK `user_profiles` embed resolves via `user_id`, not `cancelled_by`; a page past the last row surfaces as PostgREST's `PGRST103`, now mapped to an empty page (`decisions.md` D-10 — found by the real run, not anticipated).
- Manual browser check (1280/768/360px, against the same disposable Supabase project, seeded then removed a temporary admin account): the table renders at ≥1024px with real `<th>`s; a one-line card at 768px; a stacked card at 360px — all three screenshotted and matched against the real Figma frames pulled before implementation.
- Scope boundaries deliberately not built, each with a reason on record: filters and cancellation (US-014/US-015); the action/cancel column in any layout (`decisions.md` D-06, matching `BookingRow`'s own US-010→US-011 precedent); the desk-inventory-aware branch of the empty state (`decisions.md` D-07).

## Checklist

- [x] Self-reviewed against `ai/quality/review-checklist.md`
- [x] `knowledge/traceability/manifest.json` updated (`US-013.tests[]`, `US-013.decisions: ["ADR-004", "ADR-007"]`); `node tools/aidlc-check.mjs` green locally
- [ ] Regression test citing the issue — n/a, this is a new story, not a bug fix
- [x] No unrelated changes; `apps/api/src/modules/bookings/README.md` and `ai/standards/api-standards.md` updated where this story changes what they describe
