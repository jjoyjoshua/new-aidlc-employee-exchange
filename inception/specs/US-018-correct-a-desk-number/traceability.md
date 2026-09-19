# US-018 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards.

|             |                                                                    |
| ----------- | -------------------------------------------------------------------|
| **Story**   | `inception/stories/user-stories/US-018-correct-a-desk-number.md`  |
| **Updated** | 2026-09-19                                                         |

## Requirement to code

| Req    | File                                                     | Symbol / location            | Proven by                                                        | Status      |
| ------ | ----------------------------------------------------------| ------------------------------ | -------------------------------------------------------------------| ----------- |
| FR-01  | `apps/api/src/modules/admin/admin.router.ts`             | `router.patch('/desks/:id', …)` | `admin.routes.spec.ts`                                            | implemented |
| FR-02  | `libs/contracts/src/desks.ts`                            | `deskUpdateSchema`             | `desks.spec.ts`                                                   | implemented |
| FR-03  | `apps/ui/src/screens/desks/DeskFormDialog.tsx`           | `handleSubmit` (client-side validation) | `DeskFormDialog.spec.tsx`                                | implemented |
| FR-04  | `apps/api/src/modules/desks/desks.repository.ts`         | `updateDeskNumber`             | `desks.repository.spec.ts`, `admin.routes.spec.ts`                | implemented |
| FR-05  | `apps/api/src/modules/desks/desks.repository.ts`         | `updateDeskNumber` (no pre-check) | `desks.repository.spec.ts`, `desks.service.spec.ts`, gated real-Postgres test | implemented |
| FR-06  | `apps/api/src/modules/desks/desks.service.ts`            | `renameDesk`                   | `desks.service.spec.ts`                                           | implemented |
| FR-07  | `apps/ui/src/screens/desks/DeskFormDialog.tsx`           | ST-02 note rendering            | `DeskFormDialog.spec.tsx`                                         | implemented |
| FR-08  | `apps/ui/src/screens/desks/DeskFormDialog.tsx`           | ST-02 note rendering (absence)  | `DeskFormDialog.spec.tsx`                                         | implemented |
| FR-09  | `apps/api/src/modules/desks/desks.service.ts`            | `renameDesk` (no notification dependency) | `desks.service.spec.ts`                                | implemented |
| FR-10  | `apps/api/src/modules/bookings/bookings.repository.ts`, `admin-bookings.repository.ts`, `desks.repository.ts` | unchanged live joins | `bookings.repository.spec.ts`, `admin-bookings.repository.spec.ts`, gated real-Postgres test | implemented |
| FR-11  | `apps/ui/src/lib/use-desks.ts`                           | `markRenamed`                   | `use-desks.spec.ts`                                               | implemented |
| FR-12  | `apps/ui/src/screens/desks/use-desk-form-dialog.ts`      | `submit` (`inFlight` guard)      | `use-desk-form-dialog.spec.ts`                                    | implemented |
| FR-13  | `apps/api/src/modules/admin/admin.router.ts`             | inherited `requireAdmin`         | `admin.routes.spec.ts`                                            | implemented |
| NFR-01 | `apps/ui/src/components/text-field/TextField.tsx`        | `describedBy`                   | `TextField.spec.tsx`, `DeskFormDialog.spec.tsx`                    | implemented |
| NFR-02 | `apps/api/src/modules/desks/desks.repository.ts`, `apps/api/src/modules/admin/admin.router.ts` | `updateDeskNumber`, `PATCH /desks/:id` (no migration, no new error code, no new shared component beyond `TextField`'s `describedBy`) | code review — absence of a migration/error-code/component diff, per `impact-analysis.md` | implemented |

## Key symbols

| Symbol                  | Location                                              |
| -------------------------| --------------------------------------------------------|
| `updateDeskNumber`      | `apps/api/src/modules/desks/desks.repository.ts`      |
| `renameDesk`            | `apps/api/src/modules/desks/desks.service.ts`         |
| `deskUpdateSchema`      | `libs/contracts/src/desks.ts`                         |
| `deskUpdateResponseSchema` | `libs/contracts/src/desks.ts`                      |
| `createRenameDesk`      | `apps/ui/src/lib/rename-desk.ts`                      |
| `useDeskFormDialog`     | `apps/ui/src/screens/desks/use-desk-form-dialog.ts`   |
| `markRenamed`           | `apps/ui/src/lib/use-desks.ts`                        |
