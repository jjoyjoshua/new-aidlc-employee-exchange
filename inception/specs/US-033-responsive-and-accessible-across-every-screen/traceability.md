# US-033 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##`'s proof **is**, and is what a human reads. US-033 verifies rather than builds, so every row points at code and tests written for earlier stories, plus the citations added here.

|             |                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-033-responsive-and-accessible-across-every-screen.md` |
| **Updated** | 2026-09-21                                                                                |

## Requirement to code

| ID    | File                                                                                                                  | Symbol / location                | Proven by                                                                 | Status      |
| ----- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------- | ----------- |
| FR-01 | all 10 `apps/ui/src/screens/*`                                                                                       | full-screen render at 3 widths    | manual sweep, `verification-log.md` + evidence screenshots                 | implemented |
| FR-02 | `apps/ui/src/components/app-shell/app-shell.css:9,116,196`                                                            | shell breakpoints                 | `AppShell.spec.tsx` ("the three responsive shells")                        | partial — <768 renders top, not bottom (`decisions.md` D-05, [issue #70](https://github.com/jjoyjoshua/new-aidlc-employee-exchange/issues/70)) |
| FR-03 | `all-bookings.css:137,152`, `desks.css:110,130`, `people.css:217,234`, `date-strip.css:161-182`, `settings.css:3,29-33` | 768px-specific rules              | `AllBookings.spec.tsx`, `Desks.spec.tsx`, `People.spec.tsx`, `DateStrip.spec.tsx`, `Settings.spec.tsx` | implemented |
| FR-04 | (no `overflow-x` anywhere in `apps/ui/src` — reflow avoids the need)                                                  | —                                  | manual sweep, `verification-log.md`                                        | implemented |
| FR-05 | `StatusChip.tsx:138-176`, `TextField.tsx:9,91-94`, `Toggle.tsx`                                                       | icon+word alongside colour        | `StatusChip.spec.tsx`, `TextField.spec.tsx`, `Toggle.spec.tsx:14-18`        | implemented |
| FR-06 | `inception/design/tokens.css`                                                                                        | text-on-surface pairs             | `tools/aidlc-check.mjs:474-534`, wrapped by `contrast-gate.spec.ts`         | implemented |
| FR-07 | `DateStrip.tsx`, `Dialog.tsx`, `ConfirmDialog.tsx`, `AccountRowMenu.tsx` — **not** `DeskRow.tsx`/`ZoneGroup.tsx` (linked gap) | keyboard model per screen        | `DateStrip.spec.tsx`, `Dialog.spec.tsx`, `ConfirmDialog.spec.tsx`, `AccountRowMenu.spec.tsx` | partial — desk radio-group gap filed as a bug issue (`decisions.md` D-03) |
| FR-08 | (absence confirmed repo-wide)                                                                                         | —                                  | `location-selector-absence.spec.ts`                                        | implemented |
| FR-09 | `verification-log.md`, this PR                                                                                        | —                                  | `contrast-gate.spec.ts` (asserts the log exists and lists all 10 screens)   | implemented |
| NFR-004 | see FR-01–04 above (usable at 360/768/1280px, three responsive shells, no horizontal page scroll)                    | —                                  | see FR-01–04                                                                | implemented |
| NFR-008 | see FR-05–07 above (no colour-alone signalling, WCAG AA contrast, keyboard operable)                                  | —                                  | see FR-05–07                                                                | implemented (FR-07 partial) |
| NFR-002 | see FR-08 above (no location selector)                                                                                | —                                  | see FR-08                                                                   | implemented |

## Key symbols

| Symbol                             | Location                                          |
| ------------------------------------ | -------------------------------------------------- |
| App shell breakpoints                | `apps/ui/src/components/app-shell/app-shell.css`    |
| Admin table/card boundary (1024px)   | `all-bookings.css`, `desks.css`, `people.css`       |
| Date strip breakpoints               | `apps/ui/src/components/date-strip/date-strip.css`  |
| Contrast check                       | `tools/aidlc-check.mjs`                             |
