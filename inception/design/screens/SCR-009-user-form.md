# SCR-009 — User form (create / edit)

> Approval = Gate 1 review of this file's PR. A state is "designed" when it is numbered here, listed in the manifest, and drawn as its own frame in the design tool (`WF / SCR-### · <screen> / ST-## <state>`).

|                 |                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Serves**      | — (stories not yet drafted; the `US ↔ SCR` edge is added by `/ba` in Discovery step 3)                                    |
| **Traces to**   | REQ-004, REQ-018, REQ-019, REQ-022, REQ-033, NFR-004, NFR-008                                                                              |
| **Surface**     | `apps/ui` `features/admin-users` — `/admin/people/new` and `/admin/people/:id/edit`                                       |
| **Persona**     | P-2 Marcus ([research](../research/BRD-001-employee-desk-booking.md))                                                    |
| **Primary job** | Get a new starter an account that works on their first morning — and correct details when they're wrong                    |
| **Principle**   | PRIN-3 — a duplicate email names the account it collides with; PRIN-5 — the password's delivery is stated, not assumed     |
| **Status**      | draft — awaiting designer review                                                                                         |

## Purpose

Create an account with name, email, role and an administrator-set initial password (REQ-018), or correct an existing account's name and email (REQ-019) and role (REQ-022, REQ-004). Email must be unique (BR-001.10, V-10) and the password must satisfy the agreed policy — **minimum 8 characters with an upper-case letter, a lower-case letter, a digit and a special character** (V-12, decided by PO/security 2026-08-21).

Passwords are never emailed (BR-001.12), so what Marcus types here is what a new starter will be told out loud on their first morning. Since 2026-09-07 (Joy Joshua, PO/BA) it is explicitly **temporary**: the starter must replace it at first sign-in (SCR-010), so the administrator stops holding a working credential the moment it is used. The form's job is to make both facts obvious while he is typing, not afterwards.

## Place in the flow

- **Reached from:** SCR-008 (**Add person**, or **Edit** on a row)
- **Leads to:** SCR-008 (on save or cancel)

Modal over SCR-008 at ≥768px, **full-screen below** — and that is a deliberate exception to
[`wireframe-rules`](../wireframe-rules.md), which makes every popup below 768 a bottom
sheet and to which SCR-007 was *corrected* on 2026-09-10. The rule states how such a clash
is settled — draw the rule, measure the spec's worry, write the number down — so it was
measured, and here the measurement forecloses the sheet.

**Measured on the built form, 2026-09-10: it is 936px tall at 360** — a 788px body between
a 76px header and a 72px footer. (The estimate here said ~790px before the frames existed;
that was the body alone, with the header and footer left out.) At 480 it is 868px. A phone
viewport is **780px**. A sheet has to leave a strip of dimmed screen above it — that strip
is the only thing telling a phone user they are on top of People rather than inside a new
page — and there is no height at which this form leaves one. With the keyboard raised there
are **490px**, so a sheet would scroll a 936px form through a ~200px window.

Full-screen instead, with the confirming action **pinned**. That yields a visible band of
**342px** with the keyboard up (780 − 76 header − 290 keyboard − 72 pinned footer), and the
password field plus its five-row checklist need **192px** — so the checklist stays visible
while the field is focused, which is the accessibility promise this screen makes, with
150px to spare. Decided 2026-09-10 by the designer, and the keyboard frame confirms it: at
that scroll position the password input **and** all five checklist rows are visible together,
along with **Suggest a password** and the delivery warning, above a pinned footer.

**The same treatment turned out to be necessary at 1280, which this spec did not anticipate.**
Found 2026-09-10 while building the frames. A desktop frame is 900px tall, and **six of the
eight form states are taller than it**: ST-01 868, ST-03 952, ST-04 1044, ST-06 864, ST-08 952
and ST-09 864. Only ST-02 (552) and ST-05 (696) fit. So the modal is capped at the viewport
less a 24px margin top and bottom — **852px at 1280, 976px at 768** — and its body scrolls
between a pinned header and a pinned footer, exactly as the phone does. At 768 only ST-04
exceeds the cap.

That is a real consequence of the form's content rather than a styling choice: V-12 needs
five visible rules, REQ-004 needs the role choice with its consequences, and BR-001.12 needs
the delivery warning before saving. **It is worth the designer's eye** — dropping the
checklist to two columns at ≥768 would save ~72px and moving the delivery warning into the
success toast another ~90px, which together would bring the create form under 900 and stop
the desktop modal scrolling at all. Neither was done here, because both change what the spec
says is on the screen rather than how it looks.

**The cost, stated:** the two admin forms differ at 360 — Desk form is a sheet, this one is
full-screen. That is a consequence of one being four fields and the other being nine
elements including a five-row live checklist, not an inconsistency anyone chose. Sizing the
sheet down would have meant moving the role choice off the create form, which removes a
decision from the moment the account is made.

It keeps a `SCR-###` because its validation states must be numbered, listed in the manifest, and drawn.

## Layout

```
┌─────────────────────────────────────────┐
│ Add person                          ✕   │
├─────────────────────────────────────────┤
│  Full name                              │
│  [                                  ]   │
│                                         │
│  Email                                  │
│  [                                  ]   │
│  They'll sign in with this.             │
│                                         │
│  Role                                   │
│  ● Employee — books a desk for          │  radios with consequences,
│    themselves                           │  not a bare dropdown
│  ○ Admin — manages bookings, desks      │
│    and people                           │
│                                         │
│  Initial password                       │
│  [                          ] [show]    │
│  ✓ 8 characters or more                 │  live checklist, all five
│  ✓ An upper-case letter                 │  rules visible from the
│  ○ A lower-case letter                  │  start — never revealed
│  ○ A number                             │  one failure at a time
│  ○ A special character                  │
│                    [ Suggest a password ]│
│                                         │
│  ⚠ Give this password to them yourself  │  the burden and its
│    — it isn't emailed. They'll be asked │  limit, both stated
│    to change it when they first sign in.│  before saving
├─────────────────────────────────────────┤
│            [ Cancel ]  [ Add person ]   │
└─────────────────────────────────────────┘
```

In edit mode: the title reads **Edit person**, name and email are prefilled, the role radios show the current role, **there is no password field** (changing a password is SCR-008's **Reset password** action, which has the shown-once handling BR-001.12 requires), and the confirming action reads **Save changes**.

**The password rules are all visible from the moment the field appears.** V-12 has five separate requirements; revealing them one refusal at a time is the difference between one attempt and six.

**Correction (2026-09-10, pre-build pass): this file said "four" rules in six places while its own layout sketch listed five and its announcement note said "five lines".** V-12 is the authority and it carries five independent conditions — *min 8 chars; upper, lower, digit, special*. Every count here is corrected, and the `Policy checklist` component built for SCR-010 already has five rows. Built as "four", one V-12 condition would have had no row and no way to be reported — the same fault SCR-010 carried and had corrected on 2026-09-10.

## States

### ST-01 Create — default

- **When** opened via **Add person**
- **Shows** empty name and email fields (name focused); the email helper *"They'll sign in with this."*; role radios with **Employee** preselected and each option carrying what it means; the password field with all five policy rules from V-12 listed as an unmet checklist — **in its pending look: a hollow `○` marker and `--c-text-muted` text, never error styling**, because nothing is wrong yet and five rules in red on an untouched form say that something is (the vocabulary SCR-010 settled); a **Suggest a password** control; and the delivery warning, which states both the burden and its limit — *"Give this password to them yourself — it isn't emailed. They'll be asked to change it when they first sign in."* **Add person** enabled, **Cancel** beside it
- **Can do** fill the form, generate a password, save, cancel, Escape
- **Note (2026-09-10, from the build):** **Email** and its helper are one group with an 8px gap, not two siblings 16px apart. On SCR-007 the helper belonged to the only field on the form and could not be misread; here, at the body's 16px rhythm, *"They'll sign in with this."* sat equidistant between **Email** and **Role** and read as belonging to neither

### ST-02 Edit — default

- **When** opened via **Edit** on a row
- **Shows** name and email prefilled; role radios on the current value; **no password field**, with one line saying where that lives instead: *"To change their password, use **Reset password** on the people list."*; **Save changes** and **Cancel**. Editing your own account additionally shows **(you)** in the title, so a role change to self is visibly a change to self
- **Can do** correct name or email, change role, save, cancel

### ST-03 Field validation error

- **When** save is attempted with a required field empty, an implausible email, or a password not meeting all five rules — caught in the browser, before any request
- **Shows** each offending field marked with an icon and a border change (never colour alone) and its message beneath; unmet password rules take the checklist's `Blocking` look rather than collapsing into one generic message — a rule that has now failed a save attempt is a different fact from a rule nobody has addressed yet, which is why `Policy rule` has both looks. The confirming action stays enabled
- **Can do** correct and resave. Focus moves to the first invalid field

### ST-04 Duplicate email

- **When** the server rejects the email as already in use (BR-001.10, V-10)
- **Shows** the refusal naming the collision (PRIN-3): *"**dana@company.com** already belongs to Dana Silva."* — and, when that account is deactivated, the sentence that saves a support conversation: *"That account is deactivated — reactivate it on the people list instead of creating a new one."* Everything typed is retained
- **Can do** change the email and resave, or cancel and go reactivate the existing account
- **Note (2026-09-10, from the build):** the email field carries its own short message, *"Already in use."*, as well as the refusal above it. That is not duplication for its own sake — `Text field` renders its message row whenever it is in an error state, so a blank message leaves an error icon sitting alone on an empty line. The field says *that* it is wrong; the alert says *whose* address it is

### ST-05 Role change would remove the last admin

- **When** editing the only active Admin down to Employee (BR-001.11, V-11) — the same rule as SCR-008 ST-09, reached from the form instead of the row action
- **Shows** an in-form refusal **directly above the role radios** rather than a dialog stacked on a dialog. Placement decided 2026-09-10 by the designer: this file said "above the actions", and SCR-007 had already settled that a refusal sits above the field it concerns, because the reader is about to correct that field. The role radio has already reverted to **Admin**, so putting the message beside it shows what reverted and why in one glance; at the foot of the form it would be a form-level objection to a field-level event. Copy: *"**Marcus Vale** is the only active admin. Making this account an employee would leave nobody able to manage the system. Make someone else an admin first."* The role radio reverts to **Admin**; other edits on the form are preserved and still saveable
- **Can do** revert the role and save the rest, or cancel. Name and email changes are not held hostage by a rejected role change

### ST-06 Saving

- **When** the save is in flight
- **Shows** the confirming action busy with its label kept; all fields read-only; dialog open. Double submission prevented — creating a user twice would produce a duplicate-email refusal on the second attempt and a confusing pair of accounts if it did not
- **Can do** wait. Escape suppressed while in flight

### ST-07 Saved

- **When** the account is created or updated (REQ-018, REQ-019, REQ-022)
- **Shows** the form closes; SCR-008's list refreshes with the account in place; a transient confirmation on that screen. On create it repeats the outstanding task, because the account is useless until it is done: *"Dana Silva added. Give them the password you set — it hasn't been emailed, and they'll change it when they sign in."* On edit: *"Dana Silva updated."* If a role changed, the summary line's admin count updates, which is the confirmation that matters
- **Can do** carry on in SCR-008. Focus lands on the affected row
- **Note:** this state has **no frame of its own on this screen** — the form is gone, so it is drawn as SCR-008 with the toast, the way SCR-007 ST-06 is drawn as SCR-006

### ST-08 Save failed

- **When** the request fails for a reason that is not a duplicate or a rule refusal
- **Shows** the dialog stays open with an error region: *"We couldn't save that just now. Nothing has changed. Try again."* Everything typed is retained, password included — retyping a compliant password from memory is exactly the friction that produces a weak second attempt
- **Can do** retry, or cancel

### ST-09 Create — all rules met

- **When** the password satisfies all five V-12 rules, whether typed or produced by **Suggest a password**. Added 2026-09-10 by the pre-build pass: the checklist's `Met` look appeared in **no numbered state** — ST-01 is everything pending and ST-03 is a rule failing — so the one screen Marcus is looking at every time he saves would not have been drawn
- **Shows** all five rules in their `Met` look, a filled marker plus full-contrast text; the confirming action enabled; and the delivery warning **unchanged**, because satisfying the policy does not lessen the burden of passing the password on. Drawn with the password **revealed**, which is the **Suggest a password** case — the spec's own rule is that there is no point hiding a value that must be read aloud. A password Marcus typed himself sits in the same state but masked, with the show control available; that differs from this frame only by the mask, so it has no frame of its own
- **Can do** save, regenerate, edit the password — any rule that stops being satisfied returns to the **pending** look, not the blocking one, since nothing has been rejected — or cancel

## Components

| Component        | Used for                                                                                          | States it appears in |
| ---------------- | ------------------------------------------------------------------------------------------------- | -------------------- |
| `dialog`         | The form container — modal ≥768px, full-screen and scrolling below. Built as **`User form popup`**, one variant per `ST-##` on the shared `Dialog header` / `Dialog footer`, the way `Desk form popup` is: three frames of one state at 360, 768 and 1280 must differ only in width, and building them as three frames lets them differ in whatever else drifted | ST-01 – ST-06, ST-08, ST-09 |
| `text-field`     | **Full name**, **Email** — label, helper text, error slot, invalid styling                        | ST-01 – ST-08        |
| `radio-group`    | **Role** — each option carrying what it grants (REQ-004, REQ-022). Two instances of the library's **`Radio option`** (`Selected` / `Unselected`), whose label is one wrapping line in the *"Employee — books a desk for themselves"* shape the component already defaults to, so no new component is needed | ST-01 – ST-06, ST-08, ST-09 |
| `password-field` | **Initial password** with show/hide — create only                                                 | ST-01, ST-03, ST-06 – ST-08 |
| `policy-checklist` | The **five** V-12 rules, all visible from the start. Three looks, per `Policy rule`: `Pending` before anything is typed (ST-01), `Blocking` on a rule that failed a save attempt (ST-03), `Met` once satisfied (ST-09) | ST-01, ST-03, ST-06 – ST-09 |
| `button`         | **Suggest a password**; **Add person** / **Save changes**; **Cancel**                             | ST-01 – ST-08        |
| `alert`          | `warning` for the delivery burden; `error` for duplicate email, last-admin refusal, save failure  | ST-01 – ST-08        |
| `spinner`        | Inline busy indicator inside the confirming action                                                | ST-06                |

## Interaction and accessibility

- **Keyboard:** name is focused on open. Tab order is name → email → role (a radio group is one tab stop, arrows move within it) → password → show/hide → **Suggest a password** → **Cancel** → confirming action. Enter saves. Escape cancels except during ST-06. Focus is trapped and returns to the control that opened the form
- **Focus:** visible ring on every control (`--c-focus-ring`). After ST-03 focus goes to the first invalid field; after ST-04 to the email field with its content selected; after ST-05 to the refusal text, since the role radio has already reverted and the message is what needs reading
- **Non-colour signalling:** every invalid field carries an icon and a text message as well as a border change. **Each password rule shows a met/unmet icon and remains readable as text** — a checklist distinguished only by green and grey ticks is a checklist a colour-blind administrator cannot use, and this one gates account creation (NFR-008)
- **Announcements:** the policy checklist is a live region that announces each rule as it is satisfied — *"A number: met"* — so a screen-reader user knows they are done without re-reading five lines. The dialog's accessible name is **Add person** or **Edit person — Dana Silva**. ST-04 and ST-05 are assertive and lead with the name they concern
- **Password handling:** show/hide defaults to hidden and does not persist. **Suggest a password** generates a compliant value, reveals it immediately (there is no point hiding a value Marcus must read aloud), and satisfies every checklist rule at once. The generated value avoids ambiguous glyphs — `1`/`l`/`I`, `0`/`O` — because it will be dictated, exactly as on SCR-008 ST-10. Autocomplete on this field is off: this is not the administrator's own credential and must never reach their password manager
- **At 360px:** full-screen and scrolling, with the confirming action pinned at the bottom above the keyboard. The policy checklist stays visible while the password field is focused — a checklist scrolled behind a keyboard is a checklist that does not exist (NFR-004). The measurement behind this, and why it is an exception to the bottom-sheet rule, is in **Place in the flow** above: a 342px visible band against the 192px the field and checklist need

## Structural decisions

| Decision                                                                                              | Rationale                                                                                                                                                                                                                                                                                | Alternative rejected                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All five password rules shown before the first keystroke                                                | V-12 has five independent requirements. Revealing them one failure at a time turns one attempt into five, and there is no reason to keep the policy secret from the person who has to satisfy it                                                                                        | Validating on blur and reporting the first failure. Standard, and needlessly adversarial for a four-part rule                                                                                            |
| A **Suggest a password** control                                                                        | The person typing is not the person who will use it, so there is no memorability benefit — only the risk of `Password1!` on every account. A generated value satisfies V-12 in one action and produces stronger credentials. Codified 2026-09-10 as **REQ-033** (Should), with **V-18** carrying the ambiguous-glyph exclusion this row and SCR-008 ST-10 both depend on                                                              | Requiring Marcus to invent one. Fewer controls, and it reliably produces the same weak password for every starter                                                                                        |
| Generated passwords avoid ambiguous glyphs                                                               | BR-001.12 and BRD-001 §10 mean it is dictated or read from a screen. `1`/`l` confusion turns one account creation into a reset (SCR-008 ST-10). Same reasoning, same constraint                                                                                                          | A full character set. Marginally stronger per character, and it fails at the one moment it is used                                                                                                       |
| No password field in edit mode                                                                           | BR-001.12 requires a reset to be shown once with an explicit warning — handling SCR-008 ST-10 already provides. A quiet password field on an edit form would bypass all of it                                                                                                            | A password field that changes it when filled. Convenient, and it makes a credential change indistinguishable from a name correction                                                                       |
| Role as radios with consequences, not a dropdown                                                          | REQ-004 has exactly two values, and REQ-022's change is a permission change. Radios show both options and what each grants without a click; a dropdown hides the alternative and its meaning                                                                                             | A select. Compact, and it makes a permission choice look like a formatting option                                                                                                                        |
| The last-admin refusal is in-form (ST-05), not a dialog                                                    | The form is already a dialog, and stacking one on another is disorienting. More importantly the other edits on the form remain valid and saveable — a rejected role change should not discard a corrected email                                                                          | A dialog matching SCR-008 ST-08. Consistent, and it either stacks dialogs or discards work                                                                                                               |
| Duplicate-email refusal names the holder, and says if it is deactivated                                    | BR-001.10 blocks the create; the useful information is *whose* address it is. A deactivated leaver returning is the common case, and reactivating beats creating a second account that BR-001.10 would refuse forever (PRIN-3)                                                           | "Email already in use." Compliant, and it sends Marcus hunting through the people list                                                                                                                    |
| The create confirmation repeats the delivery burden (ST-07)                                                | The account does not work until the starter is told the password, and it is never emailed (BR-001.12). Saying so at the moment of success is the last point where Marcus is still thinking about this person                                                                              | A plain "Person added." Cleaner, and it lets him close the form with the job half done                                                                                                                    |
| The modal is capped at the viewport and its body scrolls, at every width | Measured during the build, not planned: six of the eight states are taller than a 900px desktop frame, ST-04 by 144px. A dialog that overflows its viewport has no reachable confirming action, which is worse than one that scrolls. So header and footer pin and the body scrolls — 852px at 1280, 976px at 768, the viewport less a 24px margin — which also makes the phone treatment the same behaviour at a different size rather than a separate design | Letting the tall states overflow. Simplest, and the primary action goes off-screen. Making the dialog itself shorter by moving content out, which is a change to what the form is for and belongs to the designer and the BA, not to a styling pass |
| Full-screen at 360, against the bottom-sheet rule | Measured, not preferred. The form is ~790px in a 780px viewport, so no sheet height leaves the strip of dimmed screen that makes a sheet legible as one, and with the keyboard up a sheet would scroll 790px through ~200px. Full-screen with a pinned action leaves a 342px band for the 192px the password field and its checklist need, which is the promise this screen makes about the checklist staying visible. `wireframe-rules` asks for exactly this — draw the rule, measure the worry, write the number down — and here the number rules the sheet out | A scrolling bottom sheet, for symmetry with SCR-007 at 360. Consistent, and it breaks the checklist-visible promise. Trimming the form until a sheet fits — most plausibly moving the role choice out — which removes a permission decision from the moment the account is created and adds a step for every new admin |
| The all-met checklist is its own state (ST-09) | `Policy rule` has three looks and only two of them had states. Met is the state every successful save passes through, and the state **Suggest a password** exists to produce, so leaving it unnumbered left the happy path undrawn | Folding it into ST-01. One frame fewer, and the only frame showing the control working is the one nobody drew |
| Autocomplete off on the password field                                                                     | It is a credential for somebody else. A password manager offering to save it puts another person's password in Marcus's vault                                                                                                                                                            | Default browser behaviour. One less attribute, and a credential in the wrong place                                                                                                                        |

## Conflicts and open questions

All three rows resolved 2026-09-07. Row 1 adds a requirement and a screen; rows 2 and 3 confirm existing rules.

| #   | Conflict / question                                                                                                                                                                                                                                                                                        | Between                      | Owner            | Status                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Must a new starter change the admin-set password at first sign-in? Nothing in BRD-001 requires it, so an administrator-chosen password can remain in use indefinitely — and with no self-service reset (§10), the employee cannot change it themselves even if they want to.                                | REQ-018, REQ-021 vs §10      | PO / security    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — yes, forced at first sign-in.** Otherwise whoever created the account keeps a working password for it indefinitely, including after they leave the admin role. Specified as **SCR-010**, reached from SCR-001, rather than a state on either screen. **New requirement — `/ba` must add it to BRD-001.** **Codified 2026-09-08 as REQ-029**, with BR-001.17 and V-15      |
| 2   | Is an email domain restricted (company addresses only)? BR-001.10 requires uniqueness and nothing else, so `anyone@gmail.com` is a valid sign-in identity for a desk in the office.                                                                                                                          | REQ-018, BR-001.10           | PO/BA (`/ba`)    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — any valid address.** Shape is checked, domain is not, leaving room for contractors and secondees without an administrator hitting a wall. Confirms BR-001.10 as written; no BRD change                                            |
| 3   | Should the generated password be shown once and never again, like the reset on SCR-008 ST-10? Here it is visible in the form until saved, and after saving it is gone — so a Marcus who saves without noting it must immediately perform a reset.                                                            | REQ-018 vs BR-001.12         | PO / security    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — visible while the form is open, then gone.** The forced change at first sign-in (row 1) lowers the stakes: this value now survives one sign-in rather than indefinitely. An administrator who loses it before passing it on uses **Reset password** on SCR-008, which carries the shown-once handling BR-001.12 requires |

## Designer handoff

Tokens: `inception/design/tokens.json` (W3C DTCG — importable into Figma via Tokens Studio, Penpot, and others). Draw one frame per `ST-##` above; the numbering is the checklist. Name each frame `WF / SCR-009 · User form / ST-## <state>` (`HF /` once styled) — the name is the only thing that ties a frame back to this spec. Grid, spacing, and the per-frame checklist: `inception/design/wireframe-rules.md`.

Nine states. Draw the modal at **1280px** and **768px** (it is a modal at and above 768px) and the full-screen form at **360px** (NFR-004), including one 360px frame with the keyboard raised and the password checklist still visible — that constraint is why the checklist sits directly beneath the field rather than at the foot of the form. `Policy rule` already carries the three looks this screen needs, all legible without colour.

**ST-07 has no frame on this screen** — the form is gone by then, so it is drawn as SCR-008 with its toast, the way SCR-007 ST-06 is drawn as SCR-006. That makes **eight** states with form frames: 24 at the three widths, plus the keyboard frame.

**The hi-fi frames for this screen exist.** All eight form states are drawn at 360, 768 and
1280, plus the keyboard frame — **25 frames** — in *Employee Desk Booking — Design System &
Mockups* (<https://www.figma.com/design/xjFVgBbMrJUl7Ys3EX3Cbn>), named
`HF / SCR-009 · User form / ST-## <state> · <width>`, on the pass-2b palette as Figma
variables in both themes. Every colour and every text style is a token — audited: **0 raw
paints out of 2,546, and 0 unstyled text nodes out of 947** across 3,834 nodes — so the dark
theme is a mode switch rather than a redraw, which was rendered and checked. Neither the
frames nor the Figma file is what gets approved; this spec's PR is.

**The form is one component, `User form popup`, with one variant per state** — the same shape
as `Desk form popup`, and built by cloning its chrome so the two admin forms cannot drift
apart. Its header, body and footer are that component's; the three width frames of any state
differ only in the size of one instance, which is the point of drawing three.

**How the three widths differ, concretely.** At 1280 and 768 it is a centred 480px card on a
scrim over People, capped to the viewport less 24px top and bottom, body scrolling. At 360 the
same instance is stretched to fill a 360×780 frame with its corner radius and shadow removed —
a full-screen form has no card edge — and its body set to fill, which pins the footer and
clips the overflow. The keyboard frame is that again at 490px with the body scrolled to the
password block, under the 360×290 `On-screen keyboard` frame the convention specifies.

**Library additions: one.** `User form popup` (eight variants, a `Title` text property). Everything
else it needs already existed — `Text field`, `Password field`, `Radio option`,
`Policy checklist` with its five rows and `Policy rule`'s three looks, `Alert`, `Button`.
That is what the earlier screens' builds were for.

**Three faults found while building.**

1. **A comma in a variant name breaks the whole component set.** Figma parses a variant name
   as `Prop=Value` pairs separated by commas, so `State=ST-09 Create — password set, all rules`
   `met` became a second, malformed property: the set reported *"Component set has existing
   errors"*, refused to return its property definitions, and had silently mangled one variant's
   name to `=State=…`. ST-09 is now **Create — all rules met**, here and in the frames.
2. **An error-state field renders its message row even when the message is empty**, leaving an
   error icon alone on a blank line. ST-04 needed a short field message of its own; see the
   note on that state.
3. **The email helper had to be grouped with its field.** At the body's 16px rhythm it sat
   equidistant between two fields and belonged to neither; see the note on ST-01.

**One thing the frames prove rather than assert.** The keyboard frame is the evidence for the
promise that the checklist stays visible while the password field is focused: in the 342px
band left by the header, the keyboard and the pinned footer, the password input and all five
rules are visible together, with **Suggest a password** and the delivery warning beneath them.
