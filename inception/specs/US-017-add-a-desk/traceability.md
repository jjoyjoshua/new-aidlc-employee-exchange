# US-017 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                        |
| ----------- | -------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-017-add-a-desk.md`   |
| **Updated** | 2026-09-19                                              |

## Requirement to code

| Req    | File                                              | Symbol / location    | Proven by                                        | Status      |
| ------ | ---------------------------------------------------- | ----------------------- | ---------------------------------------------------- | ----------- |
| FR-01  | `apps/api/src/modules/admin/admin.router.ts`         | `POST /desks`           | `admin.routes.spec.ts`                               | implemented |
| FR-02  | `libs/contracts/src/desks.ts`                        | `deskCreateSchema`, `DESK_NUMBER_PATTERN` | `desks.spec.ts`, `DeskFormDialog.spec.tsx`           | implemented |
| FR-03  | `libs/contracts/src/desks.ts`                        | `normalizeDeskNumber`   | `desks.spec.ts`, `desks.repository.spec.ts`          | implemented |
| FR-04  | `apps/api/src/modules/desks/desks.repository.ts`, `libs/contracts/src/error.ts` | `insertDesk`, `'desk_number_taken'` | `desks.repository.spec.ts`, `admin.routes.spec.ts`, `DeskFormDialog.spec.tsx` | implemented |
| FR-05  | `supabase/migrations/0002_desks.sql` (existing), `libs/contracts/src/desks.ts` | `desks_desk_number_format` + `desks_desk_number_key` + `normalizeDeskNumber` | `desks.spec.ts`                                      | implemented |
| FR-06  | `apps/ui/src/screens/desks/use-add-desk-dialog.ts`   | the `inFlight` ref       | `use-add-desk-dialog.spec.ts`                        | implemented |
| FR-07  | `apps/ui/src/lib/add-desk.ts`                        | `AddDeskOutcome`        | `add-desk.spec.ts`, `DeskFormDialog.spec.tsx`        | implemented |
| FR-08  | inherited — `apps/api/src/http/middleware/require-admin.ts` (existing) | `requireAdmin` mount    | `admin.routes.spec.ts`                               | implemented |
| FR-09  | `apps/ui/src/components/dialog/dialog.css`           | the mobile-first sheet   | `Dialog.spec.tsx` (stylesheet assertion)             | implemented |
| FR-10  | `apps/ui/src/lib/use-desks.ts` (modified), `apps/ui/src/screens/desks/Desks.tsx` (modified) | `markAdded`             | `use-desks.spec.ts`, `Desks.spec.tsx`                | implemented |
| FR-11  | `apps/ui/src/components/dialog/Dialog.tsx` (new), `apps/ui/src/components/confirm-dialog/ConfirmDialog.tsx` (modified) | `Dialog`                | `Dialog.spec.tsx`, `ConfirmDialog.spec.tsx` (unedited, green) | implemented |
| NFR-01 | `supabase/migrations/0002_desks.sql` (existing, unmodified) | `desks_desk_number_format`, `desks_desk_number_key` | `desks.repository.spec.ts` (no pre-check `SELECT` recorded) | implemented |
| NFR-02 | `apps/ui/src/screens/desks/DeskFormDialog.tsx`       | (absence of a client-side list lookup) | code review — no `desks.some(...)` duplicate check   | implemented |

Every `FR-##` and `NFR-##` in `spec.md` has a row here. `aidlc-check` check 16 enforces it. A requirement with no code yet gets a row with status `not started` and `—` in File; a row is how you can see what is missing.

## Key symbols

| Symbol                    | Location                                                |
| ---------------------------- | ------------------------------------------------------------ |
| `normalizeDeskNumber`        | `libs/contracts/src/desks.ts`                               |
| `deskCreateSchema`           | `libs/contracts/src/desks.ts`                               |
| `insertDesk`                 | `apps/api/src/modules/desks/desks.repository.ts`             |
| `createDesk`                 | `apps/api/src/modules/desks/desks.service.ts`                |
| `markAdded`                  | `apps/ui/src/lib/use-desks.ts`                                |
| `Dialog`                     | `apps/ui/src/components/dialog/Dialog.tsx`                    |
| `useAddDeskDialog`           | `apps/ui/src/screens/desks/use-add-desk-dialog.ts`            |
| `DeskFormDialog`             | `apps/ui/src/screens/desks/DeskFormDialog.tsx`                |
