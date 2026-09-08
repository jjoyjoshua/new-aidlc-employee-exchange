# SCR-009 — User form (create / edit)

> Approval = Gate 1 review of this file's PR. A state is "designed" when it is numbered here, listed in the manifest, and drawn as its own frame in the design tool (`WF / SCR-### · <screen> / ST-## <state>`).

|                 |                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Serves**      | — (stories not yet drafted; the `US ↔ SCR` edge is added by `/ba` in Discovery step 3)                                    |
| **Traces to**   | REQ-004, REQ-018, REQ-019, REQ-022, NFR-004, NFR-008                                                                              |
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

Modal over SCR-008 at ≥768px, full-screen below. It keeps a `SCR-###` because its validation states must be numbered, listed in the manifest, and drawn.

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
│  ✓ 8 characters or more                 │  live checklist, all four
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

**The password rules are all visible from the moment the field appears.** V-12 has four separate requirements; revealing them one refusal at a time is the difference between one attempt and five.

## States

### ST-01 Create — default

- **When** opened via **Add person**
- **Shows** empty name and email fields (name focused); the email helper *"They'll sign in with this."*; role radios with **Employee** preselected and each option carrying what it means; the password field with all four policy rules listed as an unmet checklist; a **Suggest a password** control; and the delivery warning, which states both the burden and its limit — *"Give this password to them yourself — it isn't emailed. They'll be asked to change it when they first sign in."* **Add person** enabled, **Cancel** beside it
- **Can do** fill the form, generate a password, save, cancel, Escape

### ST-02 Edit — default

- **When** opened via **Edit** on a row
- **Shows** name and email prefilled; role radios on the current value; **no password field**, with one line saying where that lives instead: *"To change their password, use **Reset password** on the people list."*; **Save changes** and **Cancel**. Editing your own account additionally shows **(you)** in the title, so a role change to self is visibly a change to self
- **Can do** correct name or email, change role, save, cancel

### ST-03 Field validation error

- **When** save is attempted with a required field empty, an implausible email, or a password not meeting all four rules — caught in the browser, before any request
- **Shows** each offending field marked with an icon and a border change (never colour alone) and its message beneath; unmet password rules stay marked unmet in the checklist rather than collapsing into one generic message. The confirming action stays enabled
- **Can do** correct and resave. Focus moves to the first invalid field

### ST-04 Duplicate email

- **When** the server rejects the email as already in use (BR-001.10, V-10)
- **Shows** the refusal naming the collision (PRIN-3): *"**dana@company.com** already belongs to Dana Silva."* — and, when that account is deactivated, the sentence that saves a support conversation: *"That account is deactivated — reactivate it on the people list instead of creating a new one."* Everything typed is retained
- **Can do** change the email and resave, or cancel and go reactivate the existing account

### ST-05 Role change would remove the last admin

- **When** editing the only active Admin down to Employee (BR-001.11, V-11) — the same rule as SCR-008 ST-09, reached from the form instead of the row action
- **Shows** an in-form refusal above the actions rather than a dialog stacked on a dialog: *"**Marcus Vale** is the only active admin. Making this account an employee would leave nobody able to manage the system. Make someone else an admin first."* The role radio reverts to **Admin**; other edits on the form are preserved and still saveable
- **Can do** revert the role and save the rest, or cancel. Name and email changes are not held hostage by a rejected role change

### ST-06 Saving

- **When** the save is in flight
- **Shows** the confirming action busy with its label kept; all fields read-only; dialog open. Double submission prevented — creating a user twice would produce a duplicate-email refusal on the second attempt and a confusing pair of accounts if it did not
- **Can do** wait. Escape suppressed while in flight

### ST-07 Saved

- **When** the account is created or updated (REQ-018, REQ-019, REQ-022)
- **Shows** the form closes; SCR-008's list refreshes with the account in place; a transient confirmation on that screen. On create it repeats the outstanding task, because the account is useless until it is done: *"Dana Silva added. Give them the password you set — it hasn't been emailed, and they'll change it when they sign in."* On edit: *"Dana Silva updated."* If a role changed, the summary line's admin count updates, which is the confirmation that matters
- **Can do** carry on in SCR-008. Focus lands on the affected row

### ST-08 Save failed

- **When** the request fails for a reason that is not a duplicate or a rule refusal
- **Shows** the dialog stays open with an error region: *"We couldn't save that just now. Nothing has changed. Try again."* Everything typed is retained, password included — retyping a compliant password from memory is exactly the friction that produces a weak second attempt
- **Can do** retry, or cancel

## Components

| Component        | Used for                                                                                          | States it appears in |
| ---------------- | ------------------------------------------------------------------------------------------------- | -------------------- |
| `dialog`         | The form container — modal ≥768px, full-screen below                                              | ST-01 – ST-08        |
| `text-field`     | **Full name**, **Email** — label, helper text, error slot, invalid styling                        | ST-01 – ST-08        |
| `radio-group`    | **Role** — each option carrying what it grants (REQ-004, REQ-022)                                 | ST-01 – ST-08        |
| `password-field` | **Initial password** with show/hide — create only                                                 | ST-01, ST-03, ST-06 – ST-08 |
| `policy-checklist` | The four V-12 rules, each met or unmet, all visible from the start                              | ST-01, ST-03, ST-06 – ST-08 |
| `button`         | **Suggest a password**; **Add person** / **Save changes**; **Cancel**                             | ST-01 – ST-08        |
| `alert`          | `warning` for the delivery burden; `error` for duplicate email, last-admin refusal, save failure  | ST-01 – ST-08        |
| `spinner`        | Inline busy indicator inside the confirming action                                                | ST-06                |

## Interaction and accessibility

- **Keyboard:** name is focused on open. Tab order is name → email → role (a radio group is one tab stop, arrows move within it) → password → show/hide → **Suggest a password** → **Cancel** → confirming action. Enter saves. Escape cancels except during ST-06. Focus is trapped and returns to the control that opened the form
- **Focus:** visible ring on every control (`--c-focus-ring`). After ST-03 focus goes to the first invalid field; after ST-04 to the email field with its content selected; after ST-05 to the refusal text, since the role radio has already reverted and the message is what needs reading
- **Non-colour signalling:** every invalid field carries an icon and a text message as well as a border change. **Each password rule shows a met/unmet icon and remains readable as text** — a checklist distinguished only by green and grey ticks is a checklist a colour-blind administrator cannot use, and this one gates account creation (NFR-008)
- **Announcements:** the policy checklist is a live region that announces each rule as it is satisfied — *"A number: met"* — so a screen-reader user knows they are done without re-reading five lines. The dialog's accessible name is **Add person** or **Edit person — Dana Silva**. ST-04 and ST-05 are assertive and lead with the name they concern
- **Password handling:** show/hide defaults to hidden and does not persist. **Suggest a password** generates a compliant value, reveals it immediately (there is no point hiding a value Marcus must read aloud), and satisfies every checklist rule at once. The generated value avoids ambiguous glyphs — `1`/`l`/`I`, `0`/`O` — because it will be dictated, exactly as on SCR-008 ST-10. Autocomplete on this field is off: this is not the administrator's own credential and must never reach their password manager
- **At 360px:** full-screen, with the confirming action pinned at the bottom above the keyboard. The policy checklist stays visible while the password field is focused — a checklist scrolled behind a keyboard is a checklist that does not exist (NFR-004)

## Structural decisions

| Decision                                                                                              | Rationale                                                                                                                                                                                                                                                                                | Alternative rejected                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All four password rules shown before the first keystroke                                                | V-12 has four independent requirements. Revealing them one failure at a time turns one attempt into five, and there is no reason to keep the policy secret from the person who has to satisfy it                                                                                        | Validating on blur and reporting the first failure. Standard, and needlessly adversarial for a four-part rule                                                                                            |
| A **Suggest a password** control                                                                        | The person typing is not the person who will use it, so there is no memorability benefit — only the risk of `Password1!` on every account. A generated value satisfies V-12 in one action and produces stronger credentials                                                              | Requiring Marcus to invent one. Fewer controls, and it reliably produces the same weak password for every starter                                                                                        |
| Generated passwords avoid ambiguous glyphs                                                               | BR-001.12 and BRD-001 §10 mean it is dictated or read from a screen. `1`/`l` confusion turns one account creation into a reset (SCR-008 ST-10). Same reasoning, same constraint                                                                                                          | A full character set. Marginally stronger per character, and it fails at the one moment it is used                                                                                                       |
| No password field in edit mode                                                                           | BR-001.12 requires a reset to be shown once with an explicit warning — handling SCR-008 ST-10 already provides. A quiet password field on an edit form would bypass all of it                                                                                                            | A password field that changes it when filled. Convenient, and it makes a credential change indistinguishable from a name correction                                                                       |
| Role as radios with consequences, not a dropdown                                                          | REQ-004 has exactly two values, and REQ-022's change is a permission change. Radios show both options and what each grants without a click; a dropdown hides the alternative and its meaning                                                                                             | A select. Compact, and it makes a permission choice look like a formatting option                                                                                                                        |
| The last-admin refusal is in-form (ST-05), not a dialog                                                    | The form is already a dialog, and stacking one on another is disorienting. More importantly the other edits on the form remain valid and saveable — a rejected role change should not discard a corrected email                                                                          | A dialog matching SCR-008 ST-08. Consistent, and it either stacks dialogs or discards work                                                                                                               |
| Duplicate-email refusal names the holder, and says if it is deactivated                                    | BR-001.10 blocks the create; the useful information is *whose* address it is. A deactivated leaver returning is the common case, and reactivating beats creating a second account that BR-001.10 would refuse forever (PRIN-3)                                                           | "Email already in use." Compliant, and it sends Marcus hunting through the people list                                                                                                                    |
| The create confirmation repeats the delivery burden (ST-07)                                                | The account does not work until the starter is told the password, and it is never emailed (BR-001.12). Saying so at the moment of success is the last point where Marcus is still thinking about this person                                                                              | A plain "Person added." Cleaner, and it lets him close the form with the job half done                                                                                                                    |
| Autocomplete off on the password field                                                                     | It is a credential for somebody else. A password manager offering to save it puts another person's password in Marcus's vault                                                                                                                                                            | Default browser behaviour. One less attribute, and a credential in the wrong place                                                                                                                        |

## Conflicts and open questions

All three rows resolved 2026-09-07. Row 1 adds a requirement and a screen; rows 2 and 3 confirm existing rules.

| #   | Conflict / question                                                                                                                                                                                                                                                                                        | Between                      | Owner            | Status                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Must a new starter change the admin-set password at first sign-in? Nothing in BRD-001 requires it, so an administrator-chosen password can remain in use indefinitely — and with no self-service reset (§10), the employee cannot change it themselves even if they want to.                                | REQ-018, REQ-021 vs §10      | PO / security    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — yes, forced at first sign-in.** Otherwise whoever created the account keeps a working password for it indefinitely, including after they leave the admin role. Specified as **SCR-010**, reached from SCR-001, rather than a state on either screen. **New requirement — `/ba` must add it to BRD-001**      |
| 2   | Is an email domain restricted (company addresses only)? BR-001.10 requires uniqueness and nothing else, so `anyone@gmail.com` is a valid sign-in identity for a desk in the office.                                                                                                                          | REQ-018, BR-001.10           | PO/BA (`/ba`)    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — any valid address.** Shape is checked, domain is not, leaving room for contractors and secondees without an administrator hitting a wall. Confirms BR-001.10 as written; no BRD change                                            |
| 3   | Should the generated password be shown once and never again, like the reset on SCR-008 ST-10? Here it is visible in the form until saved, and after saving it is gone — so a Marcus who saves without noting it must immediately perform a reset.                                                            | REQ-018 vs BR-001.12         | PO / security    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — visible while the form is open, then gone.** The forced change at first sign-in (row 1) lowers the stakes: this value now survives one sign-in rather than indefinitely. An administrator who loses it before passing it on uses **Reset password** on SCR-008, which carries the shown-once handling BR-001.12 requires |

## Designer handoff

Tokens: `inception/design/tokens.json` (W3C DTCG — importable into Figma via Tokens Studio, Penpot, and others). Draw one frame per `ST-##` above; the numbering is the checklist. Name each frame `WF / SCR-009 · User form / ST-## <state>` (`HF /` once styled) — the name is the only thing that ties a frame back to this spec. Grid, spacing, and the per-frame checklist: `inception/design/wireframe-rules.md`.

Eight states. Draw the modal at **1280px** and **768px** (it is a modal at and above 768px) and the full-screen form at **360px** (NFR-004), including one 360px frame with the keyboard raised and the password checklist still visible — that constraint is why the checklist sits directly beneath the field rather than at the foot of the form. The `policy-checklist` component needs met and unmet variants that are legible without colour.
