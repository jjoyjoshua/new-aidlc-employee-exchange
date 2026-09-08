# SCR-005 — All bookings (admin)

> Approval = Gate 1 review of this file's PR. A state is "designed" when it is numbered here, listed in the manifest, and drawn as its own frame in the design tool (`WF / SCR-### · <screen> / ST-## <state>`).

|                 |                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Serves**      | — (stories not yet drafted; the `US ↔ SCR` edge is added by `/ba` in Discovery step 3)                                                  |
| **Traces to**   | REQ-003, REQ-011, REQ-012, REQ-013, REQ-014, REQ-024, REQ-028, NFR-001, NFR-004                                                        |
| **Surface**     | `apps/ui` `features/admin-bookings` — `/admin` for a signed-in Admin (the admin shell's home)                                           |
| **Persona**     | P-2 Marcus ([research](../research/BRD-001-employee-desk-booking.md))                                                                  |
| **Primary job** | See who has booked what, find a particular booking fast, and cancel one on an employee's behalf without touching the wrong person's day |
| **Principle**   | PRIN-1 — arrives showing today, not an empty filter panel; PRIN-2 — a booking that cannot be cancelled offers no cancel                |
| **Status**      | draft — awaiting designer review                                                                                                       |

## Purpose

Marcus's landing screen. It shows every booking across employees (REQ-011), filters by date and by status (REQ-012, REQ-013), and is where he cancels on someone's behalf (REQ-014). It is also the destination SCR-006 sends him to when a desk cannot be retired until its bookings are cleared (BR-001.9) — so this screen has to be good at answering "which bookings are on desk B-03 from today?" as well as "what's happening on Tuesday?".

## Place in the flow

- **Reached from:** SCR-001 (sign in, role = Admin), SCR-006, SCR-008 (sidebar), and SCR-006's blocked-deactivation state (ST-06 there) with a date and desk filter already applied
- **Leads to:** SCR-006 (Desks), SCR-008 (People)

Sign out (REQ-003) sits in the account menu of the admin shell and returns to SCR-001.

## Layout

Filters above a table. Desktop is a real table — Marcus is at a desktop (A-6) comparing rows, and a card list would make him scroll to compare two days. Below 1024px the same fields become stacked cards in the same order (PRIN-4).

**The table becomes cards below 1024px, not below 768px** (measured 2026-09-07 while
drawing the tablet frames). At 768px with the collapsed icon-only sidebar the content
area is 648px, and this table's own columns need more than that — so a table kept at
768 would scroll sideways, which defeats the one reason it is a table: comparing rows
at a glance (A-6). Portrait tablet therefore gets the card list; landscape tablet and
desktop, at 1024 and above, keep the table.

This table needs **793px**; at 768 it has 648.

```
┌────────────┬──────────────────────────────────────────────────────┐
│            │  All bookings                    Office time (GMT)   │
│  ● Bookings│  ┌────────────────────────────────────────────────┐  │
│    Desks   │  │ Date  [ From 7 Sep ][ To — ]  Status [ All ▾ ] │  │
│    People  │  │ Desk  [ any ▾ ]                    [ Clear ]   │  │
│            │  └────────────────────────────────────────────────┘  │
│            │  24 bookings · from Mon 7 Sep · all statuses         │
│            │  ┌──────┬────────┬──────────────┬──────────┬──────┐  │
│            │  │ Date │ Desk   │ Employee     │ Status   │      │  │
│            │  ├──────┼────────┼──────────────┼──────────┼──────┤  │
│            │  │ Mon 7│ A-01   │ Priya Raman  │ ✓ Confd  │Cancel│  │
│            │  │ Mon 7│ B-02   │ Sam Okoro    │ ✓ Confd  │Cancel│  │
│            │  │ Fri 4│ A-01   │ Priya Raman  │ ◷ Compltd│  —   │  │  past: no action,
│            │  │ Thu 3│ C-05   │ Dana Silva   │ ✕ Cancld │  —   │  │  reason on hover
│            │  └──────┴────────┴──────────────┴──────────┴──────┘  │
│  ─────────  │                          [ Show more ]              │
│  ◕ Marcus  │                                                      │
└────────────┴──────────────────────────────────────────────────────┘
```

**The count line sits between the filters and the table** and restates the active filter in words — *"24 bookings · from Mon 7 Sep · all statuses"*. An occasional administrator (A-6) returning to a screen he filtered last week needs to know what he is looking at before he trusts it, and a filter chip row alone does not read as a sentence.

Dates are office-local with the timezone stated once (NFR-001). This is the screen where a timezone slip would be most damaging: cancelling "today's" booking on the wrong side of midnight cancels the wrong day.

## States

Eleven. The cancel-on-behalf interaction accounts for five, and it is the only destructive act here.

### ST-01 Default — today onward

- **When** the screen loads with no filter chosen
- **Shows** bookings from today forward, all statuses, soonest first — PRIN-1: today's office is the question Marcus most often has. The count line states that in words. Each row carries date, desk number, employee name, a status chip (icon plus word), and a **Cancel** control where BR-001.6 permits one
- **Can do** filter by date range, status (REQ-013) or desk; cancel an eligible row; switch to Desks or People

### ST-02 Loading

- **When** bookings are being fetched, on load or after a filter change
- **Shows** the filter controls fully interactive, the count line as a skeleton, and skeleton rows at real row height. Filters stay usable during load — a second change supersedes the first rather than queueing behind it
- **Can do** change filters, navigate

### ST-03 Empty — no bookings at all

- **When** the system holds no bookings whatsoever: a new deployment, before anyone has booked
- **Shows** *"Nobody has booked a desk yet."* and, if the desk inventory is also empty, the more useful next step: *"Add desks so people can book."* linking to SCR-006. The filter controls are hidden — filtering nothing is a control that cannot succeed
- **Can do** go to Desks or People

### ST-04 Empty — nothing matches the filter

- **When** bookings exist but the active filter matches none — the common empty state, and a different one from ST-03
- **Shows** the filters retained and visible, the count line reading **0 bookings** with the filter stated in words, and *"No bookings match this filter."* plus a **Clear filters** action. Marcus must be able to see *what he asked for* to understand why he got nothing
- **Can do** adjust or clear the filter

### ST-05 Load error

- **When** the request fails or times out
- **Shows** an inline alert in place of the table — *"We couldn't load bookings."* — with **Try again**. Filters keep their values so a retry does not lose the query he built
- **Can do** retry, adjust the filter, navigate

### ST-06 Filtered

- **When** any filter is active and matched rows exist
- **Shows** the matching rows, the count line restating the filter in words, and a **Clear** action beside the filters. Arriving from SCR-006's blocked deactivation lands here with the desk and a from-today date already applied, and the count line reads that back — *"3 bookings · desk B-03 · from Mon 7 Sep · Confirmed"* — so Marcus can see he was handed exactly the list he needs to clear (BR-001.9, PRIN-3)
- **Can do** cancel eligible rows, adjust or clear the filter

### ST-07 Row not cancellable

- **When** a row's booking is past-dated, or its status is Cancelled or Completed (BR-001.6, REQ-028)
- **Shows** no **Cancel** control on that row — an em dash in the action column — with the reason available as its accessible label and tooltip: *"Past bookings can't be cancelled"* or *"Already cancelled"*. PRIN-2: a control whose only outcome is a refusal is not offered
- **Can do** nothing to that row. Every other row behaves normally

### ST-08 Cancel confirmation

- **When** **Cancel** is pressed on an eligible row
- **Shows** a modal (bottom sheet at <768px) naming the person, because this is the difference between cancelling your own booking and cancelling someone else's: *"Cancel **Priya Raman's** desk? **A-01 · Mon 7 Sep.** The desk goes back into the pool and Priya is emailed."* Actions are **Cancel this booking** and **Keep it** — never Yes/No on a screen about cancelling
- **Can do** confirm, dismiss, or press Escape. Focus is trapped and returns to the row's control on dismissal

### ST-09 Cancelling

- **When** the cancellation is in flight
- **Shows** the confirming action busy, both actions disabled, dialog open, table untouched behind it. No optimistic change — a row shown as cancelled that then fails would leave Marcus believing he had freed a desk he had not
- **Can do** wait. Escape suppressed while in flight

### ST-10 Cancel failed

- **When** the request fails, or the booking was already cancelled elsewhere (the employee got there first — REQ-010)
- **Shows** the dialog stays open with an error region inside it, and two distinct messages because the responses differ: *"We couldn't cancel that just now. Try again."* (retryable) or *"Priya has already cancelled this booking."* (not retryable — the action becomes **Close**, and the table refreshes on dismissal)
- **Can do** retry, or close and see the refreshed truth

### ST-11 Cancelled

- **When** the cancellation succeeds (REQ-014)
- **Shows** the dialog closes; the row's status chip becomes **Cancelled** and its action becomes an em dash in place — the row is *not* removed, because Marcus's next question is usually "did that work?" and a vanished row answers it ambiguously. A transient confirmation names who was told: *"A-01 released for Mon 7 Sep. Priya Raman has been emailed."* (REQ-024, PRIN-5)
- **Can do** carry on. Focus returns to the row, which still exists

## Components

| Component        | Used for                                                                                     | States it appears in                 |
| ---------------- | -------------------------------------------------------------------------------------------- | ------------------------------------ |
| `app-shell`      | Admin sidebar / bottom bar (Bookings, Desks, People), page header, account menu (REQ-003)    | ST-01 – ST-11                        |
| `filter-bar`     | Date range (REQ-012), status select (REQ-013), desk select, **Clear**                        | ST-01, ST-02, ST-04 – ST-11          |
| `result-summary` | The count line restating the active filter in words                                          | ST-01, ST-04, ST-06 – ST-11          |
| `data-table`     | Date · Desk · Employee · Status · action — stacked cards below 768px                         | ST-01, ST-06 – ST-11                 |
| `status-chip`    | Confirmed / Cancelled / Completed — icon **and** word (REQ-028)                              | ST-01, ST-06 – ST-11                 |
| `button`         | Row **Cancel**; **Clear filters**; **Try again**; **Show more**                              | ST-01 – ST-11                        |
| `empty-state`    | Two contexts, one component: nothing exists, nothing matches                                 | ST-03, ST-04                         |
| `alert`          | Load failure (`error`); in-dialog cancel failure (`error`)                                   | ST-05, ST-10                         |
| `skeleton-row`   | Loading placeholders at real row height                                                      | ST-02                                |
| `dialog`         | Cancel-on-behalf confirmation — modal ≥768px, bottom sheet below                             | ST-08 – ST-10                        |
| `toast`          | Transient confirmation naming the employee who was emailed                                   | ST-11                                |

## Interaction and accessibility

- **Keyboard:** filters first in document order, then the table. The table is a table — a screen reader announces column headers per cell, which is why this is not a list of divs. Tab reaches each row's **Cancel**; rows with no action are skipped as tab stops but still fully readable. **Show more** is the last stop
- **Focus:** visible ring on every control (`--c-focus-ring`). A filter change keeps focus on the filter, never jumping to the refreshed table. Opening the dialog traps focus; dismissal returns it to the row's control; after ST-11 focus returns to that same row, which still exists precisely so focus has somewhere to land
- **Non-colour signalling:** Confirmed, Cancelled and Completed each carry an icon **and** the word (REQ-028, and NFR-003 of the design standard). A non-cancellable row shows an em dash with a text reason, not a greyed-out button — greying is a colour signal and a disabled button invites clicking
- **Announcements:** the count line is a live region, so a filter change announces *"24 bookings, from Monday 7 September, all statuses"* — the answer before the rows. The dialog's accessible name carries the employee, desk and date, so a screen-reader user is never one keystroke from cancelling an unnamed booking. ST-10 and ST-11 are assertive
- **Table at 360px:** cards, one per booking, fields in table order (date, desk, employee, status, action). Never a horizontally scrolling table — NFR-004 requires this screen to work at 360px, and a five-column table at that width is a table nobody can read
- **Timezone:** office-local throughout, stated once in the header (NFR-001)

## Structural decisions

| Decision                                                                                       | Rationale                                                                                                                                                                                                                                                                         | Alternative rejected                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default filter is **from today, all statuses** (PRIN-1)                                          | Today's office is Marcus's most common question, and it is the only default that shows something useful without a decision. Filtering to Confirmed only would hide a cancellation he made minutes ago and make him doubt it worked                                                  | No default filter, showing all history (slow, and the interesting rows are buried); defaulting to Confirmed only (hides the evidence of his own actions)                                              |
| This is the admin landing screen, not a dashboard of counts                                       | Every admin job starts with a booking question or a change to desks/people, and the sidebar reaches those in one click (INSIGHT-08). A metrics dashboard would be a screen nobody acts on, and no requirement asks for one                                                        | An admin dashboard with tiles. More impressive, and one more hop before every real task                                                                                                               |
| A real table on desktop, cards below 768px                                                        | Marcus compares rows — same desk different days, same employee different desks — and comparison is what tables are for (A-6, desktop). At 360px five columns cannot be read, so the same fields stack in the same order (PRIN-4)                                                  | Cards at every width (destroys comparison on the screen where it matters); a horizontally scrolling table on mobile (fails NFR-004 in practice, if not on paper)                                       |
| The count line restates the filter in words                                                       | An occasional user returning to a filtered screen cannot tell an empty result from a broken screen. Stating the query in prose makes ST-04 self-explanatory and makes the hand-off from SCR-006 legible                                                                            | Filter chips alone. Compact, and they read as decoration rather than as the reason the table looks like that                                                                                            |
| Desk filter included, though REQ-012/REQ-013 only require date and status                          | BR-001.9's hard block sends Marcus here to clear the bookings on one specific desk. Without a desk filter that journey is "scan every row for B-03", which turns a designed route into a chore. **Accepted 2026-09-07 (Joy Joshua, PO/BA)**       | Date and status filters only. Requirement-exact, and it makes Path 5 in the IA unusable at 40 desks                                                                                                    |
| The cancelled row stays in place (ST-11)                                                          | Marcus's next thought is "did that work?". A row that changes to **Cancelled** in front of him answers it; a row that disappears means either success or a filter he does not understand                                                                                            | Removing the row when the filter is Confirmed-only. Logically consistent, and it turns confirmation into inference                                                                                     |
| The confirmation dialog names the employee                                                        | This is the one screen where the person losing the desk is not the person clicking. The name is the last checkpoint before someone else's day changes (INSIGHT-06)                                                                                                                 | "Cancel this booking?" with the desk and date only. One line shorter, and it makes a mis-clicked row indistinguishable from the right one                                                              |
| No bulk cancel                                                                                    | A-6 says the administrator is occasional, and BR-001.9's flow needs at most a handful of cancellations on one desk. Bulk destructive actions on other people's reservations deserve a requirement before they get a checkbox column                                                | Multi-select with a bulk action. Faster for the desk-retirement path, and one mis-click cancels ten people's days                                                                                       |
| Paged with **Show more**, not infinite scroll                                                      | Bookings accumulate without limit and this list has no upper bound. An explicit control keeps the page's end findable, which matters when the footer holds nothing but is still where a keyboard user ends up                                                                       | Infinite scroll. Smoother, and it makes "the end of the list" unreachable                                                                                                                              |

## Conflicts and open questions

All three rows resolved 2026-09-07. Row 1 widens a requirement and is listed in the PR handover for `/ba`.

| #   | Conflict / question                                                                                                                                                                                                                                                                                                        | Between                            | Owner            | Status                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The desk filter is not in REQ-012 or REQ-013, but BR-001.9's blocked-deactivation route needs it to be usable. Either the filter is accepted as within the spirit of REQ-011, or BR-001.9's flow needs its own requirement.                                                                                                  | REQ-011/012/013 vs BR-001.9        | PO/BA (`/ba`)    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — keep the filter.** BR-001.9's blocked-deactivation route is unusable without it. **`/ba` should widen REQ-011 (or REQ-012) to cover filtering by desk**, so the screen traces to a requirement rather than to this decision                                 |
| 2   | **Can an Admin book a desk for themselves?** REQ-004 gives each user exactly one role, and REQ-006–REQ-008 grant booking to an Employee. So an administrator who works hybrid has no way to reserve a seat — the admin shell has no Book screen. This may be a real gap in BRD-001 rather than a design decision.             | REQ-004 vs REQ-006, REQ-007, REQ-008 | PO/BA (`/ba`)    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — admins do not book, and that is intended.** The role exclusivity in REQ-004 stands: the administrator is not booking a hot desk. No design change, and the admin shell keeps its three items. Recorded here so the gap is not rediscovered as a bug. Research assumption A-9 is closed |
| 3   | How far back does the date filter reach, and is there a hard cap on the rows returned? REQ-011 says "all bookings" with no limit; after a year this list is thousands of rows.                                                                                                                                               | REQ-011 vs NFR-004                 | PO/BA + Architect | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — pages of 50, no date floor.** Every booking ever made stays reachable, the page stays fast, and the date filter handles anything old. An archive or retention rule was rejected for this release: it is a data-policy decision with no screen to show it. Clarifies REQ-011; no BRD change |

## Designer handoff

Tokens: `inception/design/tokens.json` (W3C DTCG — importable into Figma via Tokens Studio, Penpot, and others). Draw one frame per `ST-##` above; the numbering is the checklist. Name each frame `WF / SCR-005 · All bookings / ST-## <state>` (`HF /` once styled) — the name is the only thing that ties a frame back to this spec. Grid, spacing, and the per-frame checklist: `inception/design/wireframe-rules.md`.

Eleven states at **360px and 1280px** (NFR-004) — and this is the screen where the two widths differ most, since the table becomes cards. ST-07 is a row-level state: draw it as a close-up of two rows, one cancellable and one not, rather than a whole page. ST-08 – ST-10 are one dialog in three conditions.
