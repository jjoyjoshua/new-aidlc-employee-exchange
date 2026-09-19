# US-012 — impact analysis

|             |                                                                          |
| ----------- | -------------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-012-refresh-booking-list-on-focus.md`  |
| **Tier**    | Complex                                                                    |
| **Updated** | 2026-09-19                                                                 |

## Surfaces crossed

| Surface                  | Crossed? | What exactly |
| ------------------------ | -------- | ------------- |
| Contract                 | no       | No endpoint, route, or shared-component prop changes. `useMyBookings`'s return type gains `refreshQuietly`/`quietRefreshFailed`, but it has one caller (`MyBookings.tsx`) — not a shared component |
| Persistence               | no       | No entity, column, or migration |
| Trust                    | no       | No auth, session, or credential path touched |
| Dependency & integration  | no       | No new package (ADR-008) |
| Operational               | no       | No job, env value, or middleware |
| **Project extension**    | **yes**  | `ai/standards/task-surfaces.md:61-64`: *"the configuration of the data-fetching layer (its cache-invalidation or refresh-on-focus behaviour is REQ-036, set once for the whole app)"* is Complex regardless of the five framework surfaces above. This is the sole reason for the tier, and it is why ADR-008 exists as this story's design note |

## Files and callers

| File | Symbol | Change | Callers found (`file:line`) |
| ---- | ------ | ------ | ---------------------------- |
| `apps/ui/src/lib/data-refresh.ts` | `useFocusRefresh`, `onRegainFocus` | new file | `apps/ui/src/screens/my-bookings/MyBookings.tsx` (new import, this story) |
| `apps/ui/src/screens/my-bookings/use-my-bookings.ts` | `useMyBookings` return shape | add `refreshQuietly()`, add `quietRefreshFailed` to the `ready` state variant | `apps/ui/src/screens/my-bookings/MyBookings.tsx:112` (sole caller) |
| `apps/ui/src/screens/my-bookings/MyBookings.tsx` | `MyBookingsContent` | wire `useFocusRefresh`, suppress while `cancelDialog.dialog` is open, render the failure `Alert` | `apps/ui/src/routes.tsx:51` (route registration; `MyBookings`'s own props are unchanged, so this caller is unaffected) |
| `apps/ui/src/screens/my-bookings/copy.ts` | new constant | add the quiet-refresh failure message | `MyBookings.tsx` only |
| `apps/ui/src/lib/README.md` | prose | replace "when it lands" with the real file reference | none (documentation) |

## Regression risk

| Area | Risk | Why | Covered by |
| ---- | ---- | --- | ---------- |
| `useMyBookings`'s existing `retry()`/`loadOlder()`/`markCancelled()` | low | `refreshQuietly()` is additive — a new branch in the reducer-like `setState` updaters, no existing code path is edited | Existing `use-my-bookings.spec.ts` suite must stay green unmodified, plus new cases for `refreshQuietly()` |
| The cancel dialog (US-011) | medium | If `enabled: false` is wired to the wrong condition, a focus regain could fire mid-confirmation and violate AC-05 | `MyBookings.spec.tsx` case: regain focus while `cancelDialog.dialog` is truthy asserts no re-fetch and the dialog's item unchanged |
| Pagination (`loadOlder`, US-010) | medium | A merge-by-id refresh that touched `nextBefore` or accumulated pages would silently corrupt "Show More" | `use-my-bookings.spec.ts` case: `loadOlder()` then `refreshQuietly()` asserts `nextBefore` and the older page are untouched |
| `book-a-desk` (`use-availability.ts`) | none | Not touched; ADR-008 explicitly scopes this story to `my-bookings` only | n/a |
| `AllBookings.tsx` (SCR-005) | none | Not touched; still a stub, per `decisions.md` D-01 | n/a |

## Deliberately not touched

- `apps/ui/src/screens/book-a-desk/**` — no story gives it a focus-refresh requirement.
- `apps/ui/src/screens/all-bookings/AllBookings.tsx` — stays a stub; US-013's scope.
- Cache invalidation on mutation (US-007's book, US-011's cancel do not call an `invalidate()` — it does not exist yet, by ADR-008's own deferral).
