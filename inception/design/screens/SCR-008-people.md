# SCR-008 — People

> Approval = Gate 1 review of this file's PR. A state is "designed" when it is numbered here, listed in the manifest, and drawn as its own frame in the design tool (`WF / SCR-### · <screen> / ST-## <state>`).

|                 |                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Serves**      | — (stories not yet drafted; the `US ↔ SCR` edge is added by `/ba` in Discovery step 3)                                        |
| **Traces to**   | REQ-004, REQ-005, REQ-018, REQ-020, REQ-021, REQ-022, REQ-024, NFR-004                                                                         |
| **Surface**     | `apps/ui` `features/admin-users` — `/admin/people`                                                                           |
| **Persona**     | P-2 Marcus ([research](../research/BRD-001-employee-desk-booking.md))                                                        |
| **Primary job** | Keep accounts matching the people who actually work here — add starters, change roles, switch leavers off, rescue passwords    |
| **Principle**   | PRIN-3 — the last-admin safeguard and every other refusal name the consequence; PRIN-5 — a shown-once password says so plainly |
| **Status**      | draft — awaiting designer review                                                                                             |

## Purpose

The account list. Marcus creates users (REQ-018), assigns and changes roles (REQ-022, REQ-004), deactivates leavers (REQ-020, and REQ-005 stops them signing in), and resets passwords on request (REQ-021). Editing name and email happens on SCR-009 (REQ-019).

Two rules shape this screen more than the CRUD does. **BR-001.11** forbids any action that would leave zero active Admins — so a refusal has to explain the lockout it prevented, not just deny the click. **BR-001.12** requires a reset password to be displayed once to the administrator and never emailed (BRD-001 §10) — so this screen has a state that shows a credential on a monitor, in an office, with people walking past (RISK-005).

A third rule was added on 2026-09-07 (Joy Joshua, PO/BA, pending codification in BRD-001): **deactivating a user also cancels their upcoming bookings.** Access is revoked immediately — a leaver cannot wait for a desk to be freed — and the desks are released in the same act, because the person who holds them can no longer sign in to cancel them (REQ-010 requires signing in). The administrator sees the count before confirming, and each cancellation sends its usual email (REQ-024). This is deliberately the opposite shape from desk deactivation, where BR-001.9 blocks rather than cancels; the difference is that a desk can wait and a revoked account cannot.

## Place in the flow

- **Reached from:** SCR-005, SCR-006 (sidebar)
- **Leads to:** SCR-005 (Bookings), SCR-006 (Desks), SCR-009 (User form)

## Layout

A table with a search field — unlike the desk list, an office's people list grows past the point of scanning, and Marcus arrives knowing the name he wants.

```
┌────────────┬──────────────────────────────────────────────────────┐
│            │  People                          [ + Add person ]   │
│    Bookings│  ┌────────────────────────────────────────────────┐  │
│    Desks   │  │ 🔍 Search name or email                       │  │
│  ● People  │  └────────────────────────────────────────────────┘  │
│            │  38 people · 36 employees, 2 admins · 1 deactivated  │
│            │  ┌──────────────┬───────────────┬────────┬────────┐  │
│            │  │ Name         │ Email         │ Role   │ Status │  │
│            │  ├──────────────┼───────────────┼────────┼────────┤  │
│            │  │ Priya Raman  │ priya@…       │Employee│✓ Active│⋯ │
│            │  │ Marcus Vale  │ marcus@…      │Admin   │✓ Active│⋯ │  ⋯ Edit ·
│            │  │  (you)       │               │        │        │  │  Reset password ·
│            │  │ Dana Silva   │ dana@…        │Employee│⊘ Deactd│⋯ │  Deactivate
│            │  └──────────────┴───────────────┴────────┴────────┘  │
│  ─────────  │                                                      │
│  ◕ Marcus  │                                                      │
└────────────┴──────────────────────────────────────────────────────┘
```

**Marcus's own row is marked "(you)".** BR-001.11's refusal makes far more sense when the account you are about to change is visibly your own, and the most likely way to trigger the safeguard is deactivating yourself.

The summary line counts admins explicitly — *"2 admins"* — because that number is the one BR-001.11 protects. When it reads **1 admin**, Marcus can see the safeguard coming before he trips it (PRIN-2).

Below 1024px each row becomes a card in the same field order, with the row actions as full-width controls (PRIN-4).

**The table becomes cards below 1024px, not below 768px** (measured 2026-09-07 while
drawing the tablet frames). At 768px with the collapsed icon-only sidebar the content
area is 648px, and this table's own columns need more than that — so a table kept at
768 would scroll sideways, which defeats the one reason it is a table: comparing rows
at a glance (A-6). Portrait tablet therefore gets the card list; landscape tablet and
desktop, at 1024 and above, keep the table.

This table needs **854px** — the widest of the three; at 768 it has 648.

## States

Fourteen. Two rule refusals (ST-07, ST-09), one credential display, two shapes of deactivation, and a shared trio for the row actions.

### ST-01 Default

- **When** the user list is loaded
- **Shows** the summary line — *"38 people · 36 employees, 2 admins · 1 deactivated"* — then every account: name, email, role, a status chip reading **Active** or **Deactivated** (icon plus word), and an overflow menu holding **Edit**, **Reset password**, and **Deactivate** or **Activate**. The signed-in administrator's row is marked **(you)**. **Add person** sits in the page header
- **Can do** search, add a person (→ SCR-009), edit (→ SCR-009), change role, reset a password, deactivate or reactivate

### ST-02 Loading

- **When** the list is being fetched
- **Shows** the summary as a skeleton, skeleton rows at real row height; the search field disabled until there is something to search; **Add person** enabled
- **Can do** add a person, navigate

### ST-03 No match for search

- **When** the search matches no account. **This is the only empty state this screen has** — there is always at least the signed-in administrator, so a truly empty list is unreachable (see Structural decisions)
- **Shows** the search term retained and visible, *"Nobody matches "danna"."*, and two actions: **Clear search**, and **Add person** — because a search that finds nobody is very often a starter who is not in the system yet
- **Can do** clear the search, correct it, or add the person

### ST-04 Load error

- **When** the request fails or times out
- **Shows** an inline alert in place of the table — *"We couldn't load the people list."* — with **Try again**. **Add person** is hidden: creating an account blind risks a duplicate-email refusal (BR-001.10) against a list we cannot see
- **Can do** retry, navigate

### ST-05 Deactivate confirmation — no upcoming bookings

- **When** **Deactivate** is chosen on an active account that is not the last active Admin, and that person holds no Confirmed bookings dated today or later
- **Shows** a modal (bottom sheet at <768px) stating what it does and what survives: *"Deactivate **Dana Silva**? They won't be able to sign in. Their past bookings are kept."* Actions: **Deactivate** and **Keep active**. The reassurance about history matters — "deactivate" reads as "delete", and the record is preserved
- **Can do** confirm, dismiss, Escape

### ST-06 Deactivate confirmation — bookings will be cancelled

- **When** the same action on someone who **does** hold Confirmed bookings dated today or later (decided 2026-09-07 — see Purpose)
- **Shows** the count as the substance of the confirmation, not a footnote: *"Deactivate **Dana Silva**? They won't be able to sign in, and their **3 upcoming bookings will be cancelled** — A-01 on Tue 8 Sep, B-02 on Thu 10 Sep, A-01 on Mon 14 Sep. Those desks go back into the pool and Dana is emailed about each one. Past bookings are kept."* The bookings are listed, not just counted, because the administrator is releasing specific desks on specific days and may recognise one they did not expect. Actions: **Deactivate and cancel 3 bookings** — the label carries the count, so a habitual click cannot hide it — and **Keep active**
- **Can do** confirm, dismiss, Escape. There is no way to deactivate *without* cancelling: the decision made them one act, because a revoked account that still holds desks is the problem this solves

### ST-07 Deactivate blocked — last active admin

- **When** deactivating would leave zero active Admins (BR-001.11, V-11) — most often Marcus deactivating himself
- **Shows** the dialog becomes a refusal that names the consequence it prevented (PRIN-3): *"**Marcus Vale** is the only active admin. Deactivating this account would leave nobody able to manage desks, bookings or people — including nobody able to undo it. Make someone else an admin first."* Primary action **Make someone an admin**, which focuses the search field ready for a name; dismissal **Close**. No override, no "I understand the risk" — BR-001.11 is a rejection, not a warning
- **Can do** go and promote someone, or close

### ST-08 Role change confirmation

- **When** a role is changed between Employee and Admin (REQ-022, REQ-004)
- **Shows** a confirmation naming what the person gains or loses, since neither direction is cosmetic: promoting reads *"Make **Priya Raman** an admin? They'll be able to see and cancel everyone's bookings, and manage desks and people."*; demoting reads *"Make **Priya Raman** an employee? They'll lose access to bookings, desks and people — and they'll be able to book a desk for themselves."* Actions: **Change role** and **Keep as is**
- **Can do** confirm, dismiss

### ST-09 Role change blocked — last active admin

- **When** the change would leave zero active Admins — demoting the only Admin (BR-001.11, V-11)
- **Shows** the same refusal shape as ST-07 with the cause stated for this path: *"**Marcus Vale** is the only active admin. Making this account an employee would leave nobody able to manage the system. Make someone else an admin first."* Primary action **Make someone an admin**; dismissal **Close**
- **Can do** promote someone else, or close

### ST-10 Reset password confirmation

- **When** **Reset password** is chosen on an account
- **Shows** a confirmation that sets up what is about to happen, because the next state puts a credential on screen: *"Reset **Dana Silva's** password? We'll generate a new one and show it to you once — it isn't emailed to them, so you'll need to pass it on. Their current password stops working straight away."* Actions: **Reset password** and **Cancel**. Every clause is a fact from BR-001.12 or BRD-001 §10 that Marcus will otherwise discover too late
- **Can do** confirm, dismiss

### ST-11 Password reset result — shown once

- **When** the reset succeeds (REQ-021, BR-001.12)
- **Shows** the new password once, in a monospaced field large enough to read aloud accurately, with a **Copy** control and the exposure stated plainly (RISK-005): *"This is the only time you'll see it. Copy it now and give it to Dana Silva directly — we can't show it again, and it isn't in any email."* The only action is **Done**, and the dialog does not close on a click outside or on Escape — a credential shown once must not be dismissed by a stray tap. **Copy** confirms in place (*"Copied"*), because a silent copy leads to pasting the wrong clipboard
- **Can do** copy, read it out, then **Done**. Nothing else on the screen is reachable until then

### ST-12 Action in progress

- **When** any row action is in flight — deactivate, activate, role change, reset
- **Shows** the confirming action in the open dialog busy, both actions disabled, dialog open, table untouched behind it. No optimistic change: a role shown as changed that then fails would leave Marcus believing he had promoted someone he had not
- **Can do** wait. Escape suppressed while in flight

### ST-13 Action failed

- **When** the request fails for a reason that is not a rule refusal
- **Shows** the dialog stays open with an error region naming what did not happen, rather than a generic failure: *"We couldn't deactivate Dana Silva just now. Nothing has changed. Try again."* The "nothing has changed" clause is the useful half — a failure part-way through a permission change is exactly where an administrator starts to worry
- **Can do** retry, or close

### ST-14 Action succeeded

- **When** a deactivation, activation or role change succeeds
- **Shows** the dialog closes; the row's chip or role updates in place; the summary line updates — and it is the admin count that Marcus watches, so *"2 admins"* becoming *"3 admins"* is the real confirmation. A transient message states the effect: *"Dana Silva deactivated. They can no longer sign in."* / *"Priya Raman is now an admin."*
- **Can do** carry on. Focus returns to the row, which is still there

## Components

| Component        | Used for                                                                                             | States it appears in              |
| ---------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------- |
| `app-shell`      | Admin sidebar / bottom bar, page header with **Add person**, account menu                            | ST-01 – ST-14                     |
| `search-field`   | Search by name or email                                                                              | ST-01, ST-03, ST-05 – ST-14       |
| `result-summary` | Counts, with admins counted explicitly — the number BR-001.11 protects                               | ST-01, ST-03, ST-05 – ST-14       |
| `data-table`     | Name · Email · Role · Status · actions — stacked cards below 768px; own row marked **(you)**          | ST-01, ST-05 – ST-14              |
| `status-chip`    | **Active** / **Deactivated** — icon **and** word, never colour alone                                 | ST-01, ST-05 – ST-14              |
| `menu`           | Row overflow: **Edit**, **Reset password**, **Deactivate** / **Activate**, role change               | ST-01, ST-14                      |
| `button`         | **Add person**; dialog actions; **Try again**; **Clear search**; **Copy**                            | ST-01 – ST-14                     |
| `empty-state`    | No search match — the only empty state reachable here                                                | ST-03                             |
| `alert`          | Load failure (`error`); in-dialog failure (`error`); last-admin refusals (`warning`)                 | ST-04, ST-07, ST-09, ST-13        |
| `skeleton-row`   | Loading placeholders at real row height                                                              | ST-02                             |
| `dialog`         | All confirmations and refusals — modal ≥768px, bottom sheet below                                    | ST-05 – ST-13                     |
| `credential-field` | Monospaced, read-aloud-legible, copy-to-clipboard — **used on this screen only**                   | ST-11                             |
| `toast`          | Transient confirmations stating the effect on access                                                 | ST-14                             |

## Interaction and accessibility

- **Keyboard:** search first, then the table, then each row's overflow. The table is a table, so headers are announced per cell — a bare "Employee" tells a screen-reader user nothing without its **Role** header. Overflow menus open with Enter, close with Escape, and return focus to their trigger
- **Focus:** visible ring on every control (`--c-focus-ring`). Dialogs trap focus and return it to the originating overflow. In ST-07 and ST-09 focus goes to the refusal text, not to **Make someone an admin** — the explanation is the point, and a focused button invites Enter before reading. In ST-11 focus goes to the password field itself so a screen-reader user hears the credential before the instructions, and the trap is strict: no outside click, no Escape, only **Done**
- **Non-colour signalling:** **Active** and **Deactivated** carry an icon **and** the word; roles are words, never a colour or a badge shape alone (NFR-003 of the design standard). The last-admin refusals carry an icon and state the count in text
- **Announcements:** the summary line is a live region, so a role change announces the new admin count — the safeguard-relevant fact. ST-07 and ST-09 are assertive and lead with the account name and the word "only". ST-11's dialog is announced with its full warning before the password is read, so nobody hears a credential without hearing that it is shown once. **Copy** announces *"Copied"* rather than only changing an icon
- **The credential moment (ST-11):** the password is rendered in a monospaced face with unambiguous glyph shapes — Marcus will read it aloud, and `1`/`l`/`I` and `0`/`O` confusion turns one reset into two. It is never placed in a URL, a toast, or anything that outlives the dialog
- **At 360px:** rows become cards in field order; the ST-11 sheet gives the password its own full-width line above **Copy**, never truncated or requiring a horizontal scroll to read (NFR-004)

## Structural decisions

| Decision                                                                                              | Rationale                                                                                                                                                                                                                                                                          | Alternative rejected                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The summary line counts admins explicitly                                                               | It is the quantity BR-001.11 defends. Seeing *"1 admin"* explains a refusal before it happens, and turns the safeguard from an obstacle into information (PRIN-2, PRIN-3)                                                                                                          | A total headcount only. Tidier, and the safeguard arrives with no context                                                                                                                                     |
| The administrator's own row is marked **(you)**                                                          | Self-deactivation is the likeliest way to trip BR-001.11, and the refusal reads very differently once you can see the account is yours                                                                                                                                              | An unmarked list. Uniform, and it makes the most dangerous row look like every other                                                                                                                            |
| Both last-admin refusals route to **Make someone an admin**                                              | A refusal with no route leaves Marcus needing to work out the fix himself. BR-001.11 has exactly one way through — promote somebody — so the dialog offers it (PRIN-3, INSIGHT-06)                                                                                                | A plain rejection. Compliant, and it stops one step short of being useful                                                                                                                                       |
| No override on the last-admin refusals                                                                   | BR-001.11 says the system *must reject* the action. An "I understand the risk" checkbox would reinstate the lockout the rule exists to prevent, and nobody could undo it from inside the product                                                                                    | A confirm-with-warning. Flexible, and it makes an unrecoverable state reachable in two clicks                                                                                                                    |
| Role change is confirmed, and the copy names what changes                                                | REQ-022 moves someone between seeing everyone's bookings and seeing only their own. A silent select-and-save on a permission change is how administrators discover mistakes later                                                                                                    | An inline role dropdown that saves on change. Faster, and it makes a mis-click a permission change                                                                                                              |
| ST-10 states the delivery terms before ST-11 shows the password                                           | BR-001.12 forbids emailing it, so the burden of passing it on is entirely Marcus's. Telling him after the password appears is telling him too late — he may have already dismissed the dialog                                                                                       | Going straight to the reset. One click fewer, and it turns a shown-once credential into a lost one                                                                                                               |
| ST-11 cannot be dismissed by outside click or Escape                                                      | It is the only place this value ever exists (BR-001.12) and it cannot be recovered. A stray tap costing a second reset is an avoidable design fault                                                                                                                                | Standard dismissal. Consistent with every other dialog, and uniquely expensive here                                                                                                                             |
| No true empty state                                                                                       | BRD-001's constraint seeds the first Admin when no users exist, and that account is the one signed in. So the list always contains at least one row — ST-03 (no search match) is the only reachable empty. Designing a "no people yet" state would be designing an unreachable screen | An empty state for completeness. Harmless, and it is a frame nobody can ever see                                                                                                                                |
| Deactivation cancels upcoming bookings, in one act, with the count in the button label (ST-06)              | Decided 2026-09-07. Access must be revoked immediately, and the desks cannot wait for an administrator to remember — the account holder can no longer cancel them (REQ-010). Putting the count in the confirming action means a habitual click still carries the number              | Leaving the bookings and warning the admin (a reserved desk nobody can use, invisible until someone complains); blocking deactivation until they are cleared, as BR-001.9 does for desks (delays a security action for a furniture reason) |
| Two deactivation confirmations, not one (ST-05, ST-06)                                                      | Cancelling nobody's day and cancelling three people's days are different consequences, so they get different copy and different frames. ST-06 lists the bookings rather than only counting them, because the administrator may recognise one they did not expect                    | One dialog whose text varies. One less frame, and the state that releases three desks stops being counted                                                                                                       |
| Search, unlike SCR-006's desk list                                                                         | An office's people list grows and turns over, and Marcus arrives knowing the name. 40 desks are scannable; 200 employees over time are not                                                                                                                                        | No search, for symmetry with Desks. Consistent, and wrong about the data                                                                                                                                        |
| No delete, only deactivate                                                                                 | BRD-001 offers no user delete (REQ-020 is deactivation) because bookings reference their owner and history must survive. The absence is deliberate and the copy explains what deactivation does instead                                                                            | A delete action. Convenient for a mistyped account, and it orphans bookings. **A wrong name or email is fixed on SCR-009 (REQ-019)**                                                                            |

## Conflicts and open questions

All rows resolved 2026-09-07. Rows 1 and 4 change BRD-001 and are listed in the PR handover for `/ba`.

| #   | Conflict / question                                                                                                                                                                                                                                                                                                                                            | Between                     | Owner            | Status                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **What happens to a deactivated user's upcoming bookings?** REQ-020 stops sign-in; nothing addresses their reservations. A leaver keeps a desk booked every Tuesday for three weeks and cannot cancel it themselves (REQ-010 requires signing in) — so desks sit reserved and empty until an Admin notices.                                                     | REQ-020, REQ-005 vs REQ-010 | PO/BA (`/ba`)    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — deactivation cancels them.** Deactivate immediately and cancel every Confirmed booking dated today or later in the same act; the admin sees the list and count first (ST-06); each cancellation emails the owner (REQ-024). **New rule — `/ba` must add it to BRD-001**   |
| 2   | Should the reset-password result be printable, or is on-screen display the whole intent? BR-001.12 says shown once, copy encouraged. If the new starter is not at Marcus's desk, "copy to clipboard" needs somewhere to go — and every option (chat, paper, dictation) is outside the product.                                                                   | BR-001.12 vs RISK-005       | PO / security    | **Resolved 2026-09-07 (Joy Joshua, PO) — copy only.** No print, no send, shown once. The product does not become a credential-delivery channel. Confirms BR-001.12 as written; no BRD change                                            |
| 3   | Can an Admin reset **their own** password here? REQ-021 is admin-initiated reset of "a user's" password and does not exclude self. Doing so shows Marcus a password he then has to use — harmless, but it is also the only self-service reset in a product that deliberately has none (BRD-001 §10).                                                             | REQ-021 vs BRD-001 §10      | PO/BA (`/ba`)    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — allowed.** The administrator's own row behaves like any other. It matters most in a single-admin office, where hiding it would leave that account unresettable. Clarifies REQ-021; no BRD change |
| 4   | Row 1 cancels bookings on an employee’s behalf, so REQ-027 would push that employee an alert with no visible cause — the problem SCR-004 row 1 solved for admin-initiated cancellation. | REQ-027 vs row 1 | PO/BA (`/ba`) | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — say why.** These use the same actor-naming copy agreed on SCR-004: the alert states the office admin cancelled it. **Folded into the same `/ba` change as SCR-004 row 1** |

## Designer handoff

Tokens: `inception/design/tokens.json` (W3C DTCG — importable into Figma via Tokens Studio, Penpot, and others). Draw one frame per `ST-##` above; the numbering is the checklist. Name each frame `WF / SCR-008 · People / ST-## <state>` (`HF /` once styled) — the name is the only thing that ties a frame back to this spec. Grid, spacing, and the per-frame checklist: `inception/design/wireframe-rules.md`.

Fourteen states at **360px and 1280px** (NFR-004). **ST-11 is the frame to get right**: a credential that has to be read aloud accurately, on a screen other people can see, that cannot be shown again. ST-07 and ST-09 are the same refusal component with different causes — draw both, since the copy is the whole difference. ST-12 – ST-14 are shared by four different row actions; draw them once with the deactivate copy and note the reuse.
