# SCR-007 — Desk form (add / edit)

> Approval = Gate 1 review of this file's PR. A state is "designed" when it is numbered here, listed in the manifest, and drawn as its own frame in the design tool (`WF / SCR-### · <screen> / ST-## <state>`).

|                 |                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Serves**      | — (stories not yet drafted; the `US ↔ SCR` edge is added by `/ba` in Discovery step 3)                              |
| **Traces to**   | REQ-015, REQ-016, NFR-004, NFR-008                                                                                          |
| **Surface**     | `apps/ui` `features/admin-desks` — `/admin/desks/new` and `/admin/desks/:id/edit`                                   |
| **Persona**     | P-2 Marcus ([research](../research/BRD-001-employee-desk-booking.md))                                              |
| **Primary job** | Give a desk a number that is unique and that employees will recognise on the actual furniture                        |
| **Principle**   | PRIN-3 — a duplicate is refused by naming the desk it collides with, not by saying "already exists"                 |
| **Status**      | draft — awaiting designer review                                                                                    |

## Purpose

One field, and more failure modes than fields. Marcus adds a desk with a unique number (REQ-015) or corrects an existing one (REQ-016), and uniqueness is enforced on both paths with case-normalised comparison (BR-001.8, V-08).

Since 2026-09-07 (Joy Joshua, PO/BA) the number also has an enforced shape: **one upper-case letter, a hyphen, two digits** — `A-01` through `Z-99`, four characters exactly. Lower case is accepted as you type and normalised up, so `a-1` is not valid but `a-01` becomes `A-01`.

It is a level-2 screen rather than an inline table editor because the validation states are real and numerous: a format refusal, a duplicate refusal, and a save failure all need their own copy, and none of them fits legibly in a table cell. The format matters beyond this screen — SCR-003 groups 30–100 desks into zones by the letter, so this one field decides whether employees can navigate the office at all.

## Place in the flow

- **Reached from:** SCR-006 (**Add desk**, or **Edit** on a row)
- **Leads to:** SCR-006 (on save or cancel)

Rendered as a modal over SCR-006 at ≥768px and as a **bottom sheet** below it — a one-field form does not deserve a page of its own on a desktop, and a sheet keeps a strip of the screen it came from visible. **Corrected 2026-09-10:** this sentence said "full-screen view", which contradicted both the approved wireframe and the popup rule every other overlay in this design follows. The concern behind it — the keyboard covering the confirming action — was measured rather than assumed, and the sheet clears it. See the structural decision. It keeps a `SCR-###` because its validation states must be numbered, listed in the manifest, and drawn.

## Layout

```
┌─────────────────────────────────────────┐
│ Add desk                            ✕   │
├─────────────────────────────────────────┤
│                                         │
│  Desk number                            │
│  [ A-01                             ]   │
│  One letter, a dash, two digits — like  │  helper text states the
│  A-01. The letter groups desks into     │  rule and what it is for,
│  zones on the booking screen.           │  in that order
│  ○ Active — bookable straight away      │  add mode only; radio, not a
│  ○ Inactive — set up now, open later    │  toggle: two labelled outcomes
│                                         │
├─────────────────────────────────────────┤
│              [ Cancel ]  [ Add desk ]   │
└─────────────────────────────────────────┘
```

In edit mode the title reads **Edit desk**, the field is prefilled, the status radio is absent (activation is SCR-006's job, and putting it here would give two screens control of one attribute), and the confirming action reads **Save changes**.

The helper text states the rule and then says what the rule is *for*. An administrator told only "one letter, a dash, two digits" will comply; one told that the letter becomes a zone on the booking screen will pick the letter thoughtfully.

## States

### ST-01 Add — default

- **When** opened via **Add desk**
- **Shows** an empty **Desk number** field, focused on open, accepting at most 4 characters; the helper text stating the format and its purpose; the status choice defaulting to **Active** (a desk added to the inventory is normally one that exists and can be booked); **Add desk** enabled and **Cancel**
- **Can do** type a number, choose a status, save, cancel, press Escape

### ST-02 Edit — default

- **When** opened via **Edit** on a desk row
- **Shows** the field prefilled with the current number and fully selected, so overtyping is one action; no status choice; **Save changes** and **Cancel**. If the desk has Confirmed bookings dated today or later, a persistent inline note sits beneath the field: *"**3 people** have this desk booked. Renaming it changes what they see — they won't be told."* — the honest consequence, since no email is sent on an edit (REQ-023–REQ-025 cover bookings, not inventory)
- **Can do** change the number, save, cancel

### ST-03 Field validation error

- **When** save is attempted with the field empty, with only whitespace, or with something that is not one letter, a hyphen and two digits — all caught in the browser before any request
- **Shows** the message beneath the field, the field marked with an icon and a border change (never colour alone). Two messages, because the two mistakes need different corrections: *"Give the desk a number."* when empty, and *"Use one letter, a dash and two digits — like A-01."* when the shape is wrong. The second restates the rule rather than saying "invalid", so the correction needs no second guess. The confirming action stays enabled
- **Can do** correct and resave. Focus moves to the field

### ST-04 Duplicate desk number

- **When** the server rejects the number as already in use, compared case-normalised (BR-001.8, V-08) — so `a-01` collides with `A-01`, which the user cannot see for themselves
- **Shows** the refusal naming the collision rather than stating a rule (PRIN-3): *"**A-01** is already taken by another desk. Desk numbers have to be unique, and capitals don't make a difference — `a-01` and `A-01` count as the same."* The field keeps what was typed. The case sentence appears only when the collision was case-insensitive rather than exact, because otherwise it explains something that did not happen
- **Can do** change the number and resave

### ST-05 Saving

- **When** the save is in flight
- **Shows** the confirming action busy with its label kept; the field read-only; the dialog stays open. Double submission is prevented
- **Can do** wait. Escape suppressed while in flight

### ST-06 Saved

- **When** the desk is created or updated (REQ-015, REQ-016)
- **Shows** the form closes; SCR-006's list refreshes with the desk in place, sorted into position; a transient confirmation on that screen — *"Desk A-12 added. People can book it from today."* on add, or *"Desk number updated to A-12."* on edit. The confirmation states the effect on bookability, because that is what the change means to everyone else
- **Can do** carry on in SCR-006. Focus lands on the affected row, so on a small screen the new desk is not somewhere off-screen

### ST-07 Save failed

- **When** the request fails for a reason that is not a duplicate: server error, timeout, lost connection
- **Shows** the dialog stays open with an error region: *"We couldn't save that just now. Try again."* Everything typed is retained — a one-field form that discards its field on a network blip is gratuitous
- **Can do** retry, or cancel

## Components

| Component     | Used for                                                                    | States it appears in |
| ------------- | --------------------------------------------------------------------------- | -------------------- |
| `dialog`      | The form container — modal ≥768px, bottom sheet below                        | ST-01 – ST-07        |
| `text-field`  | **Desk number**, with label, helper text, error slot and invalid styling    | ST-01 – ST-07        |
| `radio-group` | **Active** / **Inactive** on add, each option carrying its consequence. Built as `Radio option` (selected / unselected) with the group assembled in the form card | ST-01, ST-03 – ST-05, ST-07 |
| `alert`       | `warning` for the upcoming-bookings note in edit and for the duplicate refusal; `error` for a failed save. **No `info` tone** — the palette has no info family, and both notes are cautions rather than neutral remarks. Gained an optional **Title** line so ST-04 can lead with the colliding desk number | ST-02, ST-04, ST-07  |
| `button`      | **Add desk** / **Save changes**; **Cancel**                                  | ST-01 – ST-07        |
| `spinner`     | Inline busy indicator inside the confirming action                          | ST-05                |

## Interaction and accessibility

- **Keyboard:** the field is focused on open. Tab order is field → status options (add only) → **Cancel** → confirming action. Enter saves from the field. Escape cancels, except while ST-05 is in flight. Focus is trapped in the dialog and returns to the control that opened it — **Add desk** in the header, or that row's **Edit**
- **Focus:** visible ring on every control (`--c-focus-ring`). After ST-03 or ST-04 focus returns to the field with the entry retained and selected, so a correction is one action rather than a select-all hunt
- **Non-colour signalling:** the invalid field carries an icon and its message as text as well as a border change. The duplicate refusal is an alert with an icon and the colliding desk number spelled out — a user who cannot distinguish the border colour still reads which desk is in the way
- **Announcements:** the dialog's accessible name is **Add desk** or **Edit desk A-01**, so a screen-reader user knows which desk they are editing without re-reading the field. ST-04's refusal is a live region announced once, leading with the colliding number. ST-02's upcoming-bookings note is associated with the field, so it is read as part of the control rather than as loose text nearby
- **Input hygiene:** leading and trailing whitespace is trimmed before comparison and before saving — `A-01 ` and `A-01` must not become two desks, and the user cannot see the difference. The field's autocapitalisation is off, since desk numbers are typed exactly
- **At 360px:** a bottom sheet, with the confirming action at its foot. **Measured with the keyboard raised** (2026-09-10): in a 780px viewport a 290px keyboard leaves the sheet 490px, the tallest add-mode sheet is 420px, and the confirming action's lower edge lands at 474px — clearing the keyboard by 16px, never behind it (NFR-004). The dimmed strip above the sheet shrinks to 70px with the keyboard up, which is the honest cost of the sheet over a full-screen page

## Structural decisions

| Decision                                                                                       | Rationale                                                                                                                                                                                                                                           | Alternative rejected                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Its own `SCR-###` despite being one field                                                        | Its five failure states must be numbered, manifest-listed and drawn. Buried inside SCR-006 they become states nobody counts, which is precisely what the numbering exists to prevent                                                                | An inline row editor on SCR-006. Fewer screens, and the duplicate refusal has nowhere legible to live                                                                                                       |
| Format enforced as one letter, a hyphen, two digits (`^[A-Z]-\d{2}$`)                            | Decided 2026-09-07 (Joy Joshua, PO/BA). It makes SCR-003's zone grouping reliable by construction, keeps every list and table column a predictable width, and rejects `Window seat 3` before it reaches a booking screen. Lower case is normalised up rather than refused, since BR-001.8 already compares case-insensitively | Free text with a length cap (flexible, and one oddly-named desk makes a zone meaningless); a letter with a flexible number (`A-1` beside `A-01` sorts and reads badly). The accepted cost is a ceiling of 26 zones and 99 desks per zone, and no room for a desk that does not fit the pattern |
| Duplicate refusal explains case-normalisation, but only when case caused it                       | BR-001.8 normalises case, so `a-01` colliding with `A-01` looks like a bug to the person typing. Explaining it always would explain a mechanism that did not apply                                                                                  | One generic "already exists" message. Shorter, and it leaves a case collision looking like a broken screen                                                                                                   |
| Status choice on add, absent on edit                                                              | A desk being set up before it is usable is a real case, so the choice belongs at creation. Afterwards, activation is SCR-006's row action — and BR-001.9's block belongs to that flow. Two screens controlling one attribute means two places to look | A status control in both modes. Symmetrical, and it would need BR-001.9's whole blocked-deactivation flow duplicated here                                                                                    |
| Edit warns when the desk has upcoming bookings (ST-02)                                            | Renaming a booked desk changes what an employee sees with no notification (REQ-023–REQ-025 do not cover inventory edits). A warning is the most this screen can honestly do — it cannot invent a rule or an email                                    | Silent editing (a surprise for whoever booked it); blocking the edit (a rule BRD-001 does not contain). **Open question 3 on SCR-006 owns the real decision**                                                 |
| Modal at ≥768px, **bottom sheet** below (title corrected 2026-09-10)                                                                | A one-field form as a full desktop page is a page of whitespace; a modal at 360px with the keyboard raised leaves the confirming action fighting for room                                                                                            | Full-screen at every width (wasteful on desktop); modal at every width (cramped on a phone)                                                                                                                 |
| Everything typed is retained on every failure (ST-03, ST-04, ST-07)                                | The field is short but exact, and it is often copied from a physical label. Clearing it on failure means walking back to the desk                                                                                                                    | Clearing on failure. Common, and pointless punishment for a network error                                                                                                                                     |
| A bottom sheet at 360, not a full-screen page (corrected 2026-09-10)                              | This file said full-screen; the approved wireframe drew a sheet, and `wireframe-rules.md` makes a sheet the treatment for every popup below 768 — the strip of dimmed screen above it is the only thing telling a phone user they are on top of Desks rather than inside a new page. The reason the spec had reached for full-screen was the keyboard, so that got measured instead of argued: with a 290px keyboard in a 780px viewport the confirming action lands 16px clear. The rule wins and the sentence was wrong | Full-screen at 360, as this file originally said. More room for the keyboard, and it makes this the only popup in the design that behaves differently at 360, for a problem that turns out not to exist |
| Refusals sit above the field; the persistent edit note sits below the helper (2026-09-10)          | ST-04 and ST-07 are about what was just typed, so they belong before the input a reader is about to correct — which is what the greyscale frame drew. ST-02's note is a consequence of the edit rather than a correction to it, and the helper explains the input, so the order there is field, helper, note. Splitting the field from its own helper to make room for the note read worse | One position for every alert. Tidier as a rule, and it either buries a refusal below the field or separates the field from the text explaining it |
| The duplicate refusal leads with a Title line, not one paragraph (2026-09-10)                     | PRIN-3 asks the refusal to name the colliding desk, and the a11y note asks the announcement to lead with it. A single paragraph buries the desk number mid-sentence; a headline carries it and the explanation follows. `Alert` gained an optional Title for this, defaulting off so no existing alert changed | The spec's single-paragraph copy. Faithful to the sentence as written, and the number it exists to communicate stops being the first thing read |
| No `info` alert tone was added to the palette (2026-09-10)                                        | The components table asked for `info` on ST-02's note. The palette has success, warning and danger and no info family, and this note — *three people hold this desk and will not be told* — is a caution, not a neutral remark. `warning` says the true thing and no new hue enters the palette for one note | Adding an info family. Matches the table, and it buys a whole new hue to make a warning look calmer than it is |

## Conflicts and open questions

Both rows resolved 2026-09-07. Row 1 adds a rule to BRD-001 and is listed in the PR handover for `/ba`.

| #   | Conflict / question                                                                                                                                                                                                                                                                                                                                                    | Between                          | Owner            | Status                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Is there an enforced format for a desk number?** BR-001.4 gives `A-01` as an example and BR-001.8 requires uniqueness; nothing requires a shape. But SCR-003 groups 30–100 desks into zones by the letter prefix, so free text makes that grouping unreliable — one desk typed `Window seat 3` and a zone is meaningless. Also decides the maximum length of the field. | BR-001.4 vs SCR-003's zone grouping | PO/BA (`/ba`)    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — yes: `^[A-Z]-\d{2}$`.** One upper-case letter, a hyphen, two digits. Also closes SCR-003 row 2 and fixes the field length at 4. **New rule — `/ba` must add it to BR-001.4 in BRD-001**; the accepted limits are 26 zones, 99 desks per zone, and no non-conforming desk label |
| 2   | Is there a maximum length? Unspecified. A 60-character desk number breaks the SCR-003 desk row and the SCR-005 table column.                                                                                                                                                                                                                                            | REQ-015, REQ-016 vs NFR-004      | PO/BA (`/ba`)    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — exactly 4 characters.** Settled by row 1's format. Every desk label is now the same width, which is why the SCR-003 desk row and the SCR-005 table column can be sized once and trusted                        |

## Designer handoff

Tokens: `inception/design/tokens.json` (W3C DTCG — importable into Figma via Tokens Studio, Penpot, and others). Draw one frame per `ST-##` above; the numbering is the checklist. Name each frame `WF / SCR-007 · Desk form / ST-## <state>` (`HF /` once styled) — the name is the only thing that ties a frame back to this spec. Grid, spacing, and the per-frame checklist: `inception/design/wireframe-rules.md`.

**The hi-fi frames for this screen exist.** All seven states are drawn at 360, 768 and
1280, plus one extra 360 frame with the on-screen keyboard raised, in *Employee Desk
Booking — Design System & Mockups*
(<https://www.figma.com/design/xjFVgBbMrJUl7Ys3EX3Cbn>) — **22 frames** — named
`HF / SCR-007 · Desk form / ST-## <state> · <width>`, on the pass-2b palette as Figma
variables in both themes. Every colour and every text style is a token — audited:
**0 raw paints out of 2,378, and 0 unstyled text nodes out of 825**. Neither the frames
nor the Figma file is what gets approved; this spec's PR is.

**Every frame is drawn over SCR-006**, dimmed, because that is the screen this form opens
from and a form card on an empty ground reads as a page rather than as an overlay. At 768
and 1280 the card is a centred 480px modal — the same width as every other dialog in the
file, rather than the wireframe's 520, so the chrome matches. At 360 it is a bottom sheet:
full width, bottom corners squared, a strip of the dimmed list left visible above it.

**ST-06 has no form in it.** The form has closed by then, so it is drawn as SCR-006 with
the new desk sorted into position — A-12 between A-02 and B-03, not appended — the summary
line recounted to 41 desks, and the toast naming the effect on bookability. Same treatment
SCR-005 ST-11 and SCR-010 use for a state that lands on another screen.

**The keyboard frame is the one that had to be measured, not eyeballed.** In a 780px
viewport a 290px keyboard leaves 490px; the tallest add-mode sheet is 420px; the confirming
action's lower edge lands at 474px. It clears by 16px. That is the whole reason this frame
exists, and it is why the full-screen instruction in this spec could be corrected with a
number rather than an opinion.

Built for this screen, and reusable: **`Radio option`** (selected / unselected — a radio
and not a toggle, because both outcomes are named), **`Desk form popup`** holding all six
in-form states as variants on the shared `Dialog header` and `Dialog footer`, and an
optional **Title** line on **`Alert`** so a refusal can lead with the fact. `Show title`
defaults off, so every existing alert in the file is untouched.

**Two things the frames do not draw.** ST-03 has two messages in this spec — *"Give the
desk a number."* for empty and *"Use one letter, a dash and two digits — like A-01."* for a
bad shape; the frames show the **shape** one, since the empty case is the same frame with
the message swapped and the field blank. And ST-04's case-collision sentence is shown in
full: the spec says it appears only when case actually caused the collision, so the frame
draws the case that includes it.
