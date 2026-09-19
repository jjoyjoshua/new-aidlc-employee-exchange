# US-019 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                                         |
| ----------- | -------------------------------------------------------------------------|
| **Story**   | `inception/stories/user-stories/US-019-take-a-desk-out-of-service.md` |
| **Tier**    | Complex                                                                |
| **Updated** | 2026-09-19                                                             |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                                                        |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract                 | yes      | Two new write endpoints (`POST /api/admin/desks/:id/deactivate`, `.../activate`); one new error code (`desk_has_upcoming_bookings`); an additive optional field (`details`) on the shared error body — the one shape every route in the system returns (ADR-009) |
| Persistence               | no       | `desks.is_active` already exists and already defaults `true` (`0002_desks.sql:19`). No column, index, trigger or migration                            |
| Trust                     | no       | Admin-only is inherited from the existing router mount (`requireAdmin`, `http/app.ts:78`); no new guard, no new role check                            |
| Dependency & integration  | no       | No package added, no external service                                                                                                                 |
| Operational               | no       | No job, no env value, no new middleware                                                                                                               |

One additional Contract-adjacent surface not on the framework's list but named by `ai/standards/task-surfaces.md`: `Dialog` (`apps/ui/src/components/dialog/`) is a **shared component**, and gains one additive prop (`icon?: ReactNode`).

## Files and callers

| File                                                          | Symbol                                    | Change                        | Callers found (`file:line`)                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `libs/contracts/src/error.ts`                                  | `errorBodySchema`                         | additive optional field       | `apps/api/src/http/errors.ts:*`, `apps/ui/src/lib/api-client.ts:86` (both must keep parsing old bodies unchanged)   |
| `libs/contracts/src/error.ts`                                  | `errorCodeSchema`                         | new enum member                | every `switch (code)` in the browser only reads the codes it knows; an unknown code already falls through today   |
| `apps/api/src/http/errors.ts`                                  | `HttpError`, `unprocessable`              | optional 4th constructor arg   | `admin.router.ts` (new callers only); every other call site (`badRequest`, `conflict`, `notFound`, etc.) unchanged |
| `libs/contracts/src/desks.ts`                                  | (new) `deskBlockedDetailsSchema`, `deskStateResponseSchema` | new exports | `apps/api/src/modules/admin/admin.router.ts`, `apps/ui/src/lib/deactivate-desk.ts`, `apps/ui/src/lib/activate-desk.ts` |
| `apps/api/src/modules/desks/desks.repository.ts`               | (new) `countUpcomingConfirmedForDesk`, `setDeskActive` | new methods       | `apps/api/src/modules/desks/desks.service.ts` only                                                                |
| `apps/api/src/modules/desks/desks.service.ts`                  | (new) `deactivateDesk`, `activateDesk`    | new methods                    | `apps/api/src/modules/admin/admin.router.ts` only                                                                 |
| `apps/api/src/modules/admin/admin.router.ts`                   | (new) two routes                          | additive                       | none (leaf routes)                                                                                                 |
| `apps/ui/src/components/dialog/Dialog.tsx`                     | `DialogProps`                             | additive optional prop         | every existing `Dialog` caller — `ConfirmDialog.tsx`, `DeskFormDialog.tsx`, and the new `DeskDeactivateDialog.tsx` |
| `apps/ui/src/lib/use-desks.ts`                                 | `UseDesksResult`                          | additive member (`markStateChanged`) | `Desks.tsx` (new caller); `AllBookings.tsx` reads only `.status`/`.desks` and is unaffected                |
| `apps/ui/src/screens/desks/DeskInventoryRow.tsx`               | props                                      | additive (`onToggleActive`)    | `Desks.tsx` only (the only renderer of this row)                                                                  |
| `apps/ui/src/screens/desks/copy.ts`                             | `UNAVAILABLE_CONTROL_REASON`              | **removed**                    | `DeskInventoryRow.tsx` (the only reader — removed in the same change)                                              |

## Regression risk

| Area                                             | Risk   | Why                                                                                                                          | Covered by                                                        |
| --------------------------------------------------| ------ | -------------------------------------------------------------------------------------------------------------------------------| --------------------------------------------------------------------|
| Every existing error response (`errorBodySchema`) | low    | New field is optional and emitted only when present; a strict-equality test on an old response body would need to allow an absent key, which it already does (no `.strict()`) | `error.spec.ts` step 2's byte-identical assertion                  |
| `ConfirmDialog` and `DeskFormDialog` rendering    | low    | `Dialog` gains an unused-by-default optional prop; existing callers pass nothing                                             | `ConfirmDialog.spec.tsx` and `DeskFormDialog.spec.tsx` staying green **unedited** |
| `AllBookings` screen                              | low    | `UseDesksResult` gains a member `AllBookings.tsx` never reads                                                                | existing `AllBookings.spec.tsx`, unedited                            |
| Booking creation on an inactive desk (AC-02)      | low    | No production code changes in `modules/bookings`; only a new test is added                                                   | the new route test in step 7                                      |
| `DeskInventoryRow`'s US-016 forcing test          | medium | The toggle's disabled state (US-016/AC-08) is exactly what this story removes; a naive edit could silently drop the citation and the coverage it protects | step 13's replacement test keeps a `US-016/AC-08` citation on the still-true half (control present and labelled at every width) |
| The AC-08 race window                             | low, accepted | No DB transactions in this codebase; a booking can land between the count-check and the write | documented in `apps/api/src/modules/desks/README.md`; self-revealing on the next list load (contradictory row), not silent |

## Deliberately not touched

- `apps/api/src/modules/bookings/**` — AC-02 (inactive desk refused) is already implemented; this story adds a test only.
- `apps/api/src/http/middleware/**`, `apps/api/src/http/app.ts` — AC-12 is enforced by the existing router mount; no per-route check is added.
- `apps/ui/src/routes.tsx` — AC-06 navigates to an existing address; no new route.
- `apps/ui/src/lib/data-refresh.ts` — this screen is not subscribed, matching US-016/017/018.
- `supabase/migrations/**` — `is_active` already exists; no schema change.
- `desks_desk_number_key` / `updateDeskNumber` — this story's writes never touch `desk_number`, so no `23505` handling is added to `setDeskActive`.
- `ConfirmDialog.tsx` — not reused for the deactivate flow; `DeskDeactivateDialog.tsx` composes `Dialog` directly instead (design-note.md §8.2).
