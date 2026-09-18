# US-005 — Choose a booking date inside the window

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-005-choose-a-booking-date.md`                    |
| **Traces to**     | REQ-006, NFR-001, BR-001.3, V-02, V-03                                              |
| **Screen**        | SCR-003 — ST-01, ST-02, ST-03 only (the date controls; the desk list and the confirm action are US-006/US-007) |
| **Covering ADRs** | ADR-001, ADR-002 (exercised, not amended — see `design-note.md` §6). No new ADR      |
| **Tier**          | Complex                                                                              |
| **Status**        | implemented                                                                          |
| **Updated**       | 2026-09-18                                                                           |

## Problem

Today the browser has no way to know the office's calendar date or timezone, and the API's boot responses (`POST /api/auth/sign-in`, `GET /api/auth/session`) carry only `user` (and `session` where relevant). SCR-003's `/book` route is reserved but unbuilt (US-001 design note §9.1), and `apps/api/src/modules/bookings/` and `apps/api/src/domain/` hold no date-window logic at all. The system must instead: derive "today" once, on the server, in the configured office timezone; hand the browser that date plus the timezone name at boot; and let both sides answer, from a shared pure rule, which of the 30 days from today are open for booking and which are refused and why.

## Functional requirements

| ID    | Requirement                                                                                                                                     | Priority | Serves       | Status      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----------- |
| FR-01 | `POST /api/auth/sign-in` and `GET /api/auth/session` responses include `office: { timezone, today }`, with `today` computed server-side from `OFFICE_TIMEZONE` and the request instant                                                          | Must     | AC-07        | implemented |
| FR-02 | On opening **Book a desk** with no date selected, the next bookable working day (`office.today` itself if it is Mon–Fri, otherwise the next Monday) is preselected and exactly one availability request is issued for it                        | Must     | AC-01        | implemented |
| FR-03 | The date strip and the calendar behind **Pick another date** offer every date from `office.today` through `office.today + 30` inclusive, and no date outside that range can be selected                                                          | Must     | AC-02        | implemented |
| FR-04 | A Saturday or Sunday inside the window appears in the strip and the calendar but is not selectable, and carries **Closed** as visible text                                                                                                        | Must     | AC-03        | implemented |
| FR-05 | Every refused date's reason (**Closed**, **Too far ahead**, **Past**) is derived from one shared rule and rendered as text, never by appearance alone; a date that is both past and a weekend reads **Past** | Must     | AC-04        | implemented |
| FR-06 | The calendar behind **Pick another date** does not navigate before the month containing `office.today` or after the month containing `office.today + 30`                                                                                          | Must     | AC-05        | implemented |
| FR-07 | A refused day inside the calendar is struck through, and the calendar's footer states, once, that weekends are closed and the last bookable date                                                                                                  | Must     | AC-06        | implemented |
| FR-08 | Every date label on the screen (strip, calendar, footer) is formatted from the office-local date, never from the viewing device's timezone                                                                                                        | Must     | AC-07        | implemented |
| FR-09 | The office timezone is stated once in the page header (`BookADesk`, D-06)                                                                                                                                                                           | Must     | AC-07        | implemented |
| FR-10 | Choosing a new date while a previous availability request is still in flight keeps the date controls interactive throughout, and the response that resolves later is the one rendered — the earlier response is discarded even if it resolves after | Must     | AC-08        | implemented |

## Non-functional requirements

| ID     | Requirement                                                                                                    | Serves  |
| ------ | ---------------------------------------------------------------------------------------------------------------- | ------- |
| NFR-01 | "Today", the window's edges, and every date label are the office's, computed from the configured timezone, never the viewing device's | NFR-001 |
| NFR-02 | No date's refused/available/selected state is conveyed by colour alone                                          | NFR-008 |

## Technical constraints

- No new endpoint (`design-note.md` §1). `office.today` and `office.timezone` ride the two existing boot responses; a request whose only job is to answer two scalars is not a resource.
- The window/weekday rule is one set of pure, shared functions in `libs/contracts/src/booking-window.ts`, imported by both `apps/ui` and `apps/api/src/domain` — not reimplemented on either side (ADR-002's payoff, same pattern as `password.ts`'s `evaluatePasswordPolicy`).
- The only zone-dependent step anywhere in this story is `officeToday(nowMs, timeZone)` in `apps/api/src/domain/booking-window.ts`. Everything downstream is civil-date (`YYYY-MM-DD`) string arithmetic — no `Date` parsing, no locale-dependent formatting.
- `BOOKING_WINDOW_DAYS` (30) is a literal constant, not a configuration key — no NFR or risk asks an operator to change it (`design-note.md` §2.6).
- No new date library. `Intl.DateTimeFormat` and `Date.UTC` are sufficient for the one zone conversion this story needs (`design-note.md` §2.7).
- `apps/api/src/config/index.ts` is not modified — `OFFICE_TIMEZONE` already exists, already required, already validated.

## Out of scope

- How many desks are free on a date, and which (US-006's `GET /api/bookings/availability?date=`).
- Taking a desk and the two unique-index races that arbitrate a double booking (US-007's `POST /api/bookings`).
- Public holidays — not excluded, by accepted risk (BRD-001 §8, RISK-002, accepted 2026-09-07). `refusalFor` has exactly three reasons and no holiday branch.
- Re-deriving "today" without a reload across an office midnight while the tab is open — the story's own edge cases say the screen is not required to do this.
- The `app-shell` sidebar's mismatch against the approved hi-fi `Sidebar` component (wrong nav labels, no responsive collapse) — a real gap, tracked as its own change, not folded into this PR.
