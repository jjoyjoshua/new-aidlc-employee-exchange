# US-018 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan.

|             |                                                                    |
| ----------- | ------------------------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-018-correct-a-desk-number.md`   |
| **Tier**    | Complex                                                            |
| **Updated** | 2026-09-19                                                         |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                     |
| ------------------------ | -------- | -------------------------------------------------------------------------------------------------- |
| Contract                 | yes      | New write operation `PATCH /api/admin/desks/:id`; two new request schemas (`deskIdParamsSchema`, `deskUpdateSchema`) and one new response schema (`deskUpdateResponseSchema`) in `libs/contracts` (protected path); one additive prop (`describedBy`) on the shared `TextField` component |
| Persistence               | no       | No column, index, trigger or migration. `desk_number` and `updated_at` already exist (`0002_desks.sql`); the existing CHECK + unique index already enforce case-normalised uniqueness on `UPDATE` (design note §2.1) |
| Trust                     | no       | No guard code. `requireAdmin` already mounts once at `/api/admin` and covers every route added here |
| Dependency & integration | no       | No new package, no external service                                                              |
| Operational               | no       | No env value, no scheduled job, no middleware change                                             |

Tiered Complex on the Contract surface alone (`ai/standards/task-surfaces.md`: "a new route, or a new write operation… on an existing one" is Complex regardless of diff size).

## Files and callers

| File                                                  | Symbol                     | Change            | Callers found (`file:line`)                                                                 |
| ------------------------------------------------------ | --------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| `libs/contracts/src/desks.ts`                         | `deskIdParamsSchema`, `deskUpdateSchema`, `deskUpdateResponseSchema` | new         | `apps/api/src/modules/admin/admin.router.ts` (new route), `apps/ui/src/lib/rename-desk.ts` (new) |
| `apps/api/src/modules/desks/desks.repository.ts`       | `updateDeskNumber`          | new method on `DesksRepository` | `apps/api/src/modules/desks/desks.service.ts` (new call), `apps/api/src/composition.ts:108` (already wires the repository through) |
| `apps/api/src/modules/desks/desks.service.ts`          | `renameDesk`                | new method on the returned service object | `apps/api/src/modules/admin/admin.router.ts` (new route) |
| `apps/api/src/modules/admin/admin.router.ts`           | new `router.patch('/desks/:id', …)` | new route  | none yet — new surface                                                                        |
| `apps/ui/src/components/text-field/TextField.tsx`      | `TextFieldProps`            | additive prop (`describedBy?: string`) | Every existing caller (`SignIn.tsx`, `SetPassword.tsx`, `DeskFormDialog.tsx`, …) — additive, so none needs a change. Verified by every existing `TextField.spec.tsx` case staying green |
| `apps/ui/src/lib/use-desks.ts`                         | `useDesks` (`UseDesksResult`) | additive member (`markRenamed`) | `apps/ui/src/screens/desks/Desks.tsx`, `apps/ui/src/screens/all-bookings/AllBookings.tsx` (reads only `.status`/`.desks` — unaffected) |
| `apps/ui/src/screens/desks/use-add-desk-dialog.ts`     | `useAddDeskDialog`          | renamed + generalised to `use-desk-form-dialog.ts`/`useDeskFormDialog` | `apps/ui/src/screens/desks/Desks.tsx` (call site updated in the same PR) |
| `apps/ui/src/screens/desks/DeskFormDialog.tsx`         | `DeskFormDialogProps`       | additive props (`mode`, `desk`) | `apps/ui/src/screens/desks/Desks.tsx` |
| `apps/ui/src/screens/desks/DeskInventoryRow.tsx`       | `DeskInventoryRowProps` / `ActionButtons` | Edit button enabled, gains `onEdit` | `apps/ui/src/screens/desks/Desks.tsx` |
| `apps/ui/src/screens/desks/Desks.tsx`                  | `DesksContent`              | wires `openEdit`, the rename fetcher, the saved toast | none — top of the screen tree |
| `apps/ui/src/screens/desks/copy.ts`                    | new exports                 | additive strings  | `DeskFormDialog.tsx`, `Desks.tsx` |

## Regression risk

| Area                                                   | Risk   | Why                                                                                                   | Covered by                                                          |
| -------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| AC-07 self-collision                                    | high   | The classic uniqueness-on-edit bug: a pre-check `SELECT` finding the row itself and wrongly refusing a no-op save | `desks.repository.spec.ts` (asserts no pre-check `.select()` precedes the update), `desks.service.spec.ts`, a gated real-Postgres test (design note §2.3, §10 note 4) |
| AC-06 desk number on a booking                          | high   | Would silently pass every unit test if a future/parallel change denormalised the number onto a booking row; only a real join proves it stays live | `bookings.repository.spec.ts` / `admin-bookings.repository.spec.ts` (unchanged select strings, one already pinned byte-for-byte), a gated real-Postgres read-from-three-places test |
| `US-016`/`US-017` manifest citations                    | medium | Renaming `use-add-desk-dialog.spec.ts` → `use-desk-form-dialog.spec.ts` breaks US-017's existing `tests[]` entry in the manifest unless repathed in the same PR (design note §10 note 2) | `knowledge/traceability/manifest.json` — US-017's entry updated in this PR |
| `DeskInventoryRow.spec.tsx`'s existing disabled-controls test | medium | That test currently asserts both Edit and the toggle are disabled under one `US-016/AC-06, AC-08` citation; enabling Edit makes half of it false | The test is split, not deleted — the `US-016` citation stays on the surviving toggle half (design note §10 note 3) |
| `TextField`'s `aria-describedby` composition            | low    | `{...rest}` is spread last in the current implementation, so a naive `describedBy` addition could silently overwrite the error/helper association instead of composing with it | `TextField.spec.tsx` — a new case asserting a caller-supplied id does not displace the existing composition |
| Desk-list re-sort across a zone-letter rename           | low    | `A-01` → `B-05` must move the row, not merely update it in place — a shallow "replace by id" implementation would leave stale ordering | `use-desks.spec.ts` — a dedicated zone-crossing fixture |

## Deliberately not touched

- `supabase/migrations/**` — no migration. The existing `desks_desk_number_format` CHECK already makes the plain unique index sufficient for `UPDATE`, exactly as it is for `INSERT` (design note §2.1).
- `libs/contracts/src/error.ts` — both codes this endpoint needs (`desk_number_taken`, `desk_not_found`) already exist.
- `apps/api/src/http/middleware/**`, `apps/api/src/http/app.ts` — `requireAdmin` already mounts once at `/api/admin` and inherits automatically.
- `apps/api/src/composition.ts` — the repository→service→router wiring already exists; the new method rides it.
- `apps/ui/src/routes.tsx` — no new route; the form stays a dialog, as US-017 §4.3 already settled.
- `apps/api/src/modules/bookings/**`, `admin-bookings.repository.ts` — AC-06's whole point is that these are unchanged; a diff here is a review finding.
- `inception/design/tokens.css`, `eslint.config.mjs`, `apps/ui/src/lib/data-refresh.ts` — no new token, no new import boundary, no data-refresh subscription.
- `apps/ui/src/components/alert/Alert.tsx`, `dialog/Dialog.tsx`, `button/Button.tsx`, `toast/Toast.tsx` — composed as they are; only `TextField` gains a prop.
