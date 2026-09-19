# US-017 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                        |
| ----------- | -------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-017-add-a-desk.md`   |
| **Tier**    | Complex                                                |
| **Updated** | 2026-09-19                                             |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                   |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| Contract                 | yes      | New write operation `POST /api/admin/desks`; new required request field `deskNumber`; new response `201`; new error code `desk_number_taken`; a new shared `Dialog` component's props; an additive `helper` prop on `TextField` |
| Persistence              | no       | `desks_desk_number_format` (CHECK) and `desks_desk_number_key` (unique index) already exist and already enforce AC-02/AC-04/AC-05 (design note §2.1, independently verified against `supabase/migrations/0002_desks.sql`) |
| Trust                    | no (inherited) | `requireAdmin` already mounts at `/api/admin` (`http/app.ts:78`); the new route inherits it. No guard code is written. AC-08 still needs a test reaching the real mount |
| Dependency & integration | no       | No new package, no external service                                                                              |
| Operational              | no       | No scheduled job, no new env value, no middleware change                                                         |

## Files and callers

| File                                          | Symbol                    | Change              | Callers found (`file:line`)                                                              |
| ---------------------------------------------- | -------------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| `libs/contracts/src/desks.ts`                 | (new exports)              | additive             | `admin.router.ts`, `apps/ui/src/lib/add-desk.ts`, `apps/ui/src/screens/desks/DeskFormDialog.tsx` |
| `libs/contracts/src/error.ts`                 | `errorCodeSchema`          | additive enum value  | every route's `HttpError` construction; the UI's `AddDeskOutcome` switch                     |
| `apps/api/src/modules/desks/desks.repository.ts` | `DesksRepository`        | additive method      | `apps/api/src/modules/desks/desks.service.ts`, and the four `DesksRepository` stub literals in `apps/api/src/modules/admin/admin.routes.spec.ts` (`:461`, `:475-482`, `:496-505`, `:519`) — each must gain a no-op `insertDesk` to keep typechecking |
| `apps/api/src/modules/desks/desks.service.ts` | `DesksService`             | additive method      | `apps/api/src/modules/admin/admin.router.ts`                                                 |
| `apps/api/src/modules/admin/admin.router.ts`  | `createAdminRouter`        | additive route       | `apps/api/src/composition.ts:117` (no signature change — same deps object)                   |
| `apps/ui/src/components/confirm-dialog/ConfirmDialog.tsx` | `ConfirmDialog`| internal refactor, same props | `apps/ui/src/screens/all-bookings/AllBookings.tsx` (US-015's cancel dialog), `apps/ui/src/screens/my-bookings/MyBookings.tsx` (US-011's cancel dialog) — **both must keep passing unchanged**; proven by `ConfirmDialog.spec.tsx` staying green and unedited |
| `apps/ui/src/components/text-field/TextField.tsx` | `TextFieldProps`      | additive prop        | Every existing `TextField` caller (`SignIn.tsx`, `SetPassword.tsx`, and others) — additive, so none require changes |
| `apps/ui/src/lib/use-desks.ts`                | `useDesks`                 | additive return member (`markAdded`) | `apps/ui/src/screens/all-bookings/AllBookings.tsx` (reads only `.status`/`.desks`, unaffected), `apps/ui/src/screens/desks/Desks.tsx` (the new consumer) |

## Regression risk

| Area                                          | Risk   | Why                                                                                                          | Covered by                                    |
| ------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `ConfirmDialog` (US-007/AC-07, US-011, US-015's cancel flows) | medium | Refactored to compose the new `Dialog` shell; a mistake here breaks three merged stories' cancel dialogs at once | `ConfirmDialog.spec.tsx` run unedited — must stay green |
| `admin.routes.spec.ts`'s four `DesksRepository` stub literals | low (mechanical) | A new interface method makes existing partial-object stubs fail to typecheck until each gains a no-op `insertDesk` | `npm run typecheck -w @desk-booking/api`        |
| `AllBookings.tsx`'s desk dropdown (US-014)      | low    | `useDesks`'s return shape widens additively; a mis-typed change could still break the existing `.status`/`.desks` reads | `npm test -w @desk-booking/ui -- AllBookings`   |
| Desk-number normalisation applied only client-side | high if missed | The AC-02 format CHECK constraint means a lower-case value reaching the DB without server-side normalisation is a raw 500, not AC-02's clean refusal (design note §2.4) | `admin.routes.spec.ts`'s raw lower-case POST test |
| `Desks.spec.tsx`'s existing US-016 forcing tests | medium | Two separate assertions reference the disabled Add-desk button (`:143-150` header, `:84-92` empty state) — missing the second is the likelier slip | Both edited in Step 10; design note §10 note 4 |

## Deliberately not touched

- **`supabase/migrations/**`.** No migration — the existing CHECK + unique index already provide AC-02/AC-04/AC-05's guarantees (design note §2.1).
- **`inception/design/tokens.css`.** Every colour role the SCR-007 frames use is already consumed by `Alert`, `Toast`, `TextField`, `Button`, or `confirm-dialog.css`.
- **`apps/api/src/http/middleware/**` and `http/app.ts`.** The admin guard predates this route and is inherited, not re-implemented.
- **`apps/ui/src/routes.tsx`.** No new route — SCR-007's `Surface` field is stale (design note §4.1); every approved hi-fi frame draws a same-screen dialog, not a page.
- **`apps/ui/src/screens/desks/DeskInventoryRow.tsx` and `DeskInventoryRow.spec.tsx`.** Their forcing tests are Edit's and Deactivate's (US-018, US-019) — this story touches neither file.
- **`apps/api/src/composition.ts`.** The desks service and admin router wiring already exists; the new methods ride it with no signature change.
- **`Alert.tsx`, `Toast.tsx`, `Button.tsx`, `EmptyState.tsx`.** Composed as-is; no new props needed.
- **`apps/api/src/domain/*.ts`.** The desk-number rule has no clock dependency, so it lives wholly in `libs/contracts` (see `decisions.md` D-03) — no new file here.
