# SCR-003 — Book a desk

> Approval = Gate 1 review of this file's PR. A state is "designed" when it is numbered here, listed in the manifest, and drawn as its own frame in the design tool (`WF / SCR-### · <screen> / ST-## <state>`).

|                 |                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Serves**      | — (stories not yet drafted; the `US ↔ SCR` edge is added by `/ba` in Discovery step 3)                                              |
| **Traces to**   | REQ-006, REQ-007, REQ-008, REQ-017, REQ-023, NFR-001, NFR-004                                                                      |
| **Surface**     | `apps/ui` `features/bookings` — `/book`, optionally `/book?date=YYYY-MM-DD` when arriving from a cancellation                       |
| **Persona**     | P-1 Priya ([research](../research/BRD-001-employee-desk-booking.md))                                                               |
| **Primary job** | Secure a specific desk for a specific working day, in under a minute, on a phone                                                   |
| **Principle**   | PRIN-2 — five business rules can refuse a booking, and none of them should refuse it *after* she commits; PRIN-1, PRIN-4, PRIN-5   |
| **Status**      | draft — awaiting designer review                                                                                                   |

## Purpose

Pick a working day inside the +30-day window (REQ-006), see which desks are free for it (REQ-007), and take one (REQ-008). Done is a Confirmed booking and an email on its way (REQ-023).

This screen carries more refusals than any other in the product. A booking can fail because the date is a weekend (BR-001.3), because it is outside the window (REQ-006, V-02), because the desk is taken (V-04), because the desk is inactive (BR-001.7), or because Priya already holds a booking that day (BR-001.1). PRIN-2 is the whole design: every one of those is visible as an unavailable option with a stated reason, not an error after she taps **Book**. Only the race in ST-09 is left to the server, because only the server can know it.

## Place in the flow

- **Reached from:** SCR-002 (**Book a desk**, or after cancelling — which hands this screen the same date, [`../ia.md`](../ia.md) Path 3)
- **Leads to:** SCR-002 (after booking, or on backing out)

## Layout

Date control on top, desk list beneath, confirm action anchored at the bottom on mobile. One column at every width — a desk list does not benefit from a second column, and PRIN-4 says desktop is the mobile layout widened, not a different composition.

```
┌────────────┬──────────────────────────────────────────┐
│            │  Book a desk            Office time (GMT)│
│    Bookings│  ┌────────────────────────────────────┐  │
│  ● Book    │  │ ‹  Mon 7  Tue 8  [Wed 9]  Thu 10 › │  │  7-day strip,
│            │  │              weekends shown        │  │  weekend chips
│            │  │              greyed + "Closed"     │  │  non-selectable
│            │  │      [ Pick another date 📅 ]      │  │  full calendar,
│            │  └────────────────────────────────────┘  │  +30d window only
│            │                                          │
│            │  12 of 40 desks free · Wed 9 Sep         │  count first
│            │                                          │
│            │  ZONE A                                  │  grouped by prefix
│            │  ┌────────────────────────────────────┐  │
│            │  │ ○ A-01   Available    ↻ your usual │  │  last-booked hint
│            │  │ ● A-02   Available                 │  │  ● = selected
│            │  │ ⊘ A-03   Taken                     │  │  icon + word
│            │  └────────────────────────────────────┘  │
│            │  ZONE B                                  │
│            │  ┌────────────────────────────────────┐  │
│            │  │ ○ B-01   Available                 │  │
│            │  │ ⊘ B-02   Taken                     │  │
│            │  └────────────────────────────────────┘  │
│  ─────────  │                                          │
│  ◕ Priya   │  ┌────────────────────────────────────┐  │
│            │  │  Book A-02 for Wed 9 Sep           │  │  states the choice,
│            │  └────────────────────────────────────┘  │  bottom-anchored
└────────────┴──────────────────────────────────────────┘
```

**At 768px the strip shows five days, not seven** (decided 2026-09-07 while drawing
the tablet frame). Seven 76px chips plus both paging arrows need exactly the width
available, which left the trailing arrow clipped against the card edge. Five days
plus two arrows fits with room, and the arrows page to the rest — the week is still
Monday to Sunday, only the window onto it is narrower.

**The date control is two controls.** A 7-day horizontal strip covers the range A-1 predicts people actually use, and a calendar behind **Pick another date** covers the rest of the 30 days without letting a rare need dictate the common layout. If A-1 fails validation, the fix is to swap their prominence — the states below do not change.

**Zones are the desk-number prefix**, grouped and labelled *Zone A*, *Zone B*. Since 2026-09-07 (Joy Joshua, PO/BA) a desk number must be one upper-case letter, a hyphen and two digits (SCR-007), so every desk carries a zone letter and the grouping cannot be broken by an oddly-named desk. What is still untested is whether those letters mean anything *physically* to employees — research assumption A-4. If they do not, the labels are merely uninformative rather than wrong, and naming real areas would need a new field on each desk.

The confirm action states the choice — *"Book A-02 for Wed 9 Sep"* — rather than saying **Book**. On a phone, the desk row that was tapped may have scrolled out of view by the time the thumb reaches the bottom.

## States

Twelve. Seven of them are refusals or failures — ST-03, ST-04, ST-05, ST-06, ST-09, ST-10 and ST-12 — which is the honest shape of this screen.

### ST-01 Default

- **When** the screen opens with no date in the URL
- **Shows** the next bookable working day preselected in the strip (today if today is a working day and within the window, otherwise the next Monday–Friday) — PRIN-1: she does not have to choose a date to see anything. Availability for that date already loaded: the free-of-total count, then desks grouped by zone, each row showing desk number plus **Available** or **Taken** with an icon. The confirm action is present but disabled, labelled *"Select a desk"*
- **Can do** change date (strip or calendar), select an available desk, scroll zones

### ST-02 Loading availability

- **When** a date has been chosen and its desks are being fetched — on open, and on every date change
- **Shows** the date strip fully interactive (changing your mind mid-load must not be blocked), the count line as a skeleton, and skeleton desk rows at real row height. The confirm action stays disabled
- **Can do** change date again — a second change supersedes the first; the earlier response is discarded rather than allowed to paint over the newer one

### ST-03 Non-bookable date shown as unavailable

- **When** the date strip or calendar renders dates that the rules forbid: Saturday and Sunday (BR-001.3), and any date beyond today + 30 days or before today (REQ-006, V-02)
- **Shows** those dates present but non-selectable, each carrying its reason as text, not just as a dimmed appearance: weekends read **Closed**, out-of-range dates read **Too far ahead** or **Past**. The calendar's navigation stops at the window's edges rather than scrolling into months where every day is refused
- **Can do** nothing to those dates — which is the point (PRIN-2). Selecting a neighbouring bookable date is one tap away

### ST-04 Fully booked

- **When** availability loads and every active desk is Taken for the selected date
- **Shows** the count as **0 of 40 desks free**, and an empty-state block replacing the zone list: *"Every desk is taken on Wed 9 Sep."* plus one line of recovery — the next two working days that have desks free, as direct selections. The confirm action is hidden, not disabled: there is nothing to enable it with
- **Can do** jump to a suggested day, or pick another date

### ST-05 No desks exist

- **When** availability loads and the office has **no Active desks at all** — the office's first day, or every desk deactivated (REQ-017)
- **Shows** a distinct empty state, because the cause and the recovery are different from ST-04: *"There are no desks set up yet. Your office admin adds desks before anyone can book."* No suggested alternative dates — every date is equally empty, and offering them would be cruel. No link into the admin area: an Employee cannot reach it (REQ-004)
- **Can do** leave. This is a dead end by construction, and it says whose job the fix is

### ST-06 Availability load error

- **When** the availability request fails or times out
- **Shows** the date control intact and an inline alert in place of the desk list: *"We couldn't load desk availability for Wed 9 Sep."* with **Try again**. Crucially the failure is scoped to the list — a working date control means she can try a different day rather than reloading the app
- **Can do** retry, or change date (which retries implicitly)

### ST-07 Desk selected

- **When** an available desk row is chosen
- **Shows** that row marked selected with an icon and the word **Selected**, not colour alone; other rows unchanged; the confirm action enabled and naming the choice — *"Book A-02 for Wed 9 Sep"*. On mobile it is bottom-anchored and within thumb reach (PRIN-4)
- **Can do** confirm, choose a different desk (selection moves — this screen books exactly one desk, REQ-008), or change date (which clears the selection, since desk availability is per-date)

### ST-08 Booking in progress

- **When** the confirm action has been pressed
- **Shows** the confirm action busy with its label kept; desk rows and the date control read-only; no layout shift. Submission is guarded against a double tap
- **Can do** wait

### ST-09 Desk taken while she looked

- **When** the server rejects the booking because that desk became Confirmed by someone else since availability loaded (V-04; RISK-004's user-visible face)
- **Shows** an alert above the list that does not blame her: *"A-02 was taken a moment ago. Here's what's still free for Wed 9 Sep."* Availability silently refreshes underneath, the selection clears, and the confirm action returns to disabled. She is one tap from a different desk on the same date, which is what she wanted
- **Can do** select another desk and confirm. **Note for the designer:** this is the state most likely to be skipped and the most likely to happen in a busy office at 9am on a Monday

### ST-10 Already booked that date

- **When** the selected date is one where the employee already holds a Confirmed booking (BR-001.1). Reached either by choosing that date, or by the server refusing on confirm if the earlier booking was made elsewhere
- **Shows** the desk list replaced by her existing booking for that date — *"You already have **A-01** booked for Wed 9 Sep."* — with the explanation the rules require and the only route through: **Cancel A-01 for this date**, then rebook (BR-001.2). The confirm action is hidden. Choosing this via the date strip shows it *before* she picks a desk, which is the whole of PRIN-2
- **Can do** cancel the existing booking (the same confirmation dialog as SCR-002 ST-07, opened here) and land back in ST-01 for the same date with desks available; or pick a different date

### ST-11 Booked

- **When** the booking succeeds (REQ-008)
- **Shows** a confirmation that names the channel — *"**A-02** booked for Wed 9 Sep. Confirmation emailed to priya@company.com."* (REQ-023, PRIN-5) — then returns to SCR-002 with the new booking visible in Upcoming. The confirmation is not a screen she has to dismiss; the destination carries it
- **Can do** proceed to SCR-002 (automatic), where the booking is now listed

### ST-12 Booking failed

- **When** the booking request fails for a reason that is not ST-09 or ST-10: server error, timeout, lost connection
- **Shows** an alert stating the uncertainty honestly rather than guessing: *"We couldn't complete that booking. Check My bookings before trying again — it may have gone through."* with **Check my bookings** as the primary route and **Try again** secondary. The desk selection is retained
- **Can do** check SCR-002, or retry. Sending her to check first prevents the double-booking refusal (BR-001.1) that a blind retry would produce

## Components

| Component        | Used for                                                                              | States it appears in               |
| ---------------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| `app-shell`      | Sidebar / bottom bar, page header with the office timezone (NFR-001)                  | ST-01 – ST-12                      |
| `date-strip`     | 7 rolling days as selectable chips; non-bookable days carry their reason               | ST-01 – ST-12                      |
| `date-picker`    | Full calendar behind **Pick another date**, clamped to today … today + 30 days         | ST-01, ST-03, ST-07                |
| `availability-count` | *"12 of 40 desks free · Wed 9 Sep"* — the answer before the list                   | ST-01, ST-04, ST-07 – ST-09        |
| `zone-group`     | Zone heading plus its desk rows (prefix-derived — subject to A-4)                     | ST-01, ST-07 – ST-09               |
| `desk-row`       | Desk number, availability with icon + word, selection state                            | ST-01, ST-07 – ST-09               |
| `status-chip`    | **Available** / **Taken** / **Selected** — icon **and** word, never colour alone      | ST-01, ST-07 – ST-09               |
| `button`         | Bottom-anchored confirm naming the choice; **Try again**; recovery actions             | ST-01 – ST-12                      |
| `empty-state`    | Three contexts, one component: fully booked, no desks exist, already booked that date   | ST-04, ST-05, ST-10                |
| `alert`          | Load failure, taken-while-you-looked, booking failure                                  | ST-06, ST-09, ST-12                |
| `skeleton-row`   | Loading placeholders at real row height                                                | ST-02                              |
| `dialog`         | Cancel confirmation reused from SCR-002, opened from ST-10                              | ST-10                              |
| `toast`           | Booking confirmation naming the email address, carried into SCR-002                    | ST-11                              |

## Interaction and accessibility

- **Keyboard:** the date strip is a single tab stop with left/right arrows moving between days — 30 chips as 30 tab stops would bury the desk list. Non-bookable days are skipped by arrow navigation but remain readable by a screen reader with their reason. The desk list is a radio group: one tab stop, arrows move selection, Space or Enter selects. Then the confirm action. Booking a desk from the keyboard is four keystrokes
- **Focus:** visible ring on every control (`--c-focus-ring`). Changing date returns focus to the date control, not to the top of the refreshed list. After ST-09's refresh, focus moves to the alert so the reason is heard before the list is re-scanned. After ST-10 opens, focus moves to the explanation, not to the cancel action — she should read why before acting
- **Non-colour signalling:** Available, Taken and Selected each carry an icon **and** the word. A weekend chip says **Closed**; an out-of-range date says **Too far ahead**. Nothing on this screen is distinguishable by colour alone (NFR-003 of the design standard) — which matters most here, where "grey means you can't have it" would otherwise carry five different meanings
- **Announcements:** the count line is a live region, so a date change announces *"12 of 40 desks free, Wednesday 9 September"* before the list is read — the answer, then the detail (PRIN-1 applied to the screen reader). Selecting a desk announces the desk number and that it is selected. ST-09 and ST-12 are assertive; ST-02's skeletons are hidden with a single "loading" announcement
- **Touch:** desk rows are full-width targets at least 44px tall — the row is the target, not a small radio circle inside it. The confirm action is bottom-anchored above the bottom bar at <768px, never a floating button that covers the last desk row
- **Timezone:** the office timezone is stated once in the page header, and every date label is office-local (NFR-001). "Today" means today in the office, not on Priya's device

## Structural decisions

| Decision                                                                                         | Rationale                                                                                                                                                                                                                                                                                    | Alternative rejected                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A date is preselected on arrival (PRIN-1)                                                          | An empty screen awaiting a date shows nothing useful, and the competitor scan names that pattern (Condeco) as breaking *recognition rather than recall*. The next working day is right most of the time and costs one tap when wrong                                                          | Requiring a date first. Defensible only if bookings were spread evenly over 30 days, which A-1 says they are not                                                                                          |
| Two date controls: 7-day strip plus a calendar behind a control                                     | A-1: the working range is days, the permitted range is 30 days. A strip serves the common case in one tap; a calendar serves the rest without a month grid dominating a phone screen                                                                                                          | A month calendar alone (heavy for "tomorrow"); a strip alone (unreachable dates that REQ-006 permits)                                                                                                      |
| Desks grouped by number prefix into zones                                                          | 30–100 desks is too many to scan flat and too few to justify search (INSIGHT-05). The prefix is the only grouping the data offers                                                                                                                                                             | One flat list (a 100-row scroll at 360px); a search field (typing a desk number you must already know); a floor map (no requirement, a much larger build, and A-4 unvalidated). **Safe as of the enforced `A-01` format (SCR-007) — every desk has a zone letter by construction** |
| Taken desks shown, not hidden                                                                       | Hiding them makes a full office look like a broken screen, and hides the count REQ-007 implies. Showing them as **Taken** with an icon keeps the zone's shape stable between dates                                                                                                            | Filtering to available only. Shorter list, and "3 desks" reads as an outage rather than a busy Tuesday                                                                                                     |
| Inactive desks hidden entirely                                                                       | BR-001.7 removes them from the bookable pool for all dates. Unlike a taken desk, an inactive one will never become available, so listing it is noise an Employee can do nothing with — and it leaks inventory state that belongs to SCR-006                                                    | Showing them as **Unavailable**. Honest about inventory, useless to Priya, and easily misread as "taken today"                                                                                             |
| Already-booked date intercepts *before* desk selection (ST-10)                                        | BR-001.1 + BR-001.2 mean the only path is cancel-then-book. Discovering that after choosing a desk wastes the choice; discovering it on date change turns a refusal into a route (PRIN-2)                                                                                                     | Rejecting on confirm with an error. Fewer states, and it wastes her effort at the last moment                                                                                                              |
| The confirm action names the desk and date                                                            | On a phone the chosen row has often scrolled away by the time the thumb reaches the button. The label is the last chance to catch a mis-tap                                                                                                                                                    | A bare **Book**. Shorter, and silent about what is about to happen                                                                                                                                          |
| ST-09 refreshes availability instead of only reporting the failure                                    | The desk is gone and no amount of retrying brings it back. The only useful response is the current picture, and she is one tap from a substitute on the date she wanted                                                                                                                        | An error with a **Try again** that repeats the same doomed request                                                                                                                                        |
| ST-12 sends her to check rather than offering only a retry                                            | A failed request with an unknown outcome is genuinely ambiguous. A blind retry either double-books (refused by BR-001.1, confusingly) or works — and we cannot tell her which. Naming the uncertainty respects it                                                                              | "Something went wrong, try again." Compact, and it hands her a plausible way to make things worse                                                                                                          |
| A "your usual" hint on the last-booked desk, but no auto-selection                                    | A-2 predicts habitual desks, and this is the cheapest possible expression of it — a label, not a feature. Auto-selecting would pre-commit her to a desk she may not want, and it is not in any requirement                                                                                    | Auto-selecting the usual desk (invents behaviour); a favourites system (a requirement nobody wrote). **Accepted 2026-09-07 (Joy Joshua, PO/BA)** — derived from her own booking history, so no new data and no new stored preference |

## Conflicts and open questions

All three rows resolved 2026-09-07. None changes BRD-001.

| #   | Conflict / question                                                                                                                                                                                                                                                                                                                          | Between                                   | Owner            | Status                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Does a Taken desk show **who** has it? A-5 suspects that "who is sitting near me" is the real decision criterion, which would make an availability-only list answer the wrong question. But no requirement grants it and it discloses colleagues' whereabouts.                                                                                | A-5 vs BRD-001 (silent) vs privacy         | PO/BA (`/ba`)    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — no names.** A taken desk reads **Taken** and nothing more; the employee view stays anonymous. Occupant names would need their own requirement and a privacy decision. **A-5 remains worth testing** (research §8, Q4): if people really choose a desk by who is near it, that is a product gap to raise, not a design fix |
| 2   | Is the desk-number prefix a real area of the office that employees recognise? The zone grouping is the only thing making 30–100 desks navigable, and BRD-001 enforces no format at all (see SCR-007 open question 1) — so prefixes may be inconsistent or absent.                                                                              | A-4 (low confidence) vs BR-001.4           | PO/BA (`/ba`)    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — group by prefix, label "Zone A".** The enforced `A-01` format guarantees the letter exists, so grouping is always consistent. Real area names ("North wing") were rejected as a scope addition — they need a new field per desk, an admin control and a requirement. Whether the letters map to recognisable places is still an open research question, not a blocker |
| 3   | ST-04 offers "the next two working days with desks free", which requires availability for dates the user has not selected. Nothing in BRD-001 provides that, and it may be a meaningful query cost.                                                                                                                                            | ST-04 recovery vs REQ-007's per-date scope | Architect        | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — keep the suggestions.** A full day should hand the employee a next step, not a dead end. **Feasibility is now an `/architect` question, not a design one**: if a multi-day availability lookahead proves expensive, ST-04 degrades to *"Try another day"* with no suggestions and no other state changes |

## Designer handoff

Tokens: `inception/design/tokens.json` (W3C DTCG — importable into Figma via Tokens Studio, Penpot, and others). Draw one frame per `ST-##` above; the numbering is the checklist. Name each frame `WF / SCR-003 · Book a desk / ST-## <state>` (`HF /` once styled) — the name is the only thing that ties a frame back to this spec. Grid, spacing, and the per-frame checklist: `inception/design/wireframe-rules.md`.

Twelve states at **360px, 768px and 1280px** (NFR-004). Draw ST-03 as a close-up of the date control in both its refusal cases — it is the one state that is about a component, not a page. ST-01 is the frame everything else varies from; get the zone grouping and the bottom-anchored confirm right there first.
