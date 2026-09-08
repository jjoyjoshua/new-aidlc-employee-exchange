# SCR-002 — My bookings

> Approval = Gate 1 review of this file's PR. A state is "designed" when it is numbered here, listed in the manifest, and drawn as its own frame in the design tool (`WF / SCR-### · <screen> / ST-## <state>`).

|                 |                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Serves**      | — (stories not yet drafted; the `US ↔ SCR` edge is added by `/ba` in Discovery step 3)                                 |
| **Traces to**   | REQ-003, REQ-009, REQ-010, REQ-024, REQ-028, NFR-001, NFR-004, NFR-008                                                         |
| **Surface**     | `apps/ui` `features/bookings` — `/` for a signed-in Employee (the employee shell's home)                              |
| **Persona**     | P-1 Priya ([research](../research/BRD-001-employee-desk-booking.md))                                                  |
| **Primary job** | Know whether I have a desk on the days I'm coming in — and give one back the moment my plans change                   |
| **Principle**   | PRIN-1 — this screen exists so the most-asked question needs no clicks; PRIN-4 — cancel is thumb-reachable at 360px   |
| **Status**      | draft — awaiting designer review                                                                                      |

## Purpose

Priya's landing screen. It answers "am I booked, and when?" before offering anything to do (REQ-009), and it is the only place an employee cancels (REQ-010). Most visits end here having taken no action at all — that is the screen working, not failing.

Cancellation lives on this screen rather than behind a booking detail view on purpose: BR-001.2 makes changing desks a cancel-then-book errand, and INSIGHT-04 says a change of plan is as ordinary as a plan. A cancel one level down is a cancel that doesn't happen — and with no check-in in this release, nobody would ever find out.

## Place in the flow

- **Reached from:** SCR-001 (sign in, role = Employee), SCR-003 (after booking or backing out), SCR-004 (leaving settings)
- **Leads to:** SCR-003 (Book a desk), SCR-004 (Settings, via the account menu)

Sign out (REQ-003) sits in the account menu of the shell and returns to SCR-001.

## Layout

Two stacked sections in one column: what's coming, then what's been. The upcoming section dominates — larger rows, more emphasis; history is present but quiet (A-8, and if that assumption fails, the fix is to promote this section, not to redraw the screen).

The shell is the persistent sidebar / bottom-bar described in [`../ia.md`](../ia.md). At ≥1024px it is a sidebar in columns 1–2 with content in 3–12; below 768px it is a two-item bottom bar (**Bookings**, **Book**) with the avatar top-right.

```
┌────────────┬──────────────────────────────────────────┐
│            │  My bookings                             │  page header
│  ● Bookings│  ┌────────────────────────────────────┐  │
│    Book    │  │ TODAY                              │  │  today's booking is
│            │  │ Desk A-01 · Mon 7 Sep              │  │  emphasised (ST-05)
│            │  │ ✓ Confirmed          [ Cancel ]    │  │
│            │  └────────────────────────────────────┘  │
│            │  Upcoming                                │
│            │  ┌────────────────────────────────────┐  │
│            │  │ Desk B-02 · Wed 9 Sep              │  │
│            │  │ ✓ Confirmed          [ Cancel ]    │  │
│            │  ├────────────────────────────────────┤  │
│            │  │ Desk A-01 · Thu 10 Sep             │  │
│            │  │ ✓ Confirmed          [ Cancel ]    │  │
│            │  └────────────────────────────────────┘  │
│            │           [  Book a desk  ]              │  primary action
│            │                                          │
│            │  Past bookings                    ⌄      │  collapsed by default
│  ─────────  │  ┌────────────────────────────────────┐  │  on mobile
│  ◕ Priya   │  │ Desk A-01 · Fri 4 Sep              │  │
│    Settings│  │ ◷ Completed                        │  │  no action offered
│    Sign out│  ├────────────────────────────────────┤  │
│            │  │ Desk C-05 · Thu 3 Sep              │  │
│            │  │ ✕ Cancelled                        │  │
│            │  └────────────────────────────────────┘  │
└────────────┴──────────────────────────────────────────┘
```

At <768px the **Book a desk** action is a fixed bottom-anchored button above the bar (PRIN-4), the rows become full-width cards, and **Past bookings** is a collapsed accordion.

Every date is rendered in office local time with the timezone stated once in the page header (NFR-001) — Priya may open this from a train in another timezone, and a booking that appears to shift by a day is the kind of bug users never report, they just stop trusting the tool.

## States

Ten states. Four of them are the cancel interaction, which is the only thing on this screen that can go wrong.

### ST-01 Default — upcoming bookings

- **When** the employee has at least one Confirmed booking dated later than today
- **Shows** the Upcoming section listing each Confirmed booking as desk number + weekday + date + a **Confirmed** status chip (icon plus word); a **Cancel** control on every row (all are today-or-later, so all are cancellable per BR-001.6); the **Book a desk** primary action; the Past bookings section, collapsed on mobile and expanded on desktop
- **Can do** cancel any row, book a desk, expand past bookings, reach Settings or sign out from the account menu

### ST-02 Loading

- **When** the screen is fetching bookings
- **Shows** the page header, and skeleton rows in the Upcoming section at the height of real rows so nothing jumps when data lands; the **Book a desk** action is present and enabled — it needs no data, and making Priya wait to reach it would be gratuitous
- **Can do** navigate, or go straight to booking

### ST-03 Empty — never booked

- **When** the employee has no bookings at all: a first sign-in, or a new starter
- **Shows** a single empty-state block: *"You haven't booked a desk yet."* with one line about what happens next (*"Pick a day and a desk — we'll email you a confirmation."* — PRIN-5 names the channel) and the **Book a desk** action as the only control. No Upcoming heading, no Past heading — headings over nothing are noise
- **Can do** book a desk

### ST-04 Nothing upcoming

- **When** the employee has past bookings but no Confirmed booking dated today or later — the state a regular is in every Friday afternoon, and therefore common, not an edge case
- **Shows** a short empty block in the Upcoming position: *"Nothing booked coming up."* plus the **Book a desk** action; the Past bookings section present and populated below it, **expanded** here rather than collapsed — it is the only content on the screen
- **Can do** book a desk, review history

### ST-05 Today's booking present

- **When** one of the employee's Confirmed bookings is dated today (office local time)
- **Shows** that booking pulled above the Upcoming list under a **TODAY** heading, with stronger emphasis: raised surface, larger desk number. It remains Confirmed and remains cancellable (BR-001.6 allows cancellation on the day), so the **Cancel** control is present. Remaining upcoming bookings continue below
- **Can do** everything ST-01 offers. The only difference is emphasis — this is the row Priya is looking for when she opens the app on her way in

### ST-06 Load error

- **When** the bookings request fails or times out
- **Shows** an inline alert in place of the list: *"We couldn't load your bookings. They're safe — this is a display problem."* with a **Try again** control. The reassurance is deliberate: a booking list that fails to render reads as a booking that vanished. The **Book a desk** action is hidden here — booking blind, without knowing what you already hold, risks walking straight into the "already booked for that date" refusal (BR-001.1)
- **Can do** retry

### ST-07 Cancel confirmation

- **When** **Cancel** is pressed on a row
- **Shows** a modal (a bottom sheet at <768px) naming exactly what will be given up — *"Cancel your desk? **A-01 · Wed 9 Sep.** The desk goes back into the pool and we'll email you a confirmation."* — with **Cancel booking** as the confirming action and **Keep it** as the dismissal. Both labels say what they do; a **Yes/No** pair over the word "cancel" is a trap in a screen about cancelling
- **Can do** confirm, dismiss, or press Escape. Focus is trapped in the dialog and returns to the originating row's control on dismissal

### ST-08 Cancelling

- **When** the cancellation is in flight
- **Shows** the dialog's confirming action in a busy state; both actions disabled; the dialog stays open. The list behind is untouched — removing the row optimistically would be a lie if ST-09 follows
- **Can do** wait. Escape is suppressed while in flight

### ST-09 Cancel failed

- **When** the cancellation request fails, or the booking was already cancelled elsewhere (an administrator cancelled it first — REQ-014)
- **Shows** the dialog remains open with an error region inside it. Two distinct messages, because the two causes need different responses: *"We couldn't cancel that just now. Try again."* (retryable) or *"That booking has already been cancelled."* (not retryable — the confirming action becomes **Close** and the list refreshes on dismissal)
- **Can do** retry, or close. Closing after an already-cancelled outcome refreshes the list so the screen stops disagreeing with reality

### ST-10 Cancelled

- **When** the cancellation succeeds
- **Shows** the dialog closes; the row leaves the Upcoming list and appears in Past bookings as **Cancelled** (icon plus word); a transient confirmation names the channel — *"Desk A-01 released for Wed 9 Sep. Cancellation emailed to priya@company.com."* (REQ-024, PRIN-5). If that was the last upcoming booking, the screen settles into ST-04
- **Can do** anything ST-01 offers. Focus moves to the confirmation message, then to the **Book a desk** action — the most likely next intent is rebooking

## Components

| Component        | Used for                                                                        | States it appears in                     |
| ---------------- | ------------------------------------------------------------------------------- | ---------------------------------------- |
| `app-shell`      | Sidebar / bottom bar, page header, account menu (Settings, Sign out — REQ-003)  | ST-01 – ST-10                            |
| `page-header`    | Title, and the office timezone stated once (NFR-001)                            | ST-01 – ST-10                            |
| `booking-row`    | Desk number, weekday + date, status chip, row action                            | ST-01, ST-04, ST-05, ST-07 – ST-10       |
| `status-chip`    | Confirmed / Completed / Cancelled — icon **and** word, never colour alone       | ST-01, ST-04, ST-05, ST-10               |
| `button`         | Primary **Book a desk**; row-level **Cancel**; **Try again**                    | ST-01 – ST-10                            |
| `empty-state`    | Two contexts, same component, different copy: never-booked, nothing-upcoming    | ST-03, ST-04                             |
| `alert`          | Load failure (`error`), in-dialog cancel failure (`error`)                      | ST-06, ST-09                             |
| `skeleton-row`   | Loading placeholder at real row height                                          | ST-02                                    |
| `dialog`         | Cancel confirmation — modal ≥768px, bottom sheet below                          | ST-07 – ST-09                            |
| `toast`          | Transient success naming the email address                                       | ST-10                                    |
| `accordion`      | Past bookings section — collapsed on mobile, expanded on desktop                | ST-01, ST-04, ST-05                      |

## Interaction and accessibility

- **Keyboard:** the list is a list, not a grid — tab reaches each row's **Cancel** in document order, then the **Book a desk** action, then the Past bookings toggle. Enter and Space both activate. Nothing here needs a pointer
- **Focus:** visible ring on every control (`--c-focus-ring`). Opening the dialog moves focus to it and traps it there; dismissing returns focus to the row's **Cancel** control; a successful cancellation moves focus to the confirmation and then to **Book a desk**, because the row that held focus no longer exists
- **Non-colour signalling:** Confirmed, Completed and Cancelled each carry an icon **and** the word (NFR-008). Today's booking is distinguished by a **TODAY** label and a raised surface, not by being a different colour. A cancelled row in history is not "the grey one" — it says Cancelled
- **Announcements:** the list announces its item count when it loads ("3 upcoming bookings"). The dialog is announced with the desk and date in its accessible name, so a screen-reader user knows which booking they are about to release without re-reading the row. Success and failure are live regions. Skeletons are hidden from assistive technology, with a single "loading your bookings" announcement instead
- **Touch:** row actions are at least 44×44px. **Cancel** sits at the row's trailing edge on desktop and on its own line at 360px — never crowded against the row's tap target for opening nothing (rows are not themselves clickable; there is no detail view to open)

## Structural decisions

| Decision                                                                                | Rationale                                                                                                                                                                                                                                                | Alternative rejected                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| This is the employee's landing screen, not the booking screen                             | INSIGHT-01 / PRIN-1: checking is more frequent than booking. Landing on a date picker would also invite a second booking on a date already held, straight into BR-001.1's refusal                                                                        | Landing on SCR-003. One tap faster to book, and it answers the frequent question with nothing                                                                                                                |
| Cancel on the row; no booking detail screen                                                | A booking has four facts (desk, date, status, owner) and they all fit on the row. A detail view would exist only to hold the cancel button — INSIGHT-04, and the Envoy pattern the competitor scan says to avoid                                          | A detail screen per booking. One more `SCR-###`, one more level between a change of plan and a released desk                                                                                                  |
| Past bookings collapsed on mobile, expanded on desktop                                     | A-8 says history is secondary, but it is not worthless — REQ-009 requires it and REQ-028's **Completed** status only ever appears here. Collapsing at 360px keeps the upcoming list above the fold; desktop has the room                                  | Omitting history (breaks REQ-009); a separate History screen (a screen for a list nobody visits); expanded everywhere (pushes upcoming off a phone screen)                                                     |
| Today's booking promoted to its own emphasised block (ST-05)                                | It is the row Priya opens the app to see on the morning commute, and it is still cancellable (BR-001.6) — so it cannot simply be styled as past. A separate heading makes it findable without reading dates                                               | Treating today as just the first upcoming row. Correct and harder to scan                                                                                                                                    |
| **Book a desk** stays available in ST-02 but is hidden in ST-06                              | Loading is a delay, so blocking the action is gratuitous. A load *failure* means we don't know what she holds, and booking blind risks a refusal she can't understand (BR-001.1)                                                                          | Keeping it in both. Consistent, and it lets her walk into an error the screen could have prevented (PRIN-2)                                                                                                  |
| No optimistic removal of the cancelled row (ST-08)                                          | An optimistic removal followed by ST-09 shows a desk released that wasn't. A cancellation is a promise to a colleague waiting for the seat; it can wait 400ms to be true                                                                                  | Optimistic UI. Feels faster, lies occasionally                                                                                                                                                                |
| Confirmation copy names the email address (ST-10)                                            | PRIN-5. The email is unconditional (BR-001.13) and is the artefact she may forward or search for later                                                                                                                                                     | A bare "Cancelled" toast. Shorter, and drops the one fact that makes the confirmation verifiable                                                                                                              |
| **Cancel booking** / **Keep it**, not Yes / No (ST-07)                                       | A confirmation dialog about cancelling, answered with Yes and No, is ambiguous exactly where it is most expensive                                                                                                                                          | Yes / No. Shorter, reliably misread                                                                                                                                                                            |

## Conflicts and open questions

| #   | Conflict / question                                                                                                                                                                                                                                            | Between                | Owner                       | Status                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | How far back does history go? REQ-009 says "past and future" with no limit. At 3 office days a week that is ~150 rows a year, and an unbounded list on a phone is a scroll with no end.                                                                          | REQ-009 vs NFR-004     | PO/BA (`/ba`)               | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — last 30 days, then Show more.** Covers "was I in last Tuesday?" without an unbounded list on the screen employees open most. Nothing is hidden, only paged. Clarifies REQ-009; no BRD change |
| 2   | When an administrator cancels Priya's booking (REQ-014), how does she learn? An email is sent (REQ-024), but if she is looking at this screen the row silently stops being true. Nothing in BRD-001 requires the screen to update.                                | REQ-014, REQ-024       | PO/BA (`/ba`)               | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — refresh on window focus.** Catches the common case (phone pocketed, tab backgrounded) with no new requirement; the cancellation email arrives regardless (REQ-024), and ST-09 covers the collision. Live push to an open screen was rejected as a disproportionate addition for a rare moment |

Both resolved 2026-09-07; neither changes BRD-001.

## Designer handoff

Tokens: `inception/design/tokens.json` (W3C DTCG — importable into Figma via Tokens Studio, Penpot, and others). Draw one frame per `ST-##` above; the numbering is the checklist. Name each frame `WF / SCR-002 · My bookings / ST-## <state>` (`HF /` once styled) — the name is the only thing that ties a frame back to this spec. Grid, spacing, and the per-frame checklist: `inception/design/wireframe-rules.md`.

Ten states at **360px, 768px and 1280px** (NFR-004). ST-07 – ST-09 are the same dialog in three conditions — draw the sheet at 360px and the modal at 1280px; the shell behind it does not need redrawing each time.
