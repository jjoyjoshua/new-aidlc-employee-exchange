# US-012 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                                          |
| ----------- | -------------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-012-refresh-booking-list-on-focus.md`   |
| **Updated** | 2026-09-19                                                                  |

## Requirement to code

| Req   | File | Symbol / location | Proven by | Status |
| ----- | ---- | ------------------ | --------- | ------ |
| FR-01 | `apps/ui/src/lib/data-refresh.ts:64,79` | `onRegainFocus`, `useFocusRefresh` | `apps/ui/src/lib/data-refresh.spec.ts` | implemented |
| FR-02 | `apps/ui/src/lib/data-refresh.ts:24` | `coalescing` flag inside the shared listener | `apps/ui/src/lib/data-refresh.spec.ts` | implemented |
| FR-03 | `apps/ui/src/lib/data-refresh.ts:24-32` | same coalescing mechanism, reset per regain | `apps/ui/src/lib/data-refresh.spec.ts` | implemented |
| FR-04 | `apps/ui/src/screens/my-bookings/use-my-bookings.ts:142` | `refreshQuietly` | `apps/ui/src/screens/my-bookings/use-my-bookings.spec.ts` | implemented |
| FR-05 | `apps/ui/src/screens/my-bookings/use-my-bookings.ts:142-165` | `refreshQuietly` (merge by id, `nextBefore` untouched) | `apps/ui/src/screens/my-bookings/use-my-bookings.spec.ts` | implemented |
| FR-06 | `apps/ui/src/screens/my-bookings/use-my-bookings.ts:33` | `quietRefreshFailed` | `apps/ui/src/screens/my-bookings/use-my-bookings.spec.ts` | implemented |
| FR-07 | `apps/ui/src/screens/my-bookings/MyBookings.tsx:169-181`, `apps/ui/src/screens/my-bookings/copy.ts:32` | failure `Alert` + `QUIET_REFRESH_FAILED` | `apps/ui/src/screens/my-bookings/MyBookings.spec.tsx`, `apps/ui/src/screens/my-bookings/copy.spec.ts` | implemented |
| FR-08 | `apps/ui/src/screens/my-bookings/MyBookings.tsx:129` | `useFocusRefresh(..., { enabled: cancelDialog.dialog === undefined })` | `apps/ui/src/screens/my-bookings/MyBookings.spec.tsx` | implemented |
| FR-09 | `apps/ui/src/screens/my-bookings/use-my-bookings.ts:143` | `quietRefreshInFlight` ref guard | `apps/ui/src/screens/my-bookings/use-my-bookings.spec.ts` | implemented |

Every `FR-##` in `spec.md` has a row here.

**AC-06 (SCR-005 half):** intentionally has no row — out of scope per `decisions.md` D-01, not forgotten.

## Key symbols

| Symbol              | Location                                                     |
| -------------------- | -------------------------------------------------------------- |
| `useFocusRefresh`     | `apps/ui/src/lib/data-refresh.ts:79`                            |
| `onRegainFocus`       | `apps/ui/src/lib/data-refresh.ts:64`                            |
| `refreshQuietly`      | `apps/ui/src/screens/my-bookings/use-my-bookings.ts:142`        |
| `quietRefreshFailed`  | `apps/ui/src/screens/my-bookings/use-my-bookings.ts:33`         |
