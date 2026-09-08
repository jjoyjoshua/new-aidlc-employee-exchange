# SCR-006 — Desks

> Approval = Gate 1 review of this file's PR. A state is "designed" when it is numbered here, listed in the manifest, and drawn as its own frame in the design tool (`WF / SCR-### · <screen> / ST-## <state>`).

|                 |                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Serves**      | — (stories not yet drafted; the `US ↔ SCR` edge is added by `/ba` in Discovery step 3)                                 |
| **Traces to**   | REQ-015, REQ-016, REQ-017, NFR-004, NFR-008                                                                                    |
| **Surface**     | `apps/ui` `features/admin-desks` — `/admin/desks`                                                                     |
| **Persona**     | P-2 Marcus ([research](../research/BRD-001-employee-desk-booking.md))                                                 |
| **Primary job** | Keep the bookable desk list matching the actual office — add desks, correct numbers, and retire desks safely           |
| **Principle**   | PRIN-3 — a blocked deactivation says how many people it would displace, and hands over the route through (BR-001.9)    |
| **Status**      | draft — awaiting designer review                                                                                      |

## Purpose

The desk inventory. Marcus adds a desk (REQ-015), corrects a desk number (REQ-016), and activates or deactivates desks so that inactive ones vanish from employee availability (REQ-017, BR-001.7).

The screen's defining moment is a refusal. BR-001.9 makes deactivating a desk with Confirmed bookings dated today or later a **hard block**: the system must report how many such bookings exist and must not cancel them as a side effect. That decision was taken deliberately over the cancel-them-all alternative (BRD-001 open question #6, decided 2026-09-07), and it only works if the refusal hands Marcus a way through. Otherwise he holds a broken desk he cannot retire and has to guess whose bookings are in the way.

## Place in the flow

- **Reached from:** SCR-005, SCR-008 (sidebar)
- **Leads to:** SCR-005 (Bookings — including the filtered hand-off from ST-06), SCR-007 (Desk form), SCR-008 (People)

## Layout

A single table with one status column and row-level actions. There is no filter bar: 30–100 desks fits one sorted list, and a filter over a list you can see in full is a control that only ever costs a click. Search was deliberately deferred until the office outgrows the list (decided 2026-09-07 (Joy Joshua, PO/BA)); the enforced `A-01` format means the sort is also a zone grouping, which is most of what a filter would have offered.

```
┌────────────┬──────────────────────────────────────────────────────┐
│            │  Desks                            [ + Add desk ]    │
│    Bookings│                                                      │
│  ● Desks   │  40 desks · 38 active, 2 inactive                    │
│    People  │  ┌──────────┬──────────┬───────────────┬──────────┐  │
│            │  │ Desk     │ Status   │ Booked ahead  │          │  │
│            │  ├──────────┼──────────┼───────────────┼──────────┤  │
│            │  │ A-01     │ ✓ Active │ 3 upcoming    │ Edit  ⋯  │  │
│            │  │ A-02     │ ✓ Active │ —             │ Edit  ⋯  │  │
│            │  │ B-03     │ ✓ Active │ 3 upcoming    │ Edit  ⋯  │  │  ⋯ = Deactivate
│            │  │ C-05     │ ⊘ Inactive│ —            │ Edit  ⋯  │  │  ⋯ = Activate
│            │  └──────────┴──────────┴───────────────┴──────────┘  │
│  ─────────  │                                                      │
│  ◕ Marcus  │                                                      │
└────────────┴──────────────────────────────────────────────────────┘
```

**The "Booked ahead" column is the design's answer to BR-001.9.** It shows the count of Confirmed bookings dated today or later on each desk — the exact number that will block a deactivation. Marcus can therefore see the block coming before he triggers it, rather than discovering it in an error dialog (PRIN-2 applied to an administrator). ST-06 still exists, because the count can change between the page loading and the button being pressed, but it becomes the rare case instead of the normal one.

Below 1024px each row becomes a card in the same field order (PRIN-4), with **Edit** and the overflow action as full-width controls rather than a cramped icon row.

**The table becomes cards below 1024px, not below 768px** (measured 2026-09-07 while
drawing the tablet frames). At 768px with the collapsed icon-only sidebar the content
area is 648px, and this table's own columns need more than that — so a table kept at
768 would scroll sideways, which defeats the one reason it is a table: comparing rows
at a glance (A-6). Portrait tablet therefore gets the card list; landscape tablet and
desktop, at 1024 and above, keep the table.

This table needs **672px**; at 768 it has 648.

## States

Ten. Six of them belong to deactivation, which is the only destructive act on this screen and the one BRD-001 spent an open question deciding.

### ST-01 Default

- **When** desks are loaded and at least one exists
- **Shows** a summary line — *"40 desks · 38 active, 2 inactive"* — then every desk sorted by number: desk number, a status chip reading **Active** or **Inactive** (icon plus word), the upcoming-bookings count, and row actions **Edit** plus an overflow holding **Deactivate** (or **Activate**). The **Add desk** action sits in the page header
- **Can do** add a desk (→ SCR-007), edit a desk (→ SCR-007), deactivate or activate a desk, navigate

### ST-02 Loading

- **When** the desk list is being fetched
- **Shows** the summary line as a skeleton, skeleton rows at real row height. **Add desk** is enabled — it needs no data, and the first thing a new administrator does is add a desk
- **Can do** add a desk, navigate

### ST-03 Empty — no desks yet

- **When** the office has no desks at all: first run, immediately after the seeded admin account signs in
- **Shows** a first-run empty state that says what depends on it, because this is the state that makes SCR-003 ST-05 appear for every employee: *"No desks yet. Nobody can book until you add one."* with **Add desk** as the only action. The table and its headers are not rendered — headers over nothing are furniture
- **Can do** add a desk

### ST-04 Load error

- **When** the request fails or times out
- **Shows** an inline alert in place of the table — *"We couldn't load the desk list."* — with **Try again**. **Add desk** is hidden here: adding a desk blind risks a duplicate-number collision (BR-001.8) against a list we cannot currently see
- **Can do** retry, navigate

### ST-05 Deactivate confirmation

- **When** **Deactivate** is chosen on a desk whose upcoming-booking count is zero
- **Shows** a modal (bottom sheet at <768px) stating the effect in employees' terms rather than the system's: *"Deactivate **B-07**? It disappears from everyone's booking options straight away. Past bookings on it are kept."* Actions: **Deactivate** and **Keep it active**. The reassurance about history is deliberate — "deactivate" reads as "delete" to most people, and BR-001.7 preserves the record
- **Can do** confirm, dismiss, Escape. Focus trapped, returned to the row's overflow control on dismissal

### ST-06 Deactivate blocked

- **When** the desk has one or more Confirmed bookings dated today or later — either visible in the row count beforehand, or discovered when the server refuses (BR-001.9, V-09)
- **Shows** the dialog switches to a refusal that states the cost and the route, exactly as PRIN-3 requires: *"**B-03** can't be deactivated yet. **3 people** have it booked from today onwards. Cancel those bookings first — the desk stays bookable until you do."* The primary action is **See those 3 bookings**, which goes to SCR-005 pre-filtered to this desk, from today, Confirmed (SCR-005 ST-06). The dismissal is **Close**. There is deliberately **no** "cancel them all and deactivate" action — BR-001.9 forbids the deactivate action cancelling bookings as a side effect
- **Can do** go to the filtered booking list, or close. Marcus leaves knowing the number, the reason, and his next click

### ST-07 Deactivating

- **When** a permitted deactivation is in flight
- **Shows** the confirming action busy, both actions disabled, dialog open, table untouched
- **Can do** wait. Escape suppressed while in flight

### ST-08 Deactivate failed

- **When** the request fails for a reason other than the block: server error, timeout
- **Shows** the dialog stays open with an error region: *"We couldn't deactivate B-07 just now. Try again."* — distinct from ST-06, which is a rule, not a fault
- **Can do** retry, or close

### ST-09 Deactivated

- **When** the deactivation succeeds (REQ-017)
- **Shows** the dialog closes; the row's chip becomes **Inactive** in place; the summary line updates its active/inactive counts; a transient confirmation states the consequence: *"B-07 is inactive. It's no longer bookable."* The row stays put — Marcus's next question is whether it worked, and a vanished row answers it ambiguously
- **Can do** carry on, or reactivate immediately (the overflow now offers **Activate**)

### ST-10 Activated

- **When** an inactive desk is reactivated (REQ-017)
- **Shows** no confirmation dialog beforehand — reactivating is additive, harmless and instantly reversible, so a confirmation would be ceremony (see Structural decisions). The row's chip becomes **Active**, the summary line updates, and a transient confirmation says what changed for employees: *"C-05 is active. People can book it from today."* A failure here surfaces as an inline alert with the row reverted, sharing ST-08's error region rather than needing a state of its own
- **Can do** carry on

## Components

| Component        | Used for                                                                                        | States it appears in            |
| ---------------- | ----------------------------------------------------------------------------------------------- | ------------------------------- |
| `app-shell`      | Admin sidebar / bottom bar, page header with **Add desk**, account menu                         | ST-01 – ST-10                   |
| `result-summary` | *"40 desks · 38 active, 2 inactive"*                                                            | ST-01, ST-05 – ST-10            |
| `data-table`     | Desk · Status · Booked ahead · actions — stacked cards below 768px                               | ST-01, ST-05 – ST-10            |
| `status-chip`    | **Active** / **Inactive** — icon **and** word, never colour alone                                | ST-01, ST-05 – ST-10            |
| `menu`           | Row overflow holding **Deactivate** / **Activate**                                               | ST-01, ST-09, ST-10             |
| `button`         | **Add desk**; row **Edit**; **Try again**; dialog actions                                        | ST-01 – ST-10                   |
| `empty-state`    | First-run, naming what depends on it                                                             | ST-03                           |
| `alert`          | Load failure (`error`); in-dialog failure (`error`); the blocked refusal (`warning`)             | ST-04, ST-06, ST-08, ST-10      |
| `skeleton-row`   | Loading placeholders at real row height                                                          | ST-02                           |
| `dialog`         | Deactivate confirmation and its blocked variant — modal ≥768px, bottom sheet below               | ST-05 – ST-08                   |
| `toast`          | Transient confirmations stating the effect on bookability                                        | ST-09, ST-10                    |

## Interaction and accessibility

- **Keyboard:** the table is a table, so column headers are announced per cell — "Booked ahead, 3 upcoming" is meaningless without its header. Tab reaches **Edit** then the overflow control on each row; the overflow opens with Enter and closes with Escape, returning focus to its trigger. **Add desk** is reachable from the page header before the table, so a keyboard user with 100 desks does not tab through the list to add one
- **Focus:** visible ring on every control (`--c-focus-ring`). Dialog opening traps focus; dismissal returns it to the originating overflow control. In ST-06, focus moves to the refusal text — not to **See those 3 bookings** — because the number is the point and a focused button invites Enter before reading
- **Non-colour signalling:** **Active** and **Inactive** each carry an icon **and** the word (NFR-008). The blocked refusal carries an icon and states the count in text — it is never "the amber dialog"
- **Announcements:** the summary line is a live region, so an activation or deactivation announces the new counts. ST-06's refusal is assertive and its accessible name leads with the number of affected bookings, so a screen-reader user hears the cost first. Toasts in ST-09 and ST-10 are polite live regions
- **At 360px:** rows become cards in field order (desk, status, booked ahead, actions), with **Edit** and the overflow as full-width controls. The blocked refusal is a bottom sheet, and its **See those 3 bookings** action is full-width — it is the whole purpose of the sheet (NFR-004)

## Structural decisions

| Decision                                                                                                | Rationale                                                                                                                                                                                                                                                                              | Alternative rejected                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A **Booked ahead** count on every row                                                                     | It turns BR-001.9's hard block from a surprise into information Marcus already has. The count is the exact quantity the rule tests, so showing it makes the rule legible before it is enforced (PRIN-2, PRIN-3). **Accepted 2026-09-07 (Joy Joshua, PO/BA)**                     | Status column only. Requirement-exact, and every deactivation becomes trial and error                                                                                                                                                |
| The blocked dialog offers **no** cancel-them-all action                                                    | BR-001.9 is explicit: "The system must not cancel bookings as part of the deactivate action", and the hard block was chosen over the cancelling alternative in BRD-001 open question #6. An action that batch-cancels here would reinstate the rejected design                          | A **Cancel all 3 and deactivate** button. One click instead of several, and it contradicts a decision the PO already took                                                                                                             |
| The refusal routes to SCR-005 pre-filtered by desk, from today, Confirmed                                  | A refusal that names a number but not the rows leaves Marcus scanning 24 bookings for B-03. The filter makes the hand-off exact, and it is why SCR-005 carries a desk filter at all                                                                                                     | The refusal alone. Compliant with BR-001.9, and it strands him one step short of the fix                                                                                                                                              |
| Deactivation is confirmed; activation is not                                                              | Deactivating removes a desk from everyone's options and may be blocked; activating adds one back, harms nobody, and is undone by the same control. Confirming both would train Marcus to dismiss dialogs without reading — which is what makes ST-05 and ST-06 dangerous                | Confirming both, for symmetry. Consistent, and it dulls the confirmation that matters                                                                                                                                                 |
| No delete, only deactivate                                                                                 | BRD-001 offers no delete (REQ-017 is activate/deactivate) because bookings reference desks and history must survive. The absence is deliberate, and the ST-05 copy says history is kept so nobody goes looking for a delete                                                             | A delete action for desks added by mistake. Convenient, and it breaks referential history the moment a desk has ever been booked. **A mistyped desk number is fixed by Edit (REQ-016), which is why that path exists**                |
| No filter bar, no search at this size                                                                      | 30–100 desks sorted by number is scannable, and the letter prefix already groups them visually. A filter over a fully visible list is a control that only costs a click                                                                                                                | A status filter and search from the start. Future-proof, and it clutters the screen for the office we actually have. **See open question 2 for the threshold**                                                                        |
| The deactivated row stays in place (ST-09)                                                                 | Confirmation should be visible where the action happened. A row that disappears from a list with no filter applied is unexplained                                                                                                                                                      | Moving inactive desks to a separate section. Tidier, and it hides the desk immediately after the one moment Marcus wants to see it                                                                                                     |
| Add and edit open SCR-007 rather than an inline row editor                                                  | A desk number is subject to uniqueness validation on both create and edit (BR-001.8), so the form has real failure states — duplicate, format, save failure — that an inline field cannot host legibly. Those states are numbered on SCR-007 instead of hiding inside this screen      | Inline editing in the row. Fewer screens, and five validation states crammed into a table cell                                                                                                                                        |

## Conflicts and open questions

All three rows resolved 2026-09-07. Row 3 is a clarification `/ba` should record.

| #   | Conflict / question                                                                                                                                                                                                                                                                             | Between                     | Owner            | Status                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The **Booked ahead** count is not in any requirement. It is derived from data BR-001.9 already requires the system to count, and it makes the hard block predictable — but showing per-desk booking counts on an inventory screen is a decision someone should take deliberately, not inherit from me. | BR-001.9 vs REQ-015–REQ-017 | PO/BA (`/ba`)    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — keep the count.** BR-001.9's hard block is unusable without it, and the figure is one the system must already compute to enforce the rule. No new data is stored                                                                                          |
| 2   | At what desk count does this screen need search or filtering? The design assumes 30–100 (confirmed with the designer, 2026-09-07) and no search. Above roughly 100 the flat list stops working.                                                                                                    | A-4's context vs NFR-004    | designer         | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — no search for now.** 30–100 desks sorted by number is scannable, and a filter over a fully visible list only costs a click. Revisit past roughly 100 desks; adding it then is a `filter-bar` above the table with no state changes                                                                  |
| 3   | Can a desk's number be edited while it has upcoming bookings? REQ-016 permits editing "subject to uniqueness validation" and says nothing about bookings. An employee holding a booking for A-01 that silently becomes A-99 arrives at a desk that no longer exists by that name — and no email is sent for an edit. | REQ-016 vs REQ-023–REQ-025  | PO/BA (`/ba`)    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — allowed, with a warning.** SCR-007 ST-02 states how many people hold the desk and that they will not be told, then lets the edit proceed: the common case is fixing a typo, and a hard block would leave one unfixable until next week. Emailing affected employees was rejected as a fourth transactional email. **Clarifies REQ-016 — `/ba` should record that renaming is permitted and silent**   |

## Designer handoff

Tokens: `inception/design/tokens.json` (W3C DTCG — importable into Figma via Tokens Studio, Penpot, and others). Draw one frame per `ST-##` above; the numbering is the checklist. Name each frame `WF / SCR-006 · Desks / ST-## <state>` (`HF /` once styled) — the name is the only thing that ties a frame back to this spec. Grid, spacing, and the per-frame checklist: `inception/design/wireframe-rules.md`.

Ten states at **360px, 768px and 1280px** (NFR-004). **ST-06 is the most important frame on this screen** — it is the one BRD-001 spent an open question deciding, and the count, the reason and the route out all have to fit in a bottom sheet at 360px. Draw that one first.
