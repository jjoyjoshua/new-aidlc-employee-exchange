# US-033 — implementation plan

> **The Gate D1 artifact.** The human reads this file and replies `go` in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                                          |
| --------- | ---------------------------------------------------------------------------------------- |
| **Story** | `inception/stories/user-stories/US-033-responsive-and-accessible-across-every-screen.md` |
| **Spec**  | this story builds nothing new — SCR-001…SCR-010 are the spec, see `decisions.md` D-01     |
| **Tier**  | Medium                                                                                    |

## Approval — Gate D1

| Field                | Value                                                                     |
| --------------------- | -------------------------------------------------------------------------- |
| Status                | **approved**                                                                |
| Approved by           | Joy Joshua <joy_j@trigent.com>                                             |
| Approved on            | 2026-09-21                                                                  |
| Plan commit approved  | *uncommitted at approval* — base `4d99b1c873a142cf8ae6371c6729daf95cc5e494` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`. `Plan commit approved` is the SHA of the commit holding this plan as they read it. The name is self-asserted: attribution, not authentication.

## What this story is

US-033 verifies; it builds nothing. Every AC still needs a passing test citing `US-033/AC-##` (`aidlc-check` check 4 does not know the story is "just an audit"), so this plan's steps are almost entirely **adding a citation to a test that already proves the behaviour** — precedent: `3a32a42` "trace suggest-a-password to its own story [US-022]". Two exceptions: AC-06/AC-08/AC-09 have no existing single-component home and get one small new file; and the width/layout ACs (AC-01–04) are proven the way this codebase already proves anything jsdom cannot render — `apps/ui/src/styles/index.css:14-18` says outright that jsdom has no layout engine, and `Dialog.spec.tsx:146-150` already treats the stylesheet source as the honest proxy for a breakpoint claim, with the human/DEV verifying the real rendering by eye. This plan follows that precedent rather than introducing Playwright (confirmed with the human — `decisions.md` D-01).

## Steps

### Step 1 — App shell: the three responsive shells (AC-02)

| Field    | Value                                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | AC-02                                                                                                                                                                                                     |
| Files    | `apps/ui/src/components/app-shell/AppShell.spec.tsx` (modify), `apps/ui/src/components/app-shell/app-shell.css` (read only)                                                                             |
| Verify   | `npm test -w apps/ui` — new test `... (US-033/AC-02)` passes                                                                                                                                              |

Add a CSS-proxy test reading `app-shell.css` (mirrors `Dialog.spec.tsx:146-150`): default rule = bottom bar (no media query, confirmed `app-shell.css:9`), `@media (min-width: 768px)` (`app-shell.css:116`) = 72px icon-only sidebar, `@media (min-width: 1024px)` (`app-shell.css:196`) = 240px labelled sidebar. Cross-checked against the Figma `App shell` page (`5:29`): `35:23` Breakpoint=1280 (persistent sidebar), `35:48` Breakpoint=768 (icon rail), `35:70` Breakpoint=360 (bottom bar), and the `Sidebar` frame's `Density=Expanded`/`Density=Collapsed` variants (`51:26`…`51:329`) — matches the code. 767px/1023px boundary tests are out of scope per the story's own Edge Cases (only the three named widths).

### Step 2 — Admin tables as stacked cards at 768px (AC-03, part 1)

| Field    | Value                                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | AC-03                                                                                                                                                                                                     |
| Files    | `apps/ui/src/screens/all-bookings/AllBookings.spec.tsx`, `apps/ui/src/screens/desks/Desks.spec.tsx`, `apps/ui/src/screens/people/People.spec.tsx` (modify), corresponding `.css` files (read only)      |
| Verify   | `npm test -w apps/ui` — three new tests `... (US-033/AC-03)` pass                                                                                                                                         |

Confirmed by reading the CSS (`all-bookings.css:137,152`, `desks.css:110,130`, `people.css:217,234`): cards are the **default**, unguarded rule; `@media (min-width: 1024px)` is what switches to `<table>`. 768px sits below 1024px, so cards render — one CSS-proxy test per screen asserting the table rule is gated at `min-width:1024px` and the card markup has no competing `min-width` gate below it.

### Step 3 — SCR-003 date strip and SCR-004 content column at 768px (AC-03, part 2)

| Field    | Value                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | AC-03                                                                                                                                              |
| Files    | `apps/ui/src/components/date-strip/DateStrip.spec.tsx`, `apps/ui/src/screens/settings/Settings.spec.tsx` (modify)                                 |
| Verify   | `npm test -w apps/ui` — two new tests `... (US-033/AC-03)` pass                                                                                    |

CSS-proxy tests: `date-strip.css:167` (`min-width:768px` → 5 chips) and `date-strip.css:178` (`min-width:1280px`); `settings.css:31` (520px column at 768) vs `settings.css:3` (640px cap, default/1280).

### Step 4 — No status, validation state, or selection signals by colour alone (AC-05)

| Field    | Value                                                                                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | AC-05                                                                                                                                                                                                                                          |
| Files    | `apps/ui/src/components/status-chip/StatusChip.spec.tsx`, `apps/ui/src/components/text-field/TextField.spec.tsx`, `apps/ui/src/components/toggle/Toggle.spec.tsx` (modify)                                                                    |
| Verify   | `npm test -w apps/ui` — citations added, all pass unchanged                                                                                                                                                                                    |

All three already prove the behaviour: `StatusChip.spec.tsx:6-11,76-81,106-111` assert icon+word alongside colour for every `kind` (desk/booking/inventory/account — this is also every Figma `Status chip` state: `20:2`…`236:58`, whose own doc note says "each variant carries its ICON and its WORD"); `TextField.spec.tsx:41` asserts `.field__message-icon` on a validation error (`TextField.tsx:9,91-94`); `Toggle.spec.tsx:14-18` already asserts the on/off text label ("carries its state as a visible word, never colour alone (NFR-008)"). Add a `(US-033/AC-05)` citation to the existing, already-passing assertions in each file — confirmed while writing this plan, no new assertions needed.

### Step 5 — Contrast gate (AC-06)

| Field    | Value                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| Advances | AC-06                                                                                                          |
| Files    | `apps/ui/src/lib/contrast-gate.spec.ts` (create)                                                                |
| Verify   | `npm test -w apps/ui` — new test `... (US-033/AC-06)` passes; `node tools/aidlc-check.mjs` output pasted into the PR as evidence |

`tools/aidlc-check.mjs:474-534` already computes light/dark WCAG AA 4.5:1 for every text-on-surface pair in `tokens.css` and currently reports **zero** contrast warnings (confirmed by running it). Rather than duplicate that contrast math (a second implementation is a second source that drifts), the new test spawns `node tools/aidlc-check.mjs` and asserts exit code 0 with no line matching `/contrast/i` in its output — reusing the authoritative check instead of re-deriving it.

### Step 6 — Keyboard operability citations (AC-07, the parts that hold)

| Field    | Value                                                                                                                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | AC-07                                                                                                                                                                                                                              |
| Files    | `apps/ui/src/components/date-strip/DateStrip.spec.tsx`, `apps/ui/src/components/dialog/Dialog.spec.tsx`, `apps/ui/src/components/dialog/ConfirmDialog.spec.tsx`, `apps/ui/src/screens/people/AccountRowMenu.spec.tsx` (modify) |
| Verify   | `npm test -w apps/ui` — citations added, all pass unchanged                                                                                                                                                                      |

Add `(US-033/AC-07)` citations to tests that already prove their named commitment: `DateStrip.spec.tsx:65-69,72-87` (single tab stop, roving tabindex, ArrowRight skips refused days — the exact model `SCR-003-book-a-desk.md:168` names for the date strip); `Dialog.spec.tsx:117-142,234-238` and `ConfirmDialog.spec.tsx:198-224` (tab-trap both directions, Escape, focus restored to the trigger on close); `AccountRowMenu.spec.tsx:114-303` (Escape/click-outside/ArrowDown-ArrowUp, and every action "dismisses the menu and returns focus to the trigger" — the SCR-008 commitment). **Does not** claim the desk-radiogroup arrow-key commitment — see Step 8 and Open Questions: `SCR-003-book-a-desk.md:168` promises "one tab stop, arrows move selection" for the desk list, and no code implements roving tabindex or arrow-key handling for it (`DeskRow.tsx`, `ZoneGroup.tsx`, `BookADesk.tsx` — no `onKeyDown`/`ArrowDown` anywhere). Writing a passing test for that commitment would be false; this step proves what holds and Step 8 records what doesn't.

### Step 7 — No location/office selector exists anywhere (AC-08)

| Field    | Value                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------ |
| Advances | AC-08                                                                                                    |
| Files    | `apps/ui/src/lib/location-selector-absence.spec.ts` (create)                                              |
| Verify   | `npm test -w apps/ui` — new test `... (US-033/AC-08)` passes                                              |

A repo-wide static scan (Node `readdirSync`, recursive, over `apps/ui/src`) asserting no source file contains an office/site/location-selector pattern (component name, `role="combobox"` paired with office/location copy, etc.). Confirmed absent by grep already; this makes that fact a standing, re-checked assertion rather than a one-time observation.

### Step 8 — The visual/layout sweep: all ten screens at 360 / 768 / 1280 (AC-01, AC-04, AC-05 spot-check, AC-07 gap confirmation)

| Field    | Value                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | AC-01, AC-04, AC-09                                                                                                                                 |
| Files    | `inception/specs/US-033-responsive-and-accessible-across-every-screen/evidence/` (create — screenshots), `verification-log.md` (create)             |
| Verify   | manual — the browser pane against the running dev server, cross-referenced with the Figma HF frames for each `SCR-###`                              |

Per the story's own QA note ("prioritise the states with real layout risk"): drive `npm run dev` in the browser pane, resize to 360/768/1280, and for each of the 10 screens' highest-risk state (the admin tables full/near-full, the date strip, a validation-error form, a dialog/bottom sheet) — screenshot, run `document.documentElement.scrollWidth <= window.innerWidth` via the JS console (proves AC-04's "page body does not scroll horizontally"), and compare against the matching Figma `HF / SCR-###` frame at that width. A layout defect found here is **not** fixed in this PR (story Edge Cases) — it becomes a bug issue against the screen's own story, linked from `verification-log.md`. This step also confirms Step 6's desk-radiogroup finding by hand (does tabbing really visit every row individually, with no arrow-key response) before it's filed as a bug issue — see Open Questions.

### Step 9 — Record the sweep, update traceability

| Field    | Value                                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | AC-09                                                                                                                                                                                |
| Files    | `apps/ui/src/lib/contrast-gate.spec.ts` (add AC-09 assertion that `verification-log.md` exists and lists all 10 screens), `traceability.md`, `change-log.md`, manifest, index.md   |
| Verify   | `node tools/aidlc-check.mjs` — clean; `npm test -w apps/ui` — full suite green                                                                                                      |

## Rollback

No production behaviour changes — every step but Step 8 only adds test citations/assertions or a new, narrow test file. Revert the PR if a citation turns out to be wrong (a test that doesn't actually prove its AC); nothing else to undo.

## Open questions

None outstanding. One decision resolved before `go`: `SCR-003-book-a-desk.md:168` promises the desk list is "one tab stop, arrows move selection" — the code has neither (Step 6). The human chose: file a `bug` issue against US-007/SCR-003 once Step 8 confirms it by hand, link it from `traceability.md`, and let AC-07 ship proven for the commitments that do hold (date strip, dialogs, row menu) with this one gap linked, rather than blocking the PR on a fix in a different story.
