# PR: feat(bookings): refresh My bookings on regaining focus [US-012]

## Linked artifacts

- Story: `inception/stories/user-stories/US-012-refresh-booking-list-on-focus.md`
- ADR: `knowledge/decisions/ADR-008-focus-refresh-shared-module.md` (adds this PR)
- Fixes: none (net-new story)

## AC → evidence

| AC    | Implemented in | Proven by (test name) |
| ----- | --------------- | ----------------------- |
| AC-01 | `apps/ui/src/lib/data-refresh.ts`, `apps/ui/src/screens/my-bookings/MyBookings.tsx:129` | `MyBookings.spec.tsx: 're-fetches and re-renders when the window regains focus (US-012/AC-01) — the SCR-002 half of US-012/AC-06...'` |
| AC-02 | `apps/ui/src/screens/my-bookings/use-my-bookings.ts:142` (`refreshQuietly` merge-by-id) | `MyBookings.spec.tsx: 'a row cancelled elsewhere shows Cancelled with no Cancel control on the next regain (US-012/AC-02)'` |
| AC-03 | `use-my-bookings.ts:142` (never sets `status: 'loading'`) | `MyBookings.spec.tsx: 'shows no skeleton and keeps the list mounted while the refresh is in flight (US-012/AC-03)'` |
| AC-04 | `use-my-bookings.ts:33,171` (`quietRefreshFailed`), `MyBookings.tsx:169-181` (`Alert`) | `MyBookings.spec.tsx: 'a failed refresh keeps the prior list and shows a retryable, unobtrusive notice (US-012/AC-04)'` |
| AC-05 | `MyBookings.tsx:129` (`enabled: cancelDialog.dialog === undefined`) | `MyBookings.spec.tsx: 'does not refresh while the cancel dialog is open, and leaves it undisturbed (US-012/AC-05)'` |
| AC-06 | `MyBookings.tsx:129` — SCR-002 half only | Same test as AC-01 above; **SCR-005 half intentionally not delivered** — `AllBookings.tsx` is still a stub (US-013's scope), tracked in `decisions.md` D-01 |

## Command output (pasted, not summarized)

```
> npm run lint
> eslint .
(no output — clean)

> npm run typecheck
✓ libs/contracts, apps/api, apps/ui all pass tsc --noEmit

> npm test
apps/api:  Test Files  14 passed | 1 skipped (15)   Tests  263 passed | 2 skipped (265)
apps/ui:   Test Files  44 passed (44)                Tests  371 passed (371)
libs/contracts: Test Files  6 passed (6)             Tests  108 passed (108)

> node tools/aidlc-check.mjs
aidlc-check: OK (framework 0.5.0, 519 IDs, 36 warnings — all pre-existing, e.g. missing Jira keys)
```

## QA evidence

- Positive: focus regain re-fetches and reconciles (AC-01/AC-02); merge-by-id preserves an already-loaded older page and leaves `nextBefore` untouched (`use-my-bookings.spec.ts`).
- Negative/boundary: a failing quiet refresh leaves the list untouched and surfaces a retryable notice (AC-04); a second concurrent `refreshQuietly()` is a no-op (FR-09); a regain while `status !== 'ready'` is a no-op.
- Edge cases from the story: rapid focus changes coalesce to one call per regain, and a later regain still fires (`data-refresh.spec.ts`); a subscriber added after another unsubscribes does not resurrect a stale coalescing flag.
- No exploratory/browser-level testing beyond the above — this is UI behavior fully reachable through component tests (`@testing-library/react` + `jsdom`'s `visibilitychange`/`focus` events), so no separate browser test was warranted.

## Checklist

- [x] Self-reviewed against `ai/quality/review-checklist.md`
- [x] `knowledge/traceability/manifest.json` updated (`US-012.tests[]`, `US-012.decisions: ["ADR-008"]`); `node tools/aidlc-check.mjs` green locally
- [ ] Regression test citing the issue — n/a, this is a new story, not a bug fix
- [x] No unrelated changes; `apps/ui/src/lib/README.md` updated to point at the real file it previously described as future
