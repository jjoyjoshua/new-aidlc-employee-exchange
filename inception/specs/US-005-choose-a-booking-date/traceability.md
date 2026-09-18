# US-005 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                                   |
| ----------- | -------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-005-choose-a-booking-date.md`  |
| **Updated** | 2026-09-18                                                             |

## Requirement to code

| Req    | File                                                     | Symbol / location                    | Proven by                                                 | Status      |
| ------ | ---------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------- | ----------- |
| FR-01  | `apps/api/src/domain/booking-window.ts`                  | `officeToday`                        | `apps/api/src/domain/booking-window.spec.ts`                  | implemented |
| FR-01  | `libs/contracts/src/auth.ts`                              | `officeSchema`, `officeDateSchema`   | `libs/contracts/src/auth.spec.ts`                              | implemented |
| FR-01  | `apps/api/src/modules/auth/auth.router.ts`                | `/sign-in`, `/session` handlers      | `apps/api/src/modules/auth/auth.routes.spec.ts`                | implemented |
| FR-02  | `apps/ui/src/screens/book-a-desk/BookADesk.tsx`           | preselection on mount                | `apps/ui/src/screens/book-a-desk/BookADesk.spec.tsx`           | implemented |
| FR-03  | `libs/contracts/src/booking-window.ts`                    | `refusalFor`, `lastBookableDate`     | `libs/contracts/src/booking-window.spec.ts`                    | implemented |
| FR-04  | `apps/ui/src/components/date-strip/DateStrip.tsx`         | weekend chip rendering               | `apps/ui/src/components/date-strip/DateStrip.spec.tsx`         | implemented |
| FR-05  | `libs/contracts/src/booking-window.ts`                    | `refusalFor` (precedence, D-05)      | `libs/contracts/src/booking-window.spec.ts`                    | implemented |
| FR-06  | `apps/ui/src/components/date-picker/DatePicker.tsx`       | month-navigation clamp               | `apps/ui/src/components/date-picker/DatePicker.spec.tsx`       | implemented |
| FR-07  | `apps/ui/src/components/date-picker/DatePicker.tsx`       | strikethrough cell, footer text      | `apps/ui/src/components/date-picker/DatePicker.spec.tsx`       | implemented |
| FR-08  | `apps/ui/src/lib/format-office-date.ts`                  | `formatOfficeDateLabel`              | `apps/ui/src/lib/format-office-date.spec.ts`                   | implemented |
| FR-09  | `apps/ui/src/screens/book-a-desk/BookADesk.tsx`           | page-header timezone text (D-06)     | `apps/ui/src/screens/book-a-desk/BookADesk.spec.tsx`           | implemented |
| FR-10  | `apps/ui/src/screens/book-a-desk/use-availability.ts`     | latest-wins request handling         | `apps/ui/src/screens/book-a-desk/use-availability.spec.ts`     | implemented |
| NFR-01 | `apps/api/src/domain/booking-window.ts`                  | `officeToday`                        | `apps/api/src/domain/booking-window.spec.ts` (AC-07 zone case) | implemented |
| NFR-02 | `apps/ui/src/components/date-strip/DateStrip.tsx`, `apps/ui/src/components/date-picker/DatePicker.tsx` | text + icon per state, no colour-only cue | component specs above                                           | implemented |

Every `FR-##` and `NFR-##` in `spec.md` has a row here. `aidlc-check` check 16 enforces it. A requirement with no code yet gets a row with status `not started` and `—` in File; a row is how you can see what is missing.

## Key symbols

| Symbol                | Location                                    |
| ------------------------ | ---------------------------------------------- |
| `officeToday`          | `apps/api/src/domain/booking-window.ts`       |
| `refusalFor`           | `libs/contracts/src/booking-window.ts`        |
| `nextBookableDate`     | `libs/contracts/src/booking-window.ts`        |
| `lastBookableDate`     | `libs/contracts/src/booking-window.ts`        |
| `BOOKING_WINDOW_DAYS`  | `libs/contracts/src/booking-window.ts`        |
| `officeSchema`         | `libs/contracts/src/auth.ts`                  |
| `formatOfficeDateLabel`| `apps/ui/src/lib/format-office-date.ts`       |
| `fetchAvailability`    | `apps/ui/src/screens/book-a-desk/use-availability.ts` — the seam US-006 fills in |
