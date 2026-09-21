# US-033 — responsive and accessible across every screen

> The technical expansion of one approved story. Unlike most spec.md files in this repo, US-033 adds no behaviour of its own — it proves nine already-built behaviours against the ten approved screens, so every `FR-##` here restates an AC as a testable claim rather than inventing new scope.

|                   |                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------ |
| **Story**         | `inception/stories/user-stories/US-033-responsive-and-accessible-across-every-screen.md`   |
| **Traces to**     | NFR-002, NFR-004, NFR-008                                                                  |
| **Screen**        | SCR-001 through SCR-010 (all ten — this story verifies, does not build)                     |
| **Covering ADRs** | none                                                                                        |
| **Tier**          | Medium                                                                                      |
| **Status**        | approved                                                                                    |
| **Updated**       | 2026-09-21                                                                                  |

## Problem

The 32 stories before this one each built and unit-tested their own screen in isolation. Nobody has yet looked across all ten screens together for the inconsistencies a per-screen check cannot see: do the three responsive shells actually match at the three named widths, does every status/validation/selection signal actually carry more than colour, does the design's own contrast promise hold in both themes, and is every screen actually keyboard-operable per the model its own spec named. This story is that one sweep, recorded so a later change can be checked against what was verified (AC-09).

## Functional requirements

| ID    | Requirement                                                                                                          | Priority | Serves | Status      |
| ----- | ------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------- |
| FR-01 | All ten screens' highest-layout-risk states render usably at 360/768/1280px, with no horizontal page scroll          | Must     | AC-01  | implemented |
| FR-02 | The app shell renders as a bottom bar (<768), a 72px icon-only sidebar (768–1023), and a 240px labelled sidebar (≥1024) | Must     | AC-02  | partial — the <768 shell renders at the top, not fixed to the bottom (`decisions.md` D-05, issue #70); the two sidebar breakpoints are correct |
| FR-03 | At 768px specifically: SCR-005/006/008's admin tables are stacked cards, SCR-003 shows 5 date chips, SCR-004's column is 520px | Must     | AC-03  | implemented |
| FR-04 | No table or wide block causes the page body to scroll horizontally, at any of the three widths                       | Must     | AC-04  | implemented |
| FR-05 | Every status chip, validation state, availability marker and selection state carries an icon or word, not colour alone | Must     | AC-05  | implemented |
| FR-06 | Every text-on-surface design-token pair meets WCAG AA 4.5:1 in both the light and dark theme                         | Must     | AC-06  | implemented |
| FR-07 | Every screen is keyboard operable with visible focus, matching each screen's own named keyboard model                | Must     | AC-07  | partial — one linked gap (desk radio-group arrow keys, see `decisions.md` D-03 and `traceability.md`) |
| FR-08 | No screen offers an office, site or location selector                                                                 | Must     | AC-08  | implemented |
| FR-09 | The three-width, colour-alone, contrast and keyboard sweep is recorded as evidence in this story's own PR            | Must     | AC-09  | implemented |

## Non-functional requirements

| ID      | Requirement                                                                  | Serves     |
| ------- | ----------------------------------------------------------------------------- | ---------- |
| NFR-004 | Every screen usable at 360/768/1280px, three named responsive shells         | AC-01–04   |
| NFR-008 | No status/state signalled by colour alone; WCAG AA contrast; keyboard operable | AC-05–07   |
| NFR-002 | Single-office product — no location selector anywhere                        | AC-08      |

## Technical constraints

- jsdom performs no layout (`apps/ui/src/styles/index.css:14-18`); width/layout claims (FR-01–04, part of FR-07) are proven by treating the stylesheet as the honest proxy for the breakpoint (precedent: `Dialog.spec.tsx:146-150`), backed by a manual browser-pane sweep against the real Figma frames — not by introducing Playwright (`decisions.md` D-01)
- `tools/aidlc-check.mjs` is the single source for contrast math (FR-06); this story wraps it rather than re-deriving it (`decisions.md` D-04)
- A defect this story finds is never fixed inside it — it is filed as a `bug` issue against the screen's own story (story Edge Cases; `decisions.md` D-03)

## Out of scope

- Building or redesigning any screen, state, or component — that already happened in US-001–US-032
- Fixing the desk radio-group keyboard gap (FR-07) — filed as [issue #71](https://github.com/jjoyjoshua/new-aidlc-employee-exchange/issues/71) against US-007/SCR-003 instead
- Fixing the mobile nav's top-vs-bottom placement (FR-02) — filed as [issue #70](https://github.com/jjoyjoshua/new-aidlc-employee-exchange/issues/70) against the app shell instead
- 767px/1023px boundary testing — only the three named widths are this story's scope (story Edge Cases)
