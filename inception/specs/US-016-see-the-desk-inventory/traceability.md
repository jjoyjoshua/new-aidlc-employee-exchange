# US-016 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                  |
| ----------- | ------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-016-see-the-desk-inventory.md` |
| **Updated** | 2026-09-19                                       |

## Requirement to code

| Req    | File            | Symbol / location | Proven by           | Status      |
| ------ | --------------- | ------------------ | -------------------- | ----------- |
| FR-01  | `apps/api/src/modules/desks/desks.repository.ts` | `listAllDesks` | `desks.repository.spec.ts` | implemented |
| FR-02  | `apps/ui/src/screens/desks/DeskInventoryRow.tsx` | (chip render) | `DeskInventoryRow.spec.tsx` | implemented |
| FR-03  | `apps/ui/src/components/status-chip/StatusChip.tsx` | `kind: 'inventory'` | `StatusChip.spec.tsx` | implemented |
| FR-04  | `apps/api/src/modules/desks/desks.repository.ts`, `desks.service.ts` | `listUpcomingConfirmedDeskIds`, `listAllDesks` | `desks.repository.spec.ts`, `desks.service.spec.ts` | implemented |
| FR-05  | `libs/contracts/src/desks.ts`, `apps/ui/src/screens/desks/copy.ts` | `adminDeskSchema.bookedAhead`, `bookedAheadLabel` | `desks.spec.ts` (contracts), `copy.spec.ts`, `DeskInventoryRow.spec.tsx` | implemented |
| FR-06  | `apps/ui/src/screens/desks/Desks.tsx` | (empty-state branch) | `Desks.spec.tsx` | implemented |
| FR-07  | `apps/ui/src/screens/desks/Desks.tsx`, `DeskInventorySkeletonRow.tsx` | (loading/error branches) | `Desks.spec.tsx` | implemented |
| FR-08  | `apps/ui/src/screens/desks/DeskInventoryRow.tsx`, `desks.css` | (row actions, CSS breakpoints) | `DeskInventoryRow.spec.tsx`, `Desks.spec.tsx` | implemented |
| FR-09  | `apps/ui/src/screens/desks/Desks.tsx` | (structural absence) | `Desks.spec.tsx` | implemented |
| FR-10  | `apps/ui/src/routes.tsx`, `apps/api/src/modules/admin/admin.router.ts` (inherited guard) | `/admin/desks` route | `Desks.spec.tsx`, `admin.routes.spec.ts` | implemented |
| FR-11  | `apps/ui/src/screens/desks/Desks.tsx`, `DeskInventoryRow.tsx`, `copy.ts` | (disabled controls + reason) | `Desks.spec.tsx`, `DeskInventoryRow.spec.tsx` | implemented |
| NFR-01 | `apps/api/src/modules/desks/desks.service.ts` | `officeToday(nowMs(), officeTimezone)` (single reading) | `desks.service.spec.ts` | implemented |
| NFR-02 | `apps/ui/src/components/status-chip/StatusChip.tsx` | `kind: 'inventory'` (icon + word) | `StatusChip.spec.tsx` | implemented |

Every `FR-##` and `NFR-##` in `spec.md` has a row here. `aidlc-check` check 16 enforces it. A requirement with no code yet gets a row with status `not started` and `—` in File; a row is how you can see what is missing.

## Key symbols

| Symbol                            | Location            |
| ---------------------------------- | -------------------- |
| `adminDeskSchema` / `AdminDesk`    | `libs/contracts/src/desks.ts` |
| `listUpcomingConfirmedDeskIds`     | `apps/api/src/modules/desks/desks.repository.ts` |
| `createDesksService`               | `apps/api/src/modules/desks/desks.service.ts` |
| `INVENTORY_LABEL`                  | `apps/ui/src/components/status-chip/StatusChip.tsx` |
| `bookedAheadLabel`, `summaryLine`  | `apps/ui/src/screens/desks/copy.ts` |
| `Desks`                            | `apps/ui/src/screens/desks/Desks.tsx` |
| `DeskInventoryRow`                 | `apps/ui/src/screens/desks/DeskInventoryRow.tsx` |
