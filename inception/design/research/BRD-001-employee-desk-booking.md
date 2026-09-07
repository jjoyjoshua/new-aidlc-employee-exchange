# Research — Employee Desk Booking System (serves BRD-001)

> Advisory input to the design step, reviewed in the 2a PR. Nothing here is a gate artifact; what it earns is the right of every screen, principle, and label downstream to cite evidence instead of taste. Honesty rule: findings not grounded in real user data carry `[SYNTHESISED — validate with users]`; a validation nobody ran carries `[PENDING]`. A synthesised finding and a validated one must never look the same.

|            |                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Serves** | BRD-001 — Employee Desk Booking System                                                                                                                                                                 |
| **Inputs** | **None: synthesised from requirements.** No employee or administrator has been interviewed, surveyed, or observed (confirmed with Joy Joshua, 2026-09-07). There is no live product, so no analytics exist. The three upstream discovery sessions cited in the BRD's `Source` column are absent from this repository (BRD-001 open question #8, RISK-008), so not even second-hand user words are available to read. |
| **Status** | draft — reviewed with the 2a design PR                                                                                                                                                                 |

> **Read this before trusting anything below.** Every persona, journey stage, pain point and insight in this document is inferred from BRD-001's requirements and business rules by the UX persona. None of it is evidence. It is labelled `[SYNTHESISED — validate with users]` throughout, and §8 contains an interview guide written specifically to test the assumptions in §1. The design that follows is defensible as _a coherent reading of the requirements_; it is not yet defensible as _what users need_.

## 1. Assumptions

What the requirements take for granted but never state. Each row names the cost of being wrong — that is what decides which ones get tested.

| #   | Assumption                                                                                                                                                       | Risk if wrong                                                                                                                                                                                           | Confidence | Test?   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------- |
| A-1 | Employees book 1–3 days ahead, not weeks. The 30-day window (REQ-006) is a ceiling, not the working range.                                                        | The date control is optimised for the wrong span. If people really book a month out, a "next few days" strip is a cage and they hunt for a calendar that isn't prominent.                                | med        | yes     |
| A-2 | Regulars have a habitual desk or zone and want it again; newcomers have no preference.                                                                            | Without a "book this desk again" path, every booking is a fresh hunt through 30–100 desks. This is the cheapest win in the product and the requirements never mention it.                                 | med        | yes     |
| A-3 | Most bookings are made on a phone — evening before, or on the commute.                                                                                            | A desktop-first design makes the highest-frequency task the most painful one. NFR-004 requires both, but _which one leads_ changes every layout decision.                                                | med        | monitor |
| A-4 | The letter prefix in a desk number (`A-01`, `B-02`) corresponds to a physical area employees recognise and can name.                                              | Grouping the desk list by prefix produces meaningless groups, and the primary means of making 30–100 desks navigable evaporates. Also: nothing in the BRD enforces the format, so prefixes may not exist. | **low**    | yes     |
| A-5 | Employees choose a desk mainly by _where it is_ or _who is near it_, not by which one happens to be free.                                                          | A list showing only availability answers the wrong question. Showing who occupies a taken desk is **not in BRD-001** and carries privacy implications — so if this holds, the product has a gap, not the design. | med        | yes     |
| A-6 | The administrator is one person doing this alongside other duties, a few times a week — not a full-time console operator.                                          | An admin area designed for power users (bulk actions, saved views, keyboard-driven tables) is wasted build. Conversely, if there is a dedicated ops person, a one-row-at-a-time UI wastes their day.       | high       | monitor |
| A-7 | Plans change often, so cancellation is a routine act, not an exception.                                                                                           | Burying cancel behind a booking detail view produces silent no-shows — and the product has no check-in, so nobody would ever find out (see §7).                                                          | med        | monitor |
| A-8 | Employees care about upcoming bookings and barely about past ones.                                                                                                 | Giving history equal weight clutters the screen people open most. If the opposite is true (people audit office days for expenses or HR), history needs to be first-class, not a lower section.            | med        | monitor |
| A-9 | ~~An Admin does not need to book a desk for themselves.~~                                                                                                          | **Closed 2026-09-07 (Joy Joshua, PO/BA): confirmed correct.** The role exclusivity in REQ-004 is deliberate — the administrator is not booking a hot desk. No longer an assumption; recorded as a decision on SCR-005.                                          | ~~low~~ **settled** | closed |

### Decisions taken after this document was written

Three assumptions were settled by the PO/BA on 2026-09-07, during the design review that closed the screen specs' open questions. They are struck through or annotated above rather than deleted, because a reader needs to know what was assumed as well as what was decided.

| #   | What changed                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-4 | **Partly settled.** Desk numbers now have an enforced format (`A-01`), so zone grouping is *consistent* by construction. Whether the letters correspond to areas employees can point at is still untested — §8 Q5 still earns its place |
| A-5 | **Decision taken, assumption still open.** Occupant names will not be shown; a taken desk reads **Taken**. If A-5 turns out to be true, that is a product gap to raise with `/ba`, not a design fix — so §8 Q4 remains the highest-value employee question |
| A-9 | **Closed.** Administrators do not book desks, and that is intended                                                                                                                       |

A-1, A-2, A-3, A-6, A-7 and A-8 are untouched: they are claims about how people behave, and no decision in a review can settle those. The interview guide in §8 is still the only thing that will.

## 2. Competitor scan

`[SYNTHESISED — validate with users]` — and worth stating precisely: this is a pattern scan drawn from general product knowledge of the desk-booking category, not a hands-on audit performed for this project. Nobody sat with these products, timed a task, or checked a current release. Treat the Borrow column as hypotheses about what works, and re-check any pattern before it becomes an argument in a review.

| Product     | Nav model                                                | Onboarding                                     | Empty/error handling                                                     | Borrow                                                                                                     | Avoid (incl. heuristic broken)                                                                                                                                                                                    |
| ----------- | -------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Robin       | Floor-map first, horizontal week strip above it           | Guided first booking; favourite desks prompted | Fully-booked day handled on the map (everything greyed), weak in a list  | The **week strip** as the primary date control, and **favourite desks** as a repeat-booking shortcut (A-2) | Map as the _only_ way to pick a desk — breaks **flexibility and efficiency of use** for keyboard and screen-reader users, and collapses under 360px. We have no map and should not fake one.                        |
| Envoy Desks | Mobile-first list, day selector at top, bottom tab bar    | Minimal; assumes the list is self-evident      | Clear "no desks available" message for a full day                         | **One-tap book from the list row** — no separate detail screen between choosing and booking               | Cancellation reachable only inside a booking detail view — breaks **user control and freedom**, and directly contradicts A-7.                                                                                       |
| Deskbird    | Week calendar with colleague presence overlaid            | Nudges you to follow teammates                 | Reasonable; distinguishes "nothing booked" from "nothing available"       | Making **who else is in** visible — the highest-value signal in the category, and the one A-5 is about     | Presence visible by default with no consent step — a privacy default users never chose. If BRD-001 ever adds occupant names, it must be opt-in.                                                                     |
| Condeco     | Enterprise; filter panel first, desks and rooms together  | Heavy, admin-led                               | Lands on an _empty_ result set until filters are set                      | The **admin inventory view**: a status chip per desk, and a refusal that explains itself                  | A first screen that shows nothing until you configure it — breaks **recognition rather than recall** and **aesthetic and minimalist design**. Our booking screen must arrive with a sensible date already chosen.   |
| OfficeSpace | Sidebar-led admin, employee booking secondary             | Admin-centric                                  | Strong on inventory conflicts                                             | **Blocked deactivation that states the consequence** (aligns exactly with BR-001.9) and a **persistent sidebar** for multi-job admin work | Employee experience treated as an afterthought of the facilities tool — for us the employee path is the high-frequency one.                                                          |

**Heuristic violations worth naming as requirements nobody wrote down** (Nielsen's ten): _visibility of system status_ — a booking that succeeds with no on-screen confirmation, only an email; _error prevention_ — offering a date or desk the rules will then reject; _user control and freedom_ — a cancel path deeper than the book path; _help users recognise and recover from errors_ — "You can't do that" with no count, no cause, and no next step.

### Vocabulary

`[SYNTHESISED — validate with users]`. IA labels and UI copy use the left column. §8's first question exists to correct this table.

| Users say                         | Internal term                 | UI label                                                                        |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| "a desk", "a seat", "a spot"      | Desk                          | **Desk**                                                                        |
| "I'm in on Tuesday"               | Booking (date + desk + owner) | **Booking**                                                                     |
| "my usual", "A-01"                | Desk number                   | **Desk number**, rendered as `A-01`                                             |
| "the A row", "the far side"       | Desk-number prefix            | **Zone A** — _pending A-4; drop if prefixes are not real areas_                 |
| "free", "empty"                   | Available for the selected date | **Available**                                                                 |
| "taken", "someone's got it"       | Confirmed by another user     | **Taken** (with icon — never colour alone)                                      |
| "drop it", "give it up"           | Cancel booking                | **Cancel**                                                                      |
| "done", "that's been and gone"    | Completed (REQ-028)           | **Completed**                                                                   |
| "retired desk", "that one's gone" | Inactive desk                 | **Inactive**                                                                    |
| "switch someone off", "revoke"    | Deactivated user              | **Deactivated**                                                                 |
| "reset their password"            | Admin-initiated password reset | **Reset password**                                                             |

## 3. User research

**No primary data exists.** Nothing in this section was heard from a user. Each finding is derived from a requirement or business rule in BRD-001 and carries the mandatory label.

### Source: none — synthesis from BRD-001

| Derived finding                                                                                                                                                                                        | Derived from                             | Label                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------- |
| The question an employee asks most often is _"am I booked for Thursday?"_, not _"book me a desk"_ — checking is higher-frequency than acting, because you check every day you wonder and you book once. | REQ-009 exists as its own requirement    | `[SYNTHESISED — validate with users]` |
| Booking is a short task done in a gap between other things, on a phone.                                                                                                                                 | NFR-004 (360px is a required viewport)   | `[SYNTHESISED — validate with users]` |
| The rules say _no_ in at least five ways (weekend, outside 30 days, desk taken, desk inactive, already booked that day). Every one is a chance to be refused after committing.                           | BR-001.1, .3, .6, .7, V-02–V-05          | `[SYNTHESISED — validate with users]` |
| Changing your mind about a desk is a two-step chore by design: cancel, then book again.                                                                                                                 | BR-001.2 (cancel-then-book, deliberate)  | `[SYNTHESISED — validate with users]` |
| An administrator's destructive actions displace named people — a desk deactivation collides with real reservations, a role change can lock the company out.                                              | BR-001.9, BR-001.11                      | `[SYNTHESISED — validate with users]` |
| Push notifications will silently fail for some users: off by default, and the browser may deny or not support them.                                                                                      | REQ-026, NFR-006, RISK-007               | `[SYNTHESISED — validate with users]` |
| A new employee's first contact with the product is a password somebody else chose and read out to them.                                                                                                  | REQ-018, REQ-021, BR-001.12              | `[SYNTHESISED — validate with users]` |

### Heuristic pass of the current product

Not applicable — there is no existing product to review. What people do _today_ is unknown; §5's journey is inference, and question 2 in §8 is the one that replaces it with fact.

## 4. Personas

Two, matching BRD-001's two actors. Both `[SYNTHESISED — validate with users]`: composite figures written to make design arguments concrete, not people anyone met. Screen specs cite them by ID.

### P-1 Priya — hybrid employee

`[SYNTHESISED — validate with users]`

- **Context:** In the office 2–3 days a week, which days shift with meetings and childcare. Books on her phone, usually the evening before or on the way in. Has never read a manual for an internal tool and won't.
- **Primary job:** _When I know I'm coming in, I want a desk secured in under a minute, so that I don't arrive and find nowhere to sit._
- **Pain today:** Unknown — no research. Inferred: no reliable way to know whether the office will be full, so either she gambles or she asks someone.
- **Drives:** REQ-002, REQ-003, REQ-006, REQ-007, REQ-008, REQ-009, REQ-010, REQ-026, REQ-027, REQ-028

### P-2 Marcus — office administrator

`[SYNTHESISED — validate with users]`

- **Context:** Runs the office alongside reception and facilities. At a desktop, dips into this tool a few times a week and after any staff change. Owns the consequences when a desk is retired or an account is wrong.
- **Primary job:** _When something about the office or the people in it changes, I want the booking system to reflect it without breaking someone's reservation by accident._
- **Pain today:** Unknown — no research. Inferred: keeps desk and staff lists somewhere manual, and finds out about clashes when someone complains.
- **Drives:** REQ-011 – REQ-022, REQ-028

## 5. Journey — how the job gets done today

`[SYNTHESISED — validate with users]` — **this is the weakest table in the document.** A current-state journey is precisely what you cannot infer from a requirements document, because requirements describe the future. Every Pain cell below is a guess about a workaround nobody described. Question 2 in §8 exists to replace this table wholesale.

P-1 Priya, present day, no product:

| Stage                         | User does                                          | Pain (inferred)                                                        | Opportunity                                                                |
| ----------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Decides which days to be in   | Reads her calendar, agrees days with her team      | The decision is made elsewhere; the booking tool is downstream of it   | Meet her _after_ she has decided — don't ask her to plan inside the product |
| Wonders whether there's space | Asks a colleague, or assumes                       | No trustworthy answer; the cost of being wrong is a wasted commute     | Availability for a specific day, stated plainly                            |
| Claims a seat                 | Turns up early, or leaves a jacket on a chair      | Unfair, invisible, and unenforceable                                   | A reservation with her name on it                                          |
| Remembers on the day          | Nothing to remember — no reservation exists         | n/a today; becomes a real risk once bookings exist and are forgotten   | The day-before reminder email (REQ-025) is the mitigation, already required |
| Plans change                  | Simply doesn't come in                             | Nobody learns the seat is free                                          | Cancel must be as easy as book, or the product recreates the jacket problem |

## 6. Insights

Each carries the design implication that makes it actionable. Principles cite these. All `[SYNTHESISED]` in origin — the _reasoning_ is sound against BRD-001; the _user truth_ behind each is untested.

| ID         | Insight (what we inferred)                                                                                                                                             | So the design must…                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INSIGHT-01 | Checking is more frequent than booking: "am I in on Thursday?" gets asked far more often than a desk gets reserved.                                                     | …answer the state question in zero clicks. The employee's first screen shows what they already hold, and offers booking as the action beside it.                             |
| INSIGHT-02 | Booking is a 20-second job done one-handed on a phone in a gap between other things.                                                                                    | …get from opening the app to a confirmed desk in three taps, at 360px, with no horizontal scroll and no two-handed reach.                                                     |
| INSIGHT-03 | The business rules refuse five different things, and each refusal can be discovered either before the user commits or after.                                            | …make the impossible unpickable: weekends, out-of-window dates, taken desks and inactive desks are never offered as choices that fail. The reason is shown where refused.     |
| INSIGHT-04 | A change of plan is as ordinary as a plan, and the product has no check-in — so an uncancelled booking is invisible waste nobody can detect.                             | …put cancel at the same depth as book, on the screen the employee already lands on. Never one level down.                                                                     |
| INSIGHT-05 | A desk number is meaningless to a newcomer and the whole point to a regular. 30–100 of them is too many to scan and too few to justify search.                          | …group desks by prefix into named zones, and give a returning user a route back to the desk they had last time without hunting for it.                                        |
| INSIGHT-06 | Administrative refusals are about people, not records: a blocked desk deactivation means somebody loses a seat; a blocked role change means the company keeps a way in.  | …state the count and the consequence in every refusal, plus the one route forward. Never "not allowed".                                                                       |
| INSIGHT-07 | Email always arrives (BR-001.13); push may never work — off by default, and the browser can deny it or not support it at all.                                            | …name email as the promise in confirmation copy, and present push as an extra whose real permission state is visible. Never imply an alert that won't come.                    |
| INSIGHT-08 | The administrator holds three separate jobs (bookings, desks, people) and visits occasionally, so muscle memory never forms.                                             | …give the admin a persistent shell that always says where they are and costs one click to switch job. No hub you must return through.                                          |
| INSIGHT-09 | The first thing a new employee is given is a password somebody else typed and read out, once, possibly over their shoulder.                                               | …treat the reset-password result as a handle-with-care moment: shown once, copyable, with the exposure stated — and never assume people arrive at sign-in confident.           |

## 7. Concept validation

Nothing has been shown to anyone. Every row is `[PENDING — test before build]`, and the walkthrough for this PR says so out loud.

| Assumption | Concept to test                                                                                                                 | With                              | Result                          | Call                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A-1        | Two date controls side by side: a 7-day strip vs a full month calendar. Which do they reach for, and how far ahead do they book? | 5 employees `[PENDING]`           | `[PENDING — test before build]` | `[PENDING]`                                                                                                |
| A-2        | The booking screen with a "book A-01 again" shortcut at the top. Do they use it, and is it the desk they actually wanted?        | 5 employees `[PENDING]`           | `[PENDING — test before build]` | `[PENDING]`                                                                                                |
| A-4        | Show the desk list grouped as "Zone A / Zone B". Ask them to point at where Zone A is in the building.                          | 3 employees + 1 admin `[PENDING]` | `[PENDING — test before build]` | `[PENDING]` — **cheapest and highest-value test here; A-4 is low confidence and the desk list rests on it** |
| A-5        | The desk list showing availability only, no occupant names. Ask them to choose a desk and say aloud what they want to know.      | 5 employees `[PENDING]`           | `[PENDING — test before build]` | `[PENDING]` — a NO-GO here is a BRD change request, not a redesign                                          |
| A-9        | ~~Ask the administrator directly: do you need to book a desk for yourself?~~                                                     | — | **Answered 2026-09-07 by the PO/BA** | **NO-GO — closed.** Administrators do not book desks; the requirements are correct as written |

**A measurement gap worth recording:** BRD-001 has no check-in or attendance concept, so the product cannot observe whether a booked desk was actually used. No-show rate — the metric a desk-booking system is usually judged on — is unmeasurable in this release. The success measures in `principles.md` are written to respect that.

## 8. Interview guide `[PENDING]`

Six open questions, ordered so the cheap corrections come first. Thirty minutes with three employees and one administrator would retire A-4, A-5 and A-9 outright, and it can happen while this design is in review.

**For employees (P-1):**

1. Walk me through the last time you came into the office. When did you decide, and what did you do about a desk? _(replaces §5 with fact; corrects the Vocabulary table by listening to the words used)_
2. What do you do today when you want to know whether there'll be somewhere to sit? _(tests the inferred pain, and whether a workaround already satisfies it)_
3. Think of the last few times you were in. How far ahead did you know? _(A-1 — settles the date control)_
4. Is there a particular desk or part of the office you head for? What makes it the one? _(A-2 and A-5 together — and if the answer is "wherever my team is", A-5 becomes a BRD gap)_
5. If I said "desk A-01", where would you point? _(A-4 — settles whether zone grouping is navigation or noise)_
6. You've booked for tomorrow and your plans change at 9pm. What do you do? _(A-7 — and whether they'd expect anyone to notice)_

**For the administrator (P-2):**

1. How do you keep track of desks and who works here today? _(A-6 — reveals the tool this replaces and the volumes involved)_
2. A desk needs to come out of service next week and three people have booked it. What should happen? _(validates BR-001.9's hard block against the person who will live with it)_
3. ~~Do you need to book a desk for yourself?~~ _(A-9 — closed 2026-09-07: they do not, and that is intended)_
