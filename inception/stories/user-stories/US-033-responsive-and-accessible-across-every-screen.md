# US-033 — Every screen holds up at three widths and never signals by colour alone

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-033-responsive-and-accessible-across-every-screen`) merging with every AC proven by a test named `... (US-033/AC-##)`.

|                |                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------- |
| **Epic**       | EPIC-005                                                                                 |
| **Traces to**  | NFR-004, NFR-008, NFR-002                                                                |
| **Priority**   | Must                                                                                     |
| **Estimate**   | 8 pts (AI draft — humans re-estimate)                                                    |
| **Depends on** | US-001 – US-032 (every story that builds a screen)                                       |

## Story

As an employee or administrator on whatever device I have
I want every screen to work at my window size and to be readable however I see colour
So that the product is usable rather than only technically complete.

## Acceptance criteria

### AC-01 Every screen is verified at 360px, 768px and 1280px

- **Given** all ten approved screens
- **When** each is rendered at 360px, 768px and 1280px viewport width
- **Then** each is usable at each width, with no horizontal page scrolling at any of the three (NFR-004)

### AC-02 The three responsive shells each behave as designed

- **Given** the three widths
- **When** the application shell is rendered
- **Then** 360px shows the bottom-bar shell, 768px the collapsed icon-only sidebar, and 1280px the persistent sidebar (NFR-004's verification widths, taken from the information architecture)

### AC-03 The middle shell's specific commitments hold

- **Given** 768px — the width added on 2026-09-08 precisely because it carries behaviour no other width tests
- **When** the screens are rendered
- **Then** the admin tables on SCR-005, SCR-006 and SCR-008 are stacked cards, SCR-003 shows a five-day date strip, and SCR-004's content column is 520px (NFR-004's note, open question #11)

### AC-04 Wide content scrolls inside itself, never the page

- **Given** any table or wide block
- **When** it exceeds the available width
- **Then** it scrolls within its own container and the page body does not scroll horizontally (NFR-004)

### AC-05 No status, state or outcome is signalled by colour alone

- **Given** every status chip, validation state, availability marker and selection state across all ten screens
- **When** each is rendered
- **Then** each carries an icon or a word as well as its colour (NFR-008)

### AC-06 Text-on-surface token pairs meet WCAG AA in both themes

- **Given** the design tokens
- **When** each text-on-surface pair is measured in the light and the dark theme
- **Then** each meets 4.5:1 (NFR-008), which `aidlc-check` already reports on

### AC-07 Every screen is keyboard operable with visible focus

- **Given** each screen's specified keyboard model
- **When** it is operated by keyboard alone
- **Then** every interactive control is reachable, focus is visibly ringed, and the per-screen commitments hold — including the SCR-003 date strip as one tab stop with arrow keys, the desk list as a radio group, and focus returning to a row's overflow trigger after a dialog closes on SCR-008

### AC-08 No screen offers a location or office choice

- **Given** every screen
- **When** it is rendered
- **Then** no office, site or location selector exists anywhere — the application serves exactly one office in this release (NFR-002)

### AC-09 The verification is recorded, not just performed

- **Given** the three widths across ten screens
- **When** the sweep is done
- **Then** the evidence is captured in the story PR per the delivery gate, so a later change can be checked against what was verified

## Edge cases

- This story **verifies**; it does not build. Each screen's own story builds its states, and a defect found here is fixed in that screen's story or as a bug issue against it — not silently patched inside this one. A finding that reveals a *design* gap goes back to `/ux`, not into this PR.
- 1023px versus 1024px is the SCR-005 table-to-card boundary (US-013/AC-11), and 767px versus 768px the shell boundary. The three named widths do not test the boundaries themselves; add them where a screen changes layout.
- NFR-008's contrast figure is 4.5:1 for text on surface. The 3:1 `--c-border-control` token added for form-field boundaries exceeds WCAG 1.4.11 and is not obliged by NFR-008 — do not report it as a shortfall.
- `tokens.json` is generated, never hand-edited (`node tools/aidlc-check.mjs --write`).
- Screens are still verified even where a story that uses them was dropped, because the screens are approved.

## UI

Served by **all ten approved screens** — SCR-001 through SCR-010. This story adds no state and changes no design; it proves what the ten specs already committed to.

Every screen's own accessibility and responsive section is the specification here. This story does not restate them — it checks them.

## QA notes

- Do this as **one sweep across ten screens, not ten separate passes**, because the inconsistencies between screens are exactly what a per-screen check cannot see. That is the argument for this being a story at all.
- AC-05 is best done with a greyscale rendering of each state: anything that becomes ambiguous in greyscale fails.
- AC-06 is largely already automated — `aidlc-check` reports contrast shortfalls as warnings. Read its output rather than re-measuring by hand, and treat a warning here as a finding.
- AC-07 is manual, and per-screen. The screen specs name the exact keyboard model each screen promised; test against those sentences.
- AC-01 across ten screens and every state is the largest verification surface in the release. Prioritise the states with real layout risk — the admin tables, the SCR-003 date strip, the dialogs and bottom sheets.

## API impacts

None.
