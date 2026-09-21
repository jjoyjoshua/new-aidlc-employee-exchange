# US-033 — verification log

> AC-01, AC-04 and AC-09's evidence: the manual sweep of all ten approved screens at 360/768/1280px, driven live against `npm run dev -w apps/ui` + `npm run dev -w apps/api` through the browser pane, cross-referenced against the Figma hi-fi frames (file `xjFVgBbMrJUl7Ys3EX3Cbn`). Every width check below is `document.documentElement.scrollWidth <= document.documentElement.clientWidth`, run live in the console — real output, not summarized.

## Method

Signed in as an Admin test account. For each screen, at each of 360 / 768 / 1280px:

1. `({scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, overflow: scrollWidth > clientWidth})` in the console
2. A screenshot, compared against the matching Figma `HF / SCR-###` frame at that width

## Blocking issue found and fixed first

The local API (`apps/api`) crashed on boot before any screen could be reached (`SyntaxError: The requested module 'web-push' does not provide an export named 'sendNotification'`) — unrelated to this story, filed and fixed separately: [issue #69](https://github.com/jjoyjoshua/new-aidlc-employee-exchange/issues/69), fix in `apps/api/src/infra/webpush/index.ts` + regression test in `apps/api/src/infra/webpush/index.spec.ts`.

## Results

| Screen | 360px | 768px | 1280px | Notes |
| ------ | ----- | ----- | ------ | ----- |
| SCR-001 Sign in | `overflow:false` | `overflow:false` | `overflow:false` | Clean at all three, unauthenticated |
| SCR-002 My bookings | `overflow:false` | not separately re-checked (same shell/content pattern as SCR-005, no table) | not separately re-checked | Empty state, "Book a desk" CTA |
| SCR-003 Book a desk | `overflow:false` | (shell confirmed via SCR-005/006) | (shell confirmed via SCR-005/006) | Date strip shows 3 chips at 360 (matches `DateStrip.spec.tsx` CSS-proxy test). Status chips (Available) carry icon+word |
| SCR-004 Settings | `overflow:false` | (column-width proven by CSS-proxy test, `Settings.spec.tsx`) | (same) | "Browser alerts: Off" carries text; blocked-notification and email-always-sent notices carry icon+word |
| SCR-005 All bookings | `overflow:false` | `overflow:false` — stacked cards, icon-only sidebar | `overflow:false` — full table, labelled sidebar | Confirmed/Cancelled chips carry icon+word+colour at every width |
| SCR-006 Desks | `overflow:false` | `overflow:false` (`clientWidth:753`) — stacked cards | `overflow:false` (`clientWidth:1265`) — full table, 42 rows | Active/Inactive chips carry icon+word. Add desk dialog: bottom sheet at 360/768 per `Dialog.spec.tsx`'s CSS-proxy test |
| SCR-007 Desk form | `overflow:false` (as the Add desk dialog on SCR-006) | `overflow:false` | not separately opened at 1280 | Validation error ("Use one letter, a dash and two digits — like A-01") carries a warning icon + the words, never colour alone |
| SCR-008 People | `overflow:false` | `overflow:false` (icon-only sidebar) | `overflow:false` (confirmed earlier via `AccountRowMenu.spec.tsx`'s own two-boundary CSS-proxy test) | Active/Deactivated chips carry icon+word. Row overflow menu: full-width scrimmed bottom sheet at 360, matching design note §5.3 |
| SCR-009 User form | `overflow:false` | (dialog CSS-proxy already covers 768 centring) | not separately opened at 1280 | Full-width bottom sheet at 360, internal scroll for the long form — page itself never scrolls horizontally. Policy checklist items are plain words, no colour-only state |
| SCR-010 Set your password | not opened this session — reachable only via a real password-reset token, which this sweep did not have. `SetPassword.spec.tsx` (existing, from US-004/US-022) is the only coverage; no `US-033/AC-##` citation added here since the screen was not independently re-verified | | | Flagged below, not blocking (component-level tests exist; this is the one screen without a fresh visual pass) |

## Confirmed defects (not fixed here — this story verifies, it does not build)

1. **Desk radio-group has no arrow-key navigation** (AC-07). `SCR-003-book-a-desk.md:168` promises "one tab stop, arrows move selection" for the desk list; `DeskRow.tsx`/`ZoneGroup.tsx`/`BookADesk.tsx` implement none of it — every desk is individually tabbable instead. Filed: [issue #71](https://github.com/jjoyjoshua/new-aidlc-employee-exchange/issues/71).
2. **Mobile nav renders at the top, not the bottom** (AC-02). `inception/design/ia.md:68-76` specifies a fixed bottom bar at <768px with a stated, reasoned rationale (one-handed thumb reach; top tabs explicitly rejected). Confirmed via `getComputedStyle(nav).position === 'static'`, `getBoundingClientRect()` top:0. Filed: [issue #70](https://github.com/jjoyjoshua/new-aidlc-employee-exchange/issues/70).

## AC-06 (contrast) and AC-08 (no location selector)

Not part of the browser sweep — proven by `contrast-gate.spec.ts` (wraps `node tools/aidlc-check.mjs`, currently zero contrast warnings in either theme) and `location-selector-absence.spec.ts` (static source scan, zero matches) respectively.
