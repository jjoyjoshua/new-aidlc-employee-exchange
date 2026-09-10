# SCR-008 — People

> Approval = Gate 1 review of this file's PR. A state is "designed" when it is numbered here, listed in the manifest, and drawn as its own frame in the design tool (`WF / SCR-### · <screen> / ST-## <state>`).

|                 |                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Serves**      | — (stories not yet drafted; the `US ↔ SCR` edge is added by `/ba` in Discovery step 3)                                        |
| **Traces to**   | REQ-004, REQ-005, REQ-018, REQ-020, REQ-021, REQ-022, REQ-024, REQ-030, REQ-032, NFR-004, NFR-008                                                                         |
| **Surface**     | `apps/ui` `features/admin-users` — `/admin/people`                                                                           |
| **Persona**     | P-2 Marcus ([research](../research/BRD-001-employee-desk-booking.md))                                                        |
| **Primary job** | Keep accounts matching the people who actually work here — add starters, change roles, switch leavers off, rescue passwords    |
| **Principle**   | PRIN-3 — the last-admin safeguard and every other refusal name the consequence; PRIN-5 — a shown-once password says so plainly |
| **Status**      | draft — awaiting designer review                                                                                             |

## Purpose

The account list. Marcus creates users (REQ-018), assigns and changes roles (REQ-022, REQ-004), deactivates leavers (REQ-020, and REQ-005 stops them signing in), and resets passwords on request (REQ-021). Editing name and email happens on SCR-009 (REQ-019).

Two rules shape this screen more than the CRUD does. **BR-001.11** forbids any action that would leave zero active Admins — so a refusal has to explain the lockout it prevented, not just deny the click. **BR-001.12** requires a reset password to be displayed once to the administrator and never emailed (BRD-001 §10) — so this screen has a state that shows a credential on a monitor, in an office, with people walking past (RISK-005).

A third rule was added on 2026-09-07 (Joy Joshua, PO/BA; codified 2026-09-10 as REQ-030, BR-001.18 and V-17): **deactivating a user also cancels their upcoming bookings.** Access is revoked immediately — a leaver cannot wait for a desk to be freed — and the desks are released in the same act, because the person who holds them can no longer sign in to cancel them (REQ-010 requires signing in). The administrator sees the count before confirming, and each cancellation sends its usual email (REQ-024). This is deliberately the opposite shape from desk deactivation, where BR-001.9 blocks rather than cancels; the difference is that a desk can wait and a revoked account cannot.

## Place in the flow

- **Reached from:** SCR-005, SCR-006 (sidebar)
- **Leads to:** SCR-005 (Bookings), SCR-006 (Desks), SCR-009 (User form)

## Layout

A table with a search field — unlike the desk list, an office's people list grows past the point of scanning, and Marcus arrives knowing the name he wants. Codified 2026-09-10 as **REQ-032**, priority **Must** — not for convenience, but because BR-001.11's refusal (ST-07, ST-09) offers **Make someone an admin** and focuses this field. The safeguard's only recovery route runs through it.

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
│            │  │  (you)       │               │        │        │  │  Make an admin ·
│            │  │ Dana Silva   │ dana@…        │Employee│⊘ Deactd│⋯ │  Reset password ·
│            │  └──────────────┴───────────────┴────────┴────────┘  │  Deactivate
│  ─────────  │                                                      │
│  ◕ Marcus  │                                                      │
└────────────┴──────────────────────────────────────────────────────┘
```

**Marcus's own row is marked "(you)".** BR-001.11's refusal makes far more sense when the account you are about to change is visibly your own, and the most likely way to trigger the safeguard is deactivating yourself.

The summary line counts admins explicitly — *"2 admins"* — because that number is the one BR-001.11 protects. When it reads **1 admin**, Marcus can see the safeguard coming before he trips it (PRIN-2).

**The row's four actions live in one overflow menu, at every width.** Edit, a role
change, Reset password, and Deactivate/Activate — four controls do not fit a table row at
1280, so this screen keeps its menu where SCR-006 dropped one. The test is the row, not a
house style: SCR-006's two actions fit where these four do not
([wireframe-rules](../wireframe-rules.md)). The menu is therefore the *single* row control
at 1280, at 768 and at 360, which is what keeps the same act costing the same number of
clicks on a phone and on a desktop — the fault SCR-006 had to correct on 2026-09-10.

**The role change is a menu item labelled with the role it would produce** — **Make an
admin** on an employee, **Make an employee** on an admin. Decided 2026-09-10 during the
pre-build pass, and it closed a hole: this file named four row actions in its component
table and three in ST-01, and **nothing anywhere started a role change**, which left ST-08
and ST-09 — the role-change confirmation and its last-admin refusal — with no route in.
Labelling the item by outcome means the confirmation it opens has already been described by
the thing that opened it. An inline role select in the row was rejected again here for the
reason the structural decisions below already give: it turns a mis-click into a permission
change.

Below 1024px each row becomes a card in the same field order, and **the menu stays a single
`Icon button` at the card's top-right**, aligned with the name. This sentence previously
said the row actions became "full-width controls", which contradicted two things at once:
the tablet rule that full-width stacked buttons are absurd at 648px, and the existence of
the menu itself — PRIN-4 asks for touch-sized controls, not for four of them. **At 360 the
menu opens as a bottom sheet titled with the person's name**, per the popup rule, which
also repairs the one thing an icon-only trigger loses on a phone: which row you are about
to change.

**The table becomes cards below 1024px, not below 768px** (measured 2026-09-07 while
drawing the tablet frames). At 768px with the collapsed icon-only sidebar the content
area is 648px, and this table's own columns need more than that — so a table kept at
768 would scroll sideways, which defeats the one reason it is a table: comparing rows
at a glance (A-6). Portrait tablet therefore gets the card list; landscape tablet and
desktop, at 1024 and above, keep the table.

This table needs **896px** — the widest of the three; at 768 it has 648. That figure was
**854px** until 2026-09-10, when the hi-fi build gave the table real columns and measured
it: Name 240 · Email 280 · Role 120 · Status 160 · a 48px `⋯`, plus the 24px padding each
side. The earlier number predated the columns; the conclusion it supports — cards below
1024, because 896 does not fit 648 — is unchanged, and now it is measured rather than
estimated.

## States

Sixteen. Two rule refusals (ST-07, ST-09), one credential display, two shapes of
deactivation, a shared trio for the row actions, and — added 2026-09-10 by the pre-build
pass — the open row menu and a search that matches (ST-15, ST-16). Both were interface this
file already described and had never numbered, and an unnumbered state is a state someone
forgets to build. They are **appended rather than inserted**, so every existing `ST-##`
keeps the number the approved wireframes and the manifest already carry — the same choice
SCR-005 made with its ST-12.

### ST-01 Default

- **When** the user list is loaded
- **Shows** the summary line — *"38 people · 36 employees, 2 admins · 1 deactivated"* — then every account: name, email, role, a status chip reading **Active** or **Deactivated** (icon plus word), and an overflow menu (`⋯`) holding **Edit**, **Make an admin** / **Make an employee**, **Reset password**, and **Deactivate** or **Activate** — **closed** in this state; open it is ST-15. The signed-in administrator's row is marked **(you)**. **Add person** sits in the page header. No search is active, so there is no match line above the table — that is ST-16
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
- **Shows** a confirmation that sets up what is about to happen, because the next state puts a credential on screen: *"Reset **Dana Silva's** password? We'll generate a new one and show it to you once — it isn't emailed to them, so you'll need to pass it on. Their current password stops working straight away, and they'll be asked to choose their own the first time they sign in with the new one."* Actions: **Reset password** and **Cancel**. Every clause is a fact from BR-001.12, BR-001.17 or BRD-001 §10 that Marcus will otherwise discover too late
- **Note (added 2026-09-10):** the final clause is new. REQ-029 and BR-001.17 apply identically to a password set at creation (REQ-018) and one set by this reset (REQ-021) — SCR-010 sits behind both — but only the **create** path said so. SCR-009 ST-01 has always warned *"They'll be asked to change it when they first sign in"*, and this screen said nothing, so an administrator resetting a password handed over a credential without knowing it was about to be replaced. Found 2026-09-10 by a cross-screen consistency sweep. No rule changed; one screen was simply quieter than the other about the same rule
- **Can do** confirm, dismiss

### ST-11 Password reset result — shown once

- **When** the reset succeeds (REQ-021, BR-001.12)
- **Shows** the new password once, in a monospaced field large enough to read aloud accurately, with a **Copy** control and the exposure stated plainly (RISK-005): *"This is the only time you'll see it. Copy it now and give it to Dana Silva directly — we can't show it again, and it isn't in any email. They'll be asked to choose their own password when they sign in with it."* The final sentence is deliberately **last**, after the shown-once warning has landed: this state's first job is to stop the credential being lost, and nothing may displace that. It is repeated here rather than left on ST-10 because this is the moment Marcus is actually reading the password out, and it tells him what to say alongside it — the same reason SCR-009 repeats it in its create toast (ST-07) having already warned on the form. The only action is **Done**, and the dialog does not close on a click outside or on Escape — a credential shown once must not be dismissed by a stray tap. **Copy** confirms in place (*"Copied"*), because a silent copy leads to pasting the wrong clipboard
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
- **Can do** carry on. Focus returns to the row's **`⋯`** trigger — the control the action was started from, which is what the Interaction section promises and what ST-15 hands focus back to. That trigger survives every one of these actions (a deactivation changes the menu's *item* from **Deactivate** to **Activate**, not the button), so there is always something to return to. This bullet previously said "the row", leaving the two sections disagreeing about focus — corrected 2026-09-10

### ST-15 Row menu open

- **When** a row's **`⋯`** is activated. Added 2026-09-10 by the pre-build pass: [`wireframe-rules.md`](../wireframe-rules.md) settled on 2026-09-10 that this screen keeps its overflow *and numbers the open menu as a state*, and the state had never been written. It is the doorway to five of the other fifteen, so leaving it undrawn would have taken them with it
- **Shows** the menu over the row it belongs to, carrying all four actions in a fixed order — **Edit**, **Make an admin** / **Make an employee**, **Reset password**, then **Deactivate** / **Activate** last, separated by a divider because it is the destructive one. The role item's label names the role it would *produce*, so it reads **Make an employee** on Marcus's own admin row and **Make an admin** on Priya's. On a **deactivated** account the last item reads **Activate**, and the role item stays available — a deactivated person's role still decides what they come back to. At ≥768px an anchored popover on `--c-surface-overlay` with `shadow/2`; **at 360px a bottom sheet titled with the person's name**, because an icon-only trigger on a card is the one place the interface cannot otherwise say which row is about to change
- **Can do** choose any of the four — **Edit** → SCR-009; the role item → ST-08, or ST-09 where it would leave no admin; **Reset password** → ST-10; **Deactivate** → ST-05, ST-06 or ST-07 depending on the bookings held and the admin count — or dismiss with Escape or a click away. Dismissing returns focus to the **`⋯`** that opened it

### ST-16 Search with matches

- **When** a search term matches one or more accounts. Added 2026-09-10 by the pre-build pass — the match line described below appears in **no other state**, so without a frame of its own it would not have been drawn
- **Shows** the term retained in the field with a clear (`×`) control, the matching rows only, and a **match line** immediately above the table reading *"Showing 3 of 38"*. **The summary line does not re-count.** It goes on reading *"38 people · 36 employees, 2 admins · 1 deactivated"*, unchanged, because the admin count is the number BR-001.11 defends and it sits on the screen so that a refusal is visible before it fires. Re-counting it to describe the matches would delete that number at exactly the moment it is load-bearing: ST-07 and ST-09 send Marcus *here*, to search for somebody to promote (decided 2026-09-10 by the designer)
- **Can do** open any matching row's menu (→ ST-15), clear the search (→ ST-01), keep typing (→ ST-03 if it stops matching), or add a person

## Components

| Component        | Used for                                                                                             | States it appears in              |
| ---------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------- |
| `app-shell`      | Admin sidebar / bottom bar, page header with **Add person**, account menu. ST-04 needs the header **without** its action, and the set had no variant without one — `Desktop` and `Mobile` both carry SCR-005's timezone line, which does not belong on this page. **`Size=Desktop title` and `Size=Mobile title` were added** 2026-09-10 alongside the `Desktop action` / `Mobile action` pair SCR-006 added | ST-01 – ST-16                     |
| `search-field`   | Search by name or email; carries a clear (`×`) control once a term is present                        | ST-01, ST-03, ST-05 – ST-16       |
| `result-summary` | Counts, with admins counted explicitly — the number BR-001.11 protects. **Never re-counts for a search;** the match line is a separate row above the table (ST-16) | ST-01, ST-03, ST-05 – ST-16       |
| `data-table`     | Name · Email · Role · Status · `⋯` — stacked cards below **1024px**, matching the Layout section above; own row marked **(you)**. The 768px figure this row used to carry contradicted it | ST-01, ST-05 – ST-16              |
| `status-chip`    | **Active** / **Deactivated** — icon **and** word, never colour alone. This is the library's `Inactive` variant carrying the word *Deactivated*: the quiet-neutral treatment is shared with SCR-006 and only the copy differs, because a desk is *inactive* and a person is *deactivated*. **A `Deactivated` variant was added** 2026-09-10: the set has no text property, so its words live in the variants and a new word needs a new variant — cloned from `Inactive`, so the fill, border and block icon are the same tokens and only the label differs | ST-01, ST-05 – ST-16              |
| `menu`           | Row overflow, four items in a fixed order: **Edit**, **Make an admin** / **Make an employee**, **Reset password**, **Deactivate** / **Activate**. Anchored popover ≥768px, bottom sheet titled with the person's name at 360 | ST-15 (open); trigger in ST-01, ST-14, ST-16 |
| `button`         | **Add person**; dialog actions; **Try again**; **Clear search**; **Copy**                            | ST-01 – ST-16                     |
| `empty-state`    | No search match — the only empty state reachable here                                                | ST-03                             |
| `alert`          | Load failure (`error`); in-dialog failure (`error`); last-admin refusals (`warning`)                 | ST-04, ST-07, ST-09, ST-13        |
| `skeleton-row`   | Loading placeholders at real row height                                                              | ST-02                             |
| `dialog`         | All confirmations and refusals — modal ≥768px, bottom sheet below                                    | ST-05 – ST-13                     |
| `credential-field` | Monospaced, read-aloud-legible, copy-to-clipboard — **used on this screen only**                   | ST-11                             |
| `toast`          | Transient confirmations stating the effect on access                                                 | ST-14                             |

## Interaction and accessibility

- **Keyboard:** search first, then the table, then each row's overflow. The table is a table, so headers are announced per cell — a bare "Employee" tells a screen-reader user nothing without its **Role** header. Overflow menus open with Enter, close with Escape, and return focus to their trigger. The trigger is icon-only, so **each row's `⋯` needs its own accessible name** — *"Actions for Dana Silva"* — because forty controls all called "Actions" is forty identical stops in a screen reader's control list. Inside the open menu (ST-15) the arrow keys move between the four items and the role item's name is its visible label, so what is announced is the outcome (*"Make an admin"*), not the field it changes
- **Focus:** visible ring on every control (`--c-focus-ring`). Dialogs trap focus and return it to the originating overflow. In ST-07 and ST-09 focus goes to the refusal text, not to **Make someone an admin** — the explanation is the point, and a focused button invites Enter before reading. In ST-11 focus goes to the password field itself so a screen-reader user hears the credential before the instructions, and the trap is strict: no outside click, no Escape, only **Done**
- **Non-colour signalling:** **Active** and **Deactivated** carry an icon **and** the word; roles are words, never a colour or a badge shape alone (NFR-008). The last-admin refusals carry an icon and state the count in text
- **Announcements:** the summary line is a live region, so a role change announces the new admin count — the safeguard-relevant fact. ST-07 and ST-09 are assertive and lead with the account name and the word "only". ST-11's dialog is announced with its full warning before the password is read, so nobody hears a credential without hearing that it is shown once. **Copy** announces *"Copied"* rather than only changing an icon
- **The credential moment (ST-11):** the password is rendered in a monospaced face with unambiguous glyph shapes — Marcus will read it aloud, and `1`/`l`/`I` and `0`/`O` confusion turns one reset into two. It is never placed in a URL, a toast, or anything that outlives the dialog. **At 360px this sheet carries no drag handle** — added 2026-09-10 by the pre-build pass. Every other sheet on this screen gets one, because a handle is how a phone user knows a sheet can be pushed away; here it would be a promise the state has to break, and the cost of breaking it is a second reset. So the affordance is absent rather than present-and-inert, and the strip of dimmed screen above the sheet is likewise not a dismiss target
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
| The four row actions stay in one menu at every width, and the open menu is a numbered state (ST-15) | Four controls do not fit a table row at 1280, so unlike SCR-006 this screen earns its overflow — the test is the row, not a house style. Keeping it the single row control at 360 too means one act costs the same number of clicks everywhere, which is the fault SCR-006 corrected on 2026-09-10. Numbering the open menu is what `wireframe-rules.md` requires of a screen that keeps one, and it is the doorway to five other states | Expanding all four onto the card below 1024px. More discoverable on a phone, and it gives the phone a route the desktop does not have — and contradicts the reason the menu exists |
| The role change is a menu item labelled with the role it would produce (2026-09-10) | Nothing in this file previously started a role change, which left ST-08 and ST-09 unreachable — the component table said four row actions and ST-01 said three. **Make an admin** / **Make an employee** names the outcome, so the confirmation that follows was already described by the control that opened it, and the announced name is the consequence rather than the field | An inline role select, rejected a second time for the reason the row above already gives: it turns a mis-click into a permission change. A generic **Change role** item, which announces the field and makes the confirmation the first place the direction appears |
| The summary line never re-counts for a search; a separate match line does (ST-16)                     | *"2 admins"* is the quantity BR-001.11 defends and it is on the screen so the refusal is visible before it fires. A search that re-counted it would remove that number precisely when it matters most — ST-07 and ST-09 send Marcus to the search field to find someone to promote, so the count must survive the search they told him to run | Re-counting the summary to describe the matches. Reads more naturally as a description of what is on screen, and blinds the safeguard during the one task the safeguard hands out. Showing no match count at all, which leaves "did my search work?" unanswered when the results sit below the fold |
| The row's `⋯` is a **ghost** control, not a bordered one | SCR-008 is the first and only consumer of `Icon button`, which SCR-006 built from `Type=Secondary` and then never used. A bordered 48px square is right beside an **Edit** button, which is the job it was built for; it is wrong repeated down forty rows, where it turns the right-hand edge of the table into a column of empty boxes. The icon is the affordance and the row is the context, so the control carries no fill or stroke at rest — matching `Button` `Type=Ghost` | Keeping the secondary border it was built with. Consistent with the component's origin, and it makes the quietest control on the screen the most drawn one |
| At 360px a sheet footer **stacks** when its labels cannot fit equal halves, and only then | Measured 2026-09-10 during the build. The sheet footer gives each action 152px; the label plus its 32px padding needs **291px** for *Deactivate and cancel 3 bookings* (ST-06), **222px** for *Make someone an admin* (ST-07, ST-09) and **155px** for *Reset password* (ST-10) — so those four clip, and ST-05, ST-08, ST-12 and ST-13 (115–142px) do not. Stacking gives each action the full 312px. The confirming action sits **on top** and the dismissal beneath, which keeps a destructive action away from the thumb. Shortening the labels was not available: ST-06's count is in the label precisely so a habitual click cannot hide it | Stacking every sheet on the screen for uniformity — it would override four dialogs that fit, and diverge from the same component on SCR-002, SCR-003, SCR-005, SCR-006 and SCR-007 for no measured reason. Leaving them clipped, which is not a design |
| The open menu gets a scrim at 360 and **no scrim** at 768 and 1280 (ST-15) | The popup rule asks for a scrim because a form card floating on nothing cannot be told from a page. An anchored popover is not that: it hangs off the `⋯` it came from, and that trigger is the thing saying which row it belongs to, so it needs no dimming and is not modal. At 360 the same menu **is** modal — a full-width sheet with no anchor — so it takes the scrim, and the person's name as a title | Scrimming the desktop popover too. Uniform with the dialogs, and it makes a four-item menu read as a modal interruption |
| ST-11's sheet has no drag handle at 360px                                                              | A handle is how a phone user learns a sheet can be swiped away, and this is the one sheet that must not be. An inert handle teaches the gesture and then refuses it; an absent handle never makes the promise. The dimmed strip above it is not a dismiss target either, for the same reason | A handle for consistency with every other sheet on the screen. Uniform, and uniquely expensive here — the password cannot be shown twice (BR-001.12) |

## Conflicts and open questions

All rows resolved 2026-09-07. Rows 1 and 4 change BRD-001 and are listed in the PR handover for `/ba`.

| #   | Conflict / question                                                                                                                                                                                                                                                                                                                                            | Between                     | Owner            | Status                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **What happens to a deactivated user's upcoming bookings?** REQ-020 stops sign-in; nothing addresses their reservations. A leaver keeps a desk booked every Tuesday for three weeks and cannot cancel it themselves (REQ-010 requires signing in) — so desks sit reserved and empty until an Admin notices.                                                     | REQ-020, REQ-005 vs REQ-010 | PO/BA (`/ba`)    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — deactivation cancels them.** Deactivate immediately and cancel every Confirmed booking dated today or later in the same act; the admin sees the list and count first (ST-06); each cancellation emails the owner (REQ-024). **New rule — `/ba` must add it to BRD-001.** **Codified 2026-09-10 as REQ-030, BR-001.18 and V-17.** BR-001.18 records in its own note that this is deliberately the opposite shape from BR-001.9, so neither is read as a precedent for the other, and RISK-011 records that these cancellations cannot be undone by reactivating the account   |
| 2   | Should the reset-password result be printable, or is on-screen display the whole intent? BR-001.12 says shown once, copy encouraged. If the new starter is not at Marcus's desk, "copy to clipboard" needs somewhere to go — and every option (chat, paper, dictation) is outside the product.                                                                   | BR-001.12 vs RISK-005       | PO / security    | **Resolved 2026-09-07 (Joy Joshua, PO) — copy only.** No print, no send, shown once. The product does not become a credential-delivery channel. Confirms BR-001.12 as written; no BRD change                                            |
| 3   | Can an Admin reset **their own** password here? REQ-021 is admin-initiated reset of "a user's" password and does not exclude self. Doing so shows Marcus a password he then has to use — harmless, but it is also the only self-service reset in a product that deliberately has none (BRD-001 §10).                                                             | REQ-021 vs BRD-001 §10      | PO/BA (`/ba`)    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — allowed.** The administrator's own row behaves like any other. It matters most in a single-admin office, where hiding it would leave that account unresettable. Clarifies REQ-021; no BRD change |
| 4   | Row 1 cancels bookings on an employee’s behalf, so REQ-027 would push that employee an alert with no visible cause — the problem SCR-004 row 1 solved for admin-initiated cancellation. | REQ-027 vs row 1 | PO/BA (`/ba`) | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — say why.** These use the same actor-naming copy agreed on SCR-004: the alert states the office admin cancelled it. **Folded into the same `/ba` change as SCR-004 row 1** |

## Designer handoff

Tokens: `inception/design/tokens.json` (W3C DTCG — importable into Figma via Tokens Studio, Penpot, and others). Draw one frame per `ST-##` above; the numbering is the checklist. Name each frame `WF / SCR-008 · People / ST-## <state>` (`HF /` once styled) — the name is the only thing that ties a frame back to this spec. Grid, spacing, and the per-frame checklist: `inception/design/wireframe-rules.md`.

Sixteen states at **360px, 768px and 1280px** (NFR-004) — 48 frames. **ST-11 is the frame to get right**: a credential that has to be read aloud accurately, on a screen other people can see, that cannot be shown again. ST-07 and ST-09 are the same refusal component with different causes — draw both, since the copy is the whole difference. ST-12 – ST-14 are shared by four different row actions; draw them once with the deactivate copy and note the reuse.

**The hi-fi frames for this screen exist.** All sixteen states are drawn at 360, 768 and
1280 in *Employee Desk Booking — Design System & Mockups*
(<https://www.figma.com/design/xjFVgBbMrJUl7Ys3EX3Cbn>) — **48 frames** — named
`HF / SCR-008 · People / ST-## <state> · <width>`, on the pass-2b palette as Figma
variables in both themes. Every colour and every text style is a token — audited:
**0 raw paints out of 3,654, and 0 unstyled text nodes out of 1,294** across 5,731 nodes —
so the dark theme is a mode switch rather than a redraw, which was rendered and checked.
Neither the frames nor the Figma file is what gets approved; this spec’s PR is.

**ST-11 was drawn as this handoff asked.** The credential sits in `mono/regular` at
`--t-mono` (20px — already the largest size in the ramp, so no token was needed), and the
sample is deliberately `q4Lm1I0oTz8v`: it carries `1`, `I`, `0` and `o`, the four glyphs
this state exists to disambiguate. The dialog has **no ✕ in its header** and, at 360, **no
drag handle** — the two affordances that would offer a dismissal the state cannot honour.

Built for this screen, and reusable: **`Icon / search`** (the library had no magnifier;
cloned from `Icon / block` so weight, caps and joins match the set), **`Search field`**
(`Default` / `Focus` / `Filled` / `Disabled`, the `Filled` state carrying the clear `×`),
**`People table header`**, **`Person row`** (table / card / card compact × active /
deactivated, with a `Show you` boolean for the **(you)** marker), **`People skeleton row`**
(its own component, on *this* table’s column grid — a skeleton only stops the table
jumping if its columns match, and its three layouts are 64 / 80 / 152px, exactly the real
row heights), **`Row menu`** (popover / sheet × deactivate / activate),
**`Credential field`** (`Default` / `Copied`), a `Status chip` **`Deactivated`** variant, an
`Empty state` **`No search match (people)`** context carrying two actions, and
`Page header` **`Desktop title`** / **`Mobile title`** for ST-04.

**Four faults found while building, none of which a token audit can see.**

1. **`Icon button` shipped with a dead second child.** Its `Surface` held both
   `Icon / more` and an invisible `Icon / calendar` with no property reference — nothing
   could ever show it. Removed. It also arrived with a secondary border; see the
   structural decision above.
2. **The bottom-sheet dialog footer’s buttons were FILL, but their painted `Surface`
   children were not** — the "resizing a button is always two moves" rule, applied to the
   component and never checked. At 360 that made the secondary action render **85px inside
   its 152px half**, so every two-action sheet in the file had visibly unequal buttons.
   Fixed on the footer instances (which is where stretching belongs), and it corrects the
   360 dialog frames on **SCR-002, SCR-003, SCR-005, SCR-006 and SCR-007** as a
   side-effect — all verified unchanged otherwise.
3. **Overriding `layoutMode` on a frame inside an instance does not persist.** Setting the
   sheet footer to vertical looked like it worked and silently reverted, which is why
   ST-06’s stacked footer needed a real `Footer=Stacked` variant rather than a per-frame
   override. Adding that third axis to `Dialog` gave every existing variant
   `Footer=Side by side`, so all twelve dialog instances on the earlier screens kept their
   appearance — checked frame by frame.
4. **A vertically-`FILL` child collapses when its parent turns vertical.** The footer
   buttons were `FILL/FILL` for a horizontal row; stacked, vertical FILL made them share
   the primary axis and each shrank to **16px** while its `Surface` stayed 40px and
   overflowed. The repair is `HUG`, not a taller frame.

**One thing checked and found correct rather than fixed.** The **`Deactivated` chip has no
border in either theme**, and in dark its fill sits **1.05:1** against the card, so it
reads as icon-plus-word rather than as a pill. That is deliberate: `tokens.css` sets
`--c-state-inactive-border: transparent` with the reason attached — *"the block icon is
the signal, as with taken and completed"* — so the quiet chips are a borderless family and
NFR-008 is carried by the icon and the word, not the fill. The matching Figma variable is
consequently valueless, which is how `transparent` is modelled there; the chip strokes
bound to it are inert and were left alone.

**Re-rendered 2026-09-10 — six frames, for the forced-password-change sentence.** ST-10
and ST-11 each gained one sentence (see the notes on those states), so both states were
rebuilt at 360, 768 and 1280. Nothing structural changed: no new state, no new component,
no new token, and no change to ST-11's strict dismissal rules, its missing header ✕ or
its missing drag handle. The copy is a `Body` **text property on the `Dialog` instance**,
not an override on the text node, so each frame was one property set and the card grew on
its own auto-layout.

**What grew, measured.** ST-10's body went 72 → 120px at 1280 and 768 (three lines to
five) and 120 → 168px at 360, taking the card 244 → 292 and 344 → 416. ST-11's went
72 → 96 and 96 → 120, taking the card 328 → 352 and 352 → 376. ST-11 gains less because
its sentence is shorter.

**Repositioning was required and is the part worth knowing.** Every dialog on this page is
`layoutPositioning: ABSOLUTE` inside its frame, so a card that grows keeps its top edge
and extends *downward* — it does not re-centre and it does not stay anchored. Left alone,
ST-10 at 360 finished 72px past the bottom of its own frame. The two centred modals were
re-centred on the new height and the two 360 sheets re-anchored flush to the frame bottom.
All six now sit fully inside their frames, and no text node is clipped — checked against
`absoluteRenderBounds`, not by eye.

**The two things this spec said to watch, both checked.** At 360 ST-11 still carries the
credential on its own full-width line above **Copy**, untruncated and with no horizontal
scroll — the extra sentence wrapped, which is the order this spec requires. ST-10 at 360
kept its stacked footer, as predicted: that measurement is driven by the *Reset password*
label needing 155px against a 152px half, and body copy does not touch it.

**One canvas fault fixed in passing.** `Desk table header` (from the SCR-006 build) sat
inside `Admin skeleton row`’s bounding box on the *Admin table & filters* page — the
overlap `wireframe-rules.md` warns eats component sets. Moved clear; no set on that page
overlaps another now.
