# US-011 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                                    |
| ----------- | -------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-011-cancel-my-own-booking.md`      |
| **Updated** | 2026-09-19                                                             |

## Requirement to code

| Req    | File                                                                                                          | Symbol / location                                    | Proven by                                                                 | Status      |
| ------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------- |
| FR-01  | `libs/contracts/src/error.ts:60`                                                                                   | `errorCodeSchema` — `booking_already_cancelled`          | `error.spec.ts`                                                                | implemented |
| FR-02  | `apps/api/src/modules/bookings/bookings.repository.ts:87,265`                                                     | `cancelOwnedBooking` (+`today` param)                    | `bookings.repository.spec.ts`                                                  | implemented |
| FR-03  | `apps/api/src/modules/bookings/bookings.repository.ts:102,296`                                                    | `findMyBookingState` (new)                               | `bookings.repository.spec.ts`                                                  | implemented |
| FR-04  | `apps/api/src/modules/bookings/bookings.service.ts:58,213`                                                        | `CancelBookingOutcome`, `cancelBooking`                  | `bookings.service.spec.ts`                                                     | implemented |
| FR-05  | `apps/api/src/modules/bookings/bookings.router.ts:165`                                                            | `POST /:id/cancel` handler                               | `bookings.routes.spec.ts`                                                      | implemented |
| FR-06  | `libs/contracts/src/error.ts`, `apps/api/src/http/errors.ts`, `bookings.router.ts`, `bookings.service.ts`, `bookings.repository.ts` | docblock corrections                    | reviewed, not test-provable                                                    | implemented |
| FR-07  | `apps/ui/src/components/confirm-dialog/ConfirmDialog.tsx:28,37,41`                                                | `ConfirmDialogProps.error`, `.singleAction`               | `ConfirmDialog.spec.tsx`                                                       | implemented |
| FR-08  | `apps/ui/src/components/confirm-dialog/ConfirmDialog.tsx:77`                                                      | Escape handler `!busy` guard, close-icon `disabled`      | `ConfirmDialog.spec.tsx`                                                       | implemented |
| FR-09  | `apps/ui/src/components/confirm-dialog/ConfirmDialog.tsx:86`                                                      | focus trap/restore, close icon                           | `ConfirmDialog.spec.tsx`                                                       | implemented |
| FR-10  | `apps/ui/src/components/dialog/dialog.css`                                                                        | overlay/card tokens, bottom-sheet breakpoint — moved here from `confirm-dialog.css` by US-017's shared-shell extraction (`Dialog.tsx`), same rules, `dialog__*` class prefix | `ConfirmDialog.spec.tsx` (structural), `Dialog.spec.tsx`, verified against Figma frames | implemented |
| FR-11  | `apps/ui/src/lib/cancel-booking.ts` (moved), `apps/ui/src/components/existing-booking-state/ExistingBookingState.tsx` | `CancelBookingOutcome`, `createCancelBooking`     | `cancel-booking.spec.ts`, `ExistingBookingState.spec.tsx`                      | implemented |
| FR-12  | `apps/ui/src/screens/my-bookings/BookingRow.tsx:29,32`                                                            | `BookingRowProps.onCancel`                               | `BookingRow.spec.tsx`                                                          | implemented |
| FR-13  | `apps/ui/src/screens/my-bookings/use-my-bookings.ts:110`                                                          | `markCancelled`                                          | `use-my-bookings.spec.ts`                                                      | implemented |
| FR-14  | `apps/ui/src/screens/my-bookings/MyBookings.tsx`, `apps/ui/src/screens/my-bookings/use-cancel-dialog.ts`          | cancel flow wiring (ST-07–ST-10)                          | `MyBookings.spec.tsx`, `use-cancel-dialog.spec.ts`                             | implemented |
| FR-15  | `apps/ui/src/screens/my-bookings/copy.ts`                                                                         | ST-07/ST-09/ST-10 copy                                    | `copy.spec.ts`                                                                 | implemented |
| FR-16  | `apps/ui/src/screens/my-bookings/MyBookings.tsx`                                                                  | negative assertion                                       | `MyBookings.spec.tsx`                                                          | implemented |
| NFR-01 | `apps/ui/src/screens/my-bookings/MyBookings.tsx`                                                                  | live-region count (unchanged from US-010)                | `MyBookings.spec.tsx`                                                          | implemented |
| NFR-02 | `apps/ui/src/screens/my-bookings/booking-row.css`                                                                 | Cancel control sizing                                    | visual/manual — no dedicated test                                             | implemented |
| NFR-03 | `apps/api/src/modules/bookings/bookings.repository.ts:296`                                                        | `findMyBookingState` select list                          | `bookings.repository.spec.ts`                                                  | implemented |

## Figma verification (SCR-002 ST-07–ST-10)

Confirmed directly against the live design file (not the written screen spec alone), per this
repo's practice on UI stories. File `xjFVgBbMrJUl7Ys3EX3Cbn` ("Employee Desk Booking — Design
System & Mockups"), frames named `HF / SCR-002 · My bookings / ST-## <state> · <width>`:

| State | Node ids (1280 / 768 / 360) |
| --- | --- |
| ST-07 Cancel confirmation | `103:6156` / `103:6205` / `103:6248` |
| ST-08 Cancelling          | `103:6294` / `103:6342` / `103:6385` |
| ST-09 Cancel failed       | `103:6430` / `103:6503` / `103:6570` |
| ST-10 Cancelled           | `104:1992` / `104:2107` / `104:2210` |

Dialog instance (default/busy/error variants): `103:6175`, `103:6313`, `103:6449`. Toast: `104:2102`.
Booking row with Cancel control: `103:6164`.

## Key symbols

| Symbol                    | Location                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `cancelOwnedBooking`         | `apps/api/src/modules/bookings/bookings.repository.ts`                              |
| `findMyBookingState`         | `apps/api/src/modules/bookings/bookings.repository.ts`                              |
| `cancelBooking`              | `apps/api/src/modules/bookings/bookings.service.ts`                                 |
| `ConfirmDialog`              | `apps/ui/src/components/confirm-dialog/ConfirmDialog.tsx`                           |
| `createCancelBooking`        | `apps/ui/src/lib/cancel-booking.ts`                                                 |
| `BookingRow`                 | `apps/ui/src/screens/my-bookings/BookingRow.tsx`                                     |
| `useMyBookings.markCancelled` | `apps/ui/src/screens/my-bookings/use-my-bookings.ts`                               |
| `useCancelDialog`            | `apps/ui/src/screens/my-bookings/use-cancel-dialog.ts`                              |
| `MyBookings`                 | `apps/ui/src/screens/my-bookings/MyBookings.tsx`                                     |

## Deviation from the plan

`use-cancel-dialog.ts` (+ its own spec) was not named in the design note's file-placement list —
it emerged during implementation as the cleanest way to hold the dialog's open/busy/outcome state
machine and its AC-07 double-submit guard, mirroring `book-a-desk/use-book-desk.ts`'s existing
pattern, rather than inlining that state into `MyBookings.tsx` directly. Additive only; no FR or
AC changed as a result. Recorded here per `change-log.md`'s own rule for a plan edited after
Gate D1 approval.
