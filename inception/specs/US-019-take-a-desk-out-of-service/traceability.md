# US-019 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                                         |
| ----------- | -------------------------------------------------------------------------|
| **Story**   | `inception/stories/user-stories/US-019-take-a-desk-out-of-service.md` |
| **Updated** | 2026-09-19                                                             |

## Requirement to code

| Req    | File | Symbol / location | Proven by | Status      |
| ------ | ---- | ------------------ | ---------- | ----------- |
| FR-01  | `apps/api/src/modules/admin/admin.router.ts`, `apps/api/src/modules/desks/desks.service.ts`, `desks.repository.ts` | `router.post('/desks/:id/deactivate', …)`, `deactivateDesk`, `setDeskActive` | `admin.routes.spec.ts`, `desks.service.spec.ts`, `desks.repository.spec.ts` | implemented |
| FR-02  | `apps/api/src/modules/admin/admin.router.ts`, `apps/api/src/modules/desks/desks.service.ts`, `desks.repository.ts` | `router.post('/desks/:id/activate', …)`, `activateDesk`, `setDeskActive` | `admin.routes.spec.ts`, `desks.service.spec.ts`, `desks.repository.spec.ts` | implemented |
| FR-03  | `apps/api/src/modules/bookings/bookings.service.ts:181`, `bookings.router.ts` (unmodified) | `if (!desk.is_active) return { kind: 'desk_inactive' }` | `bookings.routes.spec.ts` (new test only) | implemented |
| FR-04  | `apps/ui/src/screens/desks/DeskDeactivateDialog.tsx`, `Desks.tsx` | ST-05 rendering, `openDeactivate` | `DeskDeactivateDialog.spec.tsx`, `Desks.spec.tsx` | implemented |
| FR-05  | `apps/api/src/modules/desks/desks.service.ts` | `deactivateDesk` (the block) | `desks.service.spec.ts`, `admin.routes.spec.ts` | implemented |
| FR-06  | `apps/api/src/modules/desks/desks.service.ts`, `desks.repository.ts` | `deactivateDesk` (`displayStatusPredicate` call), `countUpcomingConfirmedForDesk` | `desks.service.spec.ts`, `desks.repository.spec.ts`, `admin.routes.spec.ts` | implemented |
| FR-07  | `libs/contracts/src/error.ts`, `desks.ts`, `apps/api/src/http/errors.ts` | `errorBodySchema.details`, `deskBlockedDetailsSchema`, `HttpError.toBody` | `error.spec.ts`, `desks.spec.ts`, `errors.spec.ts`, `admin.routes.spec.ts` | implemented |
| FR-08  | `apps/ui/src/screens/desks/DeskDeactivateDialog.tsx` | ST-06 footer (`CLOSE_LABEL` + `<Link>`, no cancel control) | `DeskDeactivateDialog.spec.tsx` | implemented |
| FR-09  | `apps/ui/src/screens/desks/DeskDeactivateDialog.tsx` | ST-06 primary `<Link>` (`toQueryString`) | `DeskDeactivateDialog.spec.tsx`, `Desks.spec.tsx` | implemented |
| FR-10  | `apps/api/src/modules/desks/desks.service.ts` | `deactivateDesk` (no caching between calls) | `desks.service.spec.ts`, `admin.routes.spec.ts` | implemented |
| FR-11  | `apps/ui/src/screens/desks/Desks.tsx` | `handleToggleActive` (activate branch — no dialog) | `Desks.spec.tsx` | implemented |
| FR-12  | `apps/ui/src/lib/use-desks.ts`, `Desks.tsx` | `markStateChanged` | `use-desks.spec.ts`, `Desks.spec.tsx` | implemented |
| FR-13  | `apps/ui/src/lib/deactivate-desk.ts`, `DeskDeactivateDialog.tsx`, `Desks.tsx` | `createDeactivateDesk` (`failed` outcome), ST-08 rendering | `deactivate-desk.spec.ts`, `DeskDeactivateDialog.spec.tsx`, `Desks.spec.tsx` | implemented |
| FR-14  | `apps/api/src/modules/admin/admin.router.ts` (inherited `requireAdmin`), `apps/ui/src/screens/desks/DeskInventoryRow.tsx` (toggle live behind `RequireRole`) | mount-level guard | `admin.routes.spec.ts` | implemented |
| NFR-01 | `apps/ui/src/components/dialog/Dialog.tsx`, `DeskDeactivateDialog.tsx` | `icon` prop, `role="alertdialog"`, `initialFocusRef` | `Dialog.spec.tsx`, `DeskDeactivateDialog.spec.tsx` | implemented |
| NFR-02 | `apps/api/src/modules/desks/desks.repository.ts` (`setDeskActive`, no migration), `admin.router.ts` (no per-route guard) | absence of a migration/per-route check diff | code review; `desks.repository.spec.ts` asserts no `updated_at` | implemented |

## Key symbols

| Symbol | Location |
| ------- | --------- |
| `countUpcomingConfirmedForDesk` | `apps/api/src/modules/desks/desks.repository.ts` |
| `setDeskActive` | `apps/api/src/modules/desks/desks.repository.ts` |
| `deactivateDesk` | `apps/api/src/modules/desks/desks.service.ts` |
| `activateDesk` | `apps/api/src/modules/desks/desks.service.ts` |
| `deskBlockedDetailsSchema` | `libs/contracts/src/desks.ts` |
| `deskStateResponseSchema` | `libs/contracts/src/desks.ts` |
| `errorBodySchema.details` | `libs/contracts/src/error.ts` |
| `HttpError.details`, `unprocessable(code, message, details)` | `apps/api/src/http/errors.ts` |
| `Dialog`'s `icon` prop | `apps/ui/src/components/dialog/Dialog.tsx` |
| `DeskDeactivateDialog` | `apps/ui/src/screens/desks/DeskDeactivateDialog.tsx` |
| `createDeactivateDesk` | `apps/ui/src/lib/deactivate-desk.ts` |
| `createActivateDesk` | `apps/ui/src/lib/activate-desk.ts` |
| `markStateChanged` | `apps/ui/src/lib/use-desks.ts` |
| `onToggleActive` | `apps/ui/src/screens/desks/DeskInventoryRow.tsx` |
| `handleToggleActive`, `confirmDeactivate` | `apps/ui/src/screens/desks/Desks.tsx` |
