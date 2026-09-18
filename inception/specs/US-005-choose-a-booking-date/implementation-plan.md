# US-005 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                   |
| --------- | -------------------------------------------------------------------- |
| **Story** | `inception/stories/user-stories/US-005-choose-a-booking-date.md`   |
| **Spec**  | `spec.md`                                                            |
| **Tier**  | Complex                                                              |

## Approval — Gate D1

| Field                | Value                                       |
| -------------------- | -------------------------------------------- |
| Status               | **approved**                                 |
| Approved by          | Joy Joshua <joy_j@trigent.com>               |
| Approved on          | 2026-09-18                                   |
| Plan commit approved | *uncommitted at approval* — base `94e9ce8`   |

`Approved by` is the human's name and email from `git config user.name` / `user.email`; if either is unset, ask them rather than writing `unknown`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**, the commit before this stamp. That SHA is what makes the approval verifiable: a reviewer at D2 runs `git diff <sha> -- <this file>` and sees whether the plan changed after approval. The name is self-asserted, so it is attribution, not authentication.

## Steps

Ordered. Each step names the files it touches, the `FR-##` it advances, and how it is verified. Test-first per acceptance criterion: the failing test named `... (US-005/AC-##)` comes before the code that turns it green.

### Step 1 — Shared date-window rules (`libs/contracts`)

| Field    | Value                                                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-03, FR-04, FR-05, FR-06                                                                                                                                                                                                  |
| Files    | `libs/contracts/src/booking-window.ts` (create), `libs/contracts/src/booking-window.spec.ts` (create), `libs/contracts/src/index.ts` (modify — export, correct docblock per D-02), `eslint.config.mjs` (modify — Boundary 5 message text, per D-02) |
| Verify   | `npm test --workspace @desk-booking/contracts` — expected, named `... (US-005/AC-02)`: `refusalFor` at `today` and `today+30` is bookable, at `today+31` is `too-far-ahead`, at `today-1` is `past` (the boundary the QA note names, literals not derived from the function under test). Named `... (US-005/AC-03)`: a Saturday and a Sunday inside the window are `closed`. Named `... (US-005/AC-04)`: a **past** Saturday is `past`, a Saturday **beyond the window** is `too-far-ahead` — the precedence in D-05. Named `... (US-005/AC-01)`: `nextBookableDate` for a Wednesday returns itself, for a Saturday returns the following Monday, for a Sunday returns the following Monday. Named `... (US-005/AC-05)`: first/last navigable month from `today` and `lastBookableDate(today)`, including a `today` late in a 31-day month (spans three months) |

### Step 2 — `officeToday` (`apps/api/src/domain`)

| Field    | Value                                                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01                                                                                                                                                                                    |
| Files    | `apps/api/src/domain/booking-window.ts` (create), `apps/api/src/domain/booking-window.spec.ts` (create)                                                                                |
| Verify   | `npm test --workspace @desk-booking/api` — expected, named `... (US-005/AC-07)`: `officeToday(instant, 'Asia/Kolkata')` returns `2026-10-03` for the instant `2026-10-02T19:30:00Z`, which is `2026-10-02` in UTC — the one test in this story that needs a real zone difference |

### Step 3 — `office` on the boot responses (`libs/contracts/src/auth.ts`)

| Field    | Value                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01                                                                                                                                 |
| Files    | `libs/contracts/src/auth.ts` (modify — `officeDateSchema`, `officeSchema`, add `office` to `signInResponseSchema` and `sessionResponseSchema`), `libs/contracts/src/auth.spec.ts` (modify) |
| Verify   | `npm test --workspace @desk-booking/contracts` — expected: both response schemas parse a fixture that includes `office: { timezone: 'Asia/Kolkata', today: '2026-09-18' }`; `officeDateSchema` rejects a non-`YYYY-MM-DD` string |

### Step 4 — Wire `office` through the API (`auth.router.ts`, `composition.ts`)

| Field    | Value                                                                                                                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01                                                                                                                                                                                                                                                    |
| Files    | `apps/api/src/modules/auth/auth.router.ts` (modify — `AuthRouterDeps` gains `officeTimezone`; the `/sign-in` handler at line 91 and the `/session` handler at line 198 both build `office` from `officeTimezone` and `nowMs`), `apps/api/src/composition.ts` (modify — `BuildAppOptions` gains `officeTimezone`, defaulting to `config().OFFICE_TIMEZONE`, threaded into `createAuthRouter`), `apps/api/src/modules/auth/auth.routes.spec.ts` (modify) |
| Verify   | `npm test --workspace @desk-booking/api` — expected, named `... (US-005/AC-07)`: `buildApp({ officeTimezone: 'Asia/Kolkata', nowMs: () => Date.parse('2026-10-02T19:30:00Z') })`, then `POST /sign-in` and `GET /session` each return `office: { timezone: 'Asia/Kolkata', today: '2026-10-03' }` — the injected zone and clock, not the test runner's |

### Step 5 — Carry `office` into the UI (`auth-context.tsx`)

| Field    | Value                                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01                                                                                                                                                  |
| Files    | `apps/ui/src/lib/auth/auth-context.tsx` (modify — `AuthContextValue` gains `office`, set from both the sign-in and the session-check responses), `apps/ui/src/lib/auth/auth-context.spec.tsx` (modify) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected: after a successful sign-in, `useAuth().office` equals the response's `office`; after a cold-boot session check, likewise |

### Step 6 — Office timezone in the page header (folded into `BookADesk`, D-06)

| Field    | Value                                                                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-09                                                                                                                                                |
| Files    | none in this step — implemented as part of Step 10's `BookADesk.tsx`. `AppShell` is deliberately not modified (D-06): it is a documented structural stub, and this requirement is scoped to one screen's header |
| Verify   | proven in Step 10, named `... (US-005/AC-07)`: the rendered page header contains the office timezone text exactly once |

### Step 7 — Shared civil-date formatter

| Field    | Value                                                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-08                                                                                                                                                                        |
| Files    | `apps/ui/src/lib/format-office-date.ts` (create), `apps/ui/src/lib/format-office-date.spec.ts` (create)                                                                     |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-005/AC-07)`: with the test runner's `TZ` set to a zone west of UTC (e.g. `America/New_York`), formatting `2026-10-03` still renders "Sat 3 Oct", not "Oct 2" — the trap in D-03 |

### Step 8 — `date-strip` component

| Field    | Value                                                                                                                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-03, FR-04, FR-05                                                                                                                                                                                                                              |
| Files    | `apps/ui/src/components/date-strip/DateStrip.tsx` (create), `apps/ui/src/components/date-strip/date-strip.css` (create), `apps/ui/src/components/date-strip/DateStrip.spec.tsx` (create)                                                        |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-005/AC-03)`: a weekend chip is rendered, is not selectable (no click handler fires, not reachable by arrow-key selection), and its text contains "Closed". Named `... (US-005/AC-04)`: each of the three refusal reasons is present as text on its chip. Named `... (US-005/AC-02)`: a date one day beyond the window is not rendered as selectable. A keyboard test: the strip is one tab stop; arrow keys move between days and skip refused days while a screen-reader-only description still names the reason (interaction/accessibility per SCR-003) |

### Step 9 — `date-picker` component

| Field    | Value                                                                                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-05, FR-06, FR-07                                                                                                                                                                                                     |
| Files    | `apps/ui/src/components/date-picker/DatePicker.tsx` (create), `apps/ui/src/components/date-picker/date-picker.css` (create), `apps/ui/src/components/date-picker/DatePicker.spec.tsx` (create)                       |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-005/AC-05)`: the previous-month control is disabled in the month containing `today`, and the next-month control is disabled in the month containing `today + 30`. Named `... (US-005/AC-06)`: a refused cell carries the strikethrough treatment (assert the CSS class/attribute, not colour), and the footer text states both rules exactly once, naming the last bookable date |

### Step 10 — `BookADesk` screen and the latest-wins seam

| Field    | Value                                                                                                                                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-02, FR-09, FR-10                                                                                                                                                                                                                                                                                          |
| Files    | `apps/ui/src/screens/book-a-desk/BookADesk.tsx` (create), `apps/ui/src/screens/book-a-desk/book-a-desk.css` (create), `apps/ui/src/screens/book-a-desk/BookADesk.spec.tsx` (create), `apps/ui/src/screens/book-a-desk/use-availability.ts` (create — declares `fetchAvailability(date, signal)` as the seam US-006 fills in), `apps/ui/src/screens/book-a-desk/use-availability.spec.ts` (create), `apps/ui/src/routes.tsx` (modify — mount `/book`) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-005/AC-01)`: mounting with no `?date=` preselects `nextBookableDate(office.today)` in the strip and issues exactly one availability request for it. Named `... (US-005/AC-07)`: the rendered page header contains the office timezone text exactly once. Named `... (US-005/AC-08)`: issue a request for date A, then for date B, resolve A **after** B; assert B's response is what renders, A's never appears, and the date controls were interactive throughout — not disabled during either request |

### Step 11 — `bookings` module README and manifest

| Field    | Value                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | (documentation — no FR of its own)                                                                                                                              |
| Files    | `apps/api/src/modules/bookings/README.md` (modify — states that the window rule lives in `domain/` and `libs/contracts`, not here), `knowledge/traceability/manifest.json` (modify — US-005 `tests[]`), `inception/specs/index.md` (modify — US-005 row) |
| Verify   | `node tools/aidlc-check.mjs` — no new findings for US-005                                                                                                       |

### Step 12 — Full suite

| Field    | Value                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Advances | (all of the above)                                                                                                                |
| Files    | none                                                                                                                              |
| Verify   | `npm run lint && npm run typecheck && npm test && node tools/aidlc-check.mjs` — all green, and the check reports US-005 with every AC cited by a test |

## Rollback

Every change in this story is additive (a new nested response field, new files, one new route). Reverting the PR is sufficient: no migration runs, no configuration key is introduced, and no existing endpoint's required shape changes. A tab left open across the revert continues to work exactly as it did before US-005 shipped, because `office` was optional-in-effect (non-`.strict()` responses) from the moment it appeared.

## Open questions

| Question                                         | Owner         | Blocks |
| ------------------------------------------------- | ------------- | ------ |

None. The one question the design note raised for the human — ride the boot responses vs. a dedicated endpoint — is answered (D-01). The comment correction (D-02), the formatting trap (D-03/Step 7), and the latest-wins seam boundary (D-04) are resolved decisions, not open questions. Public holidays and the office-midnight staleness case are accepted, out of scope (`spec.md`).
