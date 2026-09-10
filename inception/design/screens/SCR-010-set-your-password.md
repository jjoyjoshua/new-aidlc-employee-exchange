# SCR-010 — Set your password

> Approval = Gate 1 review of this file's PR. A state is "designed" when it is numbered here, listed in the manifest, and drawn as its own frame in the design tool (`WF / SCR-### · <screen> / ST-## <state>`).

|                 |                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Serves**      | — (stories not yet drafted; the `US ↔ SCR` edge is added by `/ba` in Discovery step 3)                                                  |
| **Traces to**   | REQ-002, REQ-018, REQ-021, REQ-029, NFR-003, NFR-004, NFR-008 (REQ-029 codifies the forced change — see Conflicts, row 1)                        |
| **Surface**     | `apps/ui` `features/auth` — `/set-password`, forced after sign-in while the account's password is administrator-set                      |
| **Persona**     | P-1 Priya on her first morning, and anyone whose password was just reset ([research](../research/BRD-001-employee-desk-booking.md))     |
| **Primary job** | Replace the password somebody else chose for me with one only I know, and get on with booking a desk                                    |
| **Principle**   | PRIN-1 — says why you are here before asking for anything; PRIN-3 — a refused password says which rule it missed, not "invalid"          |
| **Status**      | draft — awaiting designer review                                                                                                        |

## Purpose

This screen exists because of a decision taken on 2026-09-07 (Joy Joshua, PO/BA), codified on 2026-09-08 as **REQ-029** with **BR-001.17** and **V-15**: a password set by an administrator must be changed by its owner at first use. Until that decision, an administrator who created an account retained a working credential for it indefinitely — including after they stopped being an administrator.

It is reached on exactly two occasions, both of which mean *somebody else currently knows your password*: the first sign-in after an account is created (REQ-018), and the first sign-in after an administrator resets it (REQ-021). It is not a settings screen and it cannot be reached voluntarily — with no self-service reset in this release (BRD-001 §10), there is no route here for someone who simply wants a new password.

It is deliberately **not** a state on SCR-001. Sign-in and choosing a password are different jobs with different failure modes, and burying a five-rule policy checklist inside the sign-in card would hide five states nobody would count.

## Place in the flow

- **Reached from:** SCR-001 — automatically, when the signed-in account's password is still the administrator-set one
- **Leads to:** SCR-002 (role = Employee), SCR-005 (role = Admin)

There is no way past this screen other than through it, and no navigation shell around it — the app shell appears only once the password is the account holder's own. Sign-out is available, and returns to SCR-001 with the temporary password still valid, so nobody can be locked out by abandoning this step.

## Layout

Single centred column, one card, matching SCR-001 so the transition reads as one continuous arrival rather than a new place.

**The card is 400px at both 768 and 1280, centred on both axes** — the same fixed card as SCR-001, for the reason stated there (decided 2026-09-10 by the designer). Same width, same radius, same edge, same position: someone who has just signed in should feel the *contents* of the card change, not the card. At 360 the card is the page, on the 328px inner column.

```
┌─────────────────────────────────────┐
│         Desk Booking                │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Choose your own password      │  │  --t-heading-lg
│  │                               │  │
│  │ Your admin set the one you    │  │  says WHY you are here
│  │ just used. Pick a new one only│  │  before asking for anything
│  │ you know.                     │  │  (PRIN-1)
│  │                               │  │
│  │ New password                  │  │
│  │ [                  ] [show]   │  │
│  │ ✓ 8 characters or more        │  │  all five rules visible
│  │ ✓ An upper-case letter        │  │  from the first keystroke
│  │ ○ A lower-case letter         │  │
│  │ ○ A number                    │  │
│  │ ○ A special character         │  │
│  │                               │  │
│  │ Confirm new password          │  │
│  │ [                  ]          │  │
│  │                               │  │
│  │ [   Save and continue    ]    │  │
│  │                               │  │
│  │ There's no self-service reset │  │  the honest warning:
│  │ — if you forget this, your    │  │  losing it costs an
│  │ office admin has to reset it. │  │  admin conversation
│  └───────────────────────────────┘  │
│                                     │
│            Sign out                 │  quiet text link, OUTSIDE the card:
│                                     │  available (see ST-06), not part
└─────────────────────────────────────┘  of the task
```

The closing warning is the one piece of copy on this screen that people will remember, and it is the truthful consequence of BRD-001 §10. Someone choosing a password they will forget deserves to know now, not in three weeks.

## States

### ST-01 Default

- **When** the screen loads after a sign-in with an administrator-set password
- **Shows** the explanation of why this screen appeared; a **New password** field (focused) with a show/hide control and all five policy rules from V-12 listed as an unmet checklist — **in its pending look: a hollow `○` marker and `--c-text-muted` text, never error styling**, because nothing is wrong yet and five rules in red on an untouched form say that something is; a **Confirm new password** field; an enabled **Save and continue**; and the no-self-service-reset warning
- **Can do** type a password, toggle visibility, submit
- **Note (added 2026-09-10, found while drawing the hi-fi frames):** this spec said "four" rules throughout while its own layout sketch listed **five**. V-12 is the authority and it carries five independent conditions — *min 8 chars; upper, lower, digit, special* — so the checklist is five rows and every count in this file has been corrected. Built as "four", one V-12 condition would have had no row and no way to be reported

### ST-02 Rules not met

- **When** submit is attempted with a password missing one or more of the five V-12 rules, with either field empty, or with the two entries not matching — caught in the browser before any request
- **Shows** the unmet rules still listed rather than collapsed into one message, so the remaining work stays visible at a glance — but **now in their blocking look**: the hollow `○` becomes the error icon, the text takes `--c-danger-ink`, and the field's edge changes with it. Rules already satisfied keep their met `✓` and do not move. A mismatch is reported beneath the confirm field as *"These don't match."* Each marked field carries an icon and a border change, never colour alone
- **The checklist is the field's message.** The new-password field changes its edge and carries the invalid icon, but no message sits beneath it: the rules already say, line by line, what is missing. A second sentence restating them would either duplicate the list or invent a rule nobody wrote. The only field-level message on this state is *"These don't match."* beneath the confirm field (drawn 2026-09-10)
- **Note (added 2026-09-10):** the checklist therefore has **three** looks, not two — met, pending, and blocking. The spec previously said the unmet rules stay "marked unmet", which would have made a refused submit *pixel-identical* to the state before it: the user presses Save, nothing changes, and the screen reads as broken. Pending and blocking differ by icon and by text, so the change is legible without colour vision
- **Can do** correct and resubmit. Focus moves to the first field needing attention

### ST-03 Same as the password you were given

- **When** the server rejects the new password because it matches the administrator-set one — the only check this screen cannot make in the browser
- **Shows** the refusal naming the rule it broke: *"That's the password your admin gave you. Choose a different one — the point is that only you know it."* Both fields are cleared, because whatever was typed is now known to be the wrong value
- **Can do** choose a different password and resubmit

### ST-04 Saving

- **When** the change is in flight
- **Shows** **Save and continue** busy with its label kept; both fields read-only; no layout shift. Double submission prevented
- **Can do** wait

### ST-05 Saved

- **When** the password is changed
- **Shows** the screen gives way to the app — SCR-002 for an Employee, SCR-005 for an Admin — carrying a brief confirmation: *"Password saved. This is the one to use from now on."* The old administrator-set password stops working immediately, which the confirmation implies rather than belabours
- **Drawn as** the destination screen carrying the toast, not as this screen. Same treatment as SCR-003 ST-11, which has the identical shape and was built that way. **The employee path (SCR-002) is what gets drawn**; the admin path lands on SCR-005, which has no `HF /` frames yet, and building the whole admin shell in colour to host one toast belongs to SCR-005's own build rather than this one. Carried into the handoff below so it is picked up there
- **Can do** get on with the thing they signed in to do

### ST-06 Save failed

- **When** the request fails for a reason that is not ST-03: server error, timeout, lost connection
- **Shows** an error region stating what is still true: *"We couldn't save that just now. The password you signed in with still works. Try again."* Both fields retain their contents — a compliant password retyped from memory tends to be a weaker one
- **Can do** retry. Sign-out remains available, and the temporary password still works, so nobody is stranded here by an outage


**The desk backdrop from SCR-001 appears here at 1280 only** (added 2026-09-10).
This form is too tall to give up a bottom band at 768 or 360 without buying a
scroll with decoration — see the decisions table. At 1280 it sits in the right
margin and **Sign out** clears it by 24px.

## Components

| Component          | Used for                                                                | States it appears in        |
| ------------------ | ----------------------------------------------------------------------- | --------------------------- |
| `card`             | The form container, matching SCR-001                                    | ST-01 – ST-06               |
| `password-field`   | **New password** with show/hide; **Confirm new password**                | ST-01 – ST-04, ST-06        |
| `policy-checklist` | The five V-12 rules, met and unmet — shared with SCR-009                 | ST-01 – ST-04, ST-06        |
| `button`           | **Save and continue**                                                    | ST-01 – ST-06               |
| `alert`            | `error` for the reuse refusal and for a failed save                      | ST-03, ST-06                |
| `spinner`          | Inline busy indicator inside the button                                  | ST-04                       |
| `toast`            | The confirmation carried onto the destination screen                     | ST-05                       |
| `button` (ghost)   | **Sign out**, beneath the card and outside it                            | ST-01 – ST-06               |
| `login-backdrop`   | Decorative desk line-drawing on the page ground, behind the card        | ST-01 – ST-04, ST-06 (1280 only) |

No `app-shell` on this screen — the navigation appears only once the account is the holder's own.

## Interaction and accessibility

- **Keyboard:** new password → show/hide → confirm → **Save and continue** → **Sign out**. Enter submits from either field. **Five** tab stops. **Sign out** is last on purpose: it is an escape hatch, not a step, and it must never sit between the fields and the action that completes them
- **Focus:** visible ring on every control (`--c-focus-ring`). After ST-02 focus goes to the first field needing attention; after ST-03 to the new-password field, which has been cleared. **On an invalid field the ring takes `--c-danger-border`** (corrected 2026-09-10 in review) — see SCR-001 for the reasoning. ST-02 is where this shows: the new-password field is both blocking and focused, and it must read as one red state, not as a red field inside a green ring
- **Non-colour signalling:** **each policy rule shows a met/unmet icon and stays readable as text** — a checklist told apart only by green and grey ticks is unusable for a colour-blind user, and this one stands between them and the product. Invalid fields carry icons and text messages, not just borders
- **Announcements:** the checklist is a live region announcing each rule as it is satisfied (*"A number: met"*), so a screen-reader user knows when they are done without re-reading five lines. ST-03 and ST-06 are assertive. The heading is announced on arrival, so the reason for the unexpected screen is the first thing heard
- **Password managers:** `autocomplete="new-password"` on both fields — this *is* the account holder's own credential, unlike the field on SCR-009, so a manager should be encouraged to save it. Given the no-self-service-reset warning, a saved password is the best outcome available
- **At 360px:** the card is the page. The checklist sits directly beneath the field it describes and stays visible with the keyboard raised (NFR-004)

## Structural decisions

| Decision                                                                    | Rationale                                                                                                                                                                                                   | Alternative rejected                                                                                                                                     |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Its own screen, not a state on SCR-001                                        | Six states, five policy rules and a distinct job. Inside the sign-in card they would be states nobody counts — the thing the numbering exists to prevent                                                    | A step inside SCR-001. One less file, and five hidden states                                                                                              |
| Explains why the screen appeared, before asking for anything                   | Nobody navigated here. An unexplained password form after a successful sign-in reads as a failure or a phishing page (PRIN-1)                                                                               | A bare "Set your password" heading. Shorter, and it makes a legitimate screen look suspicious                                                              |
| All five rules shown before the first keystroke                                | Same reasoning as SCR-009: V-12 has five independent requirements, and revealing them one failure at a time turns one attempt into five. Here it is worse — the user is locked out of the product until they pass | Validating on blur, first failure only. Standard, and adversarial at the least forgiving moment                                                            |
| Reusing the administrator-set password is refused (ST-03)                       | The decision's entire purpose is that the administrator stops holding a working credential. Accepting the same value would satisfy the flow and defeat the reason for it                                     | Allowing it. Fewer states, and the screen becomes ceremony                                                                                                 |
| The no-self-service-reset warning is on this screen, not only on SCR-001         | This is the one moment someone is actively choosing a password. SCR-001's version of this message is for people who have already forgotten; this one is for people about to                                  | Leaving it to SCR-001. Consistent, and it arrives after it can help                                                                                        |
| Sign-out available, and the temporary password keeps working                     | An outage on ST-06, or an interruption, must not strand someone outside the product. The temporary password is still the credential of record until this screen succeeds                                     | Invalidating the old password on arrival. Tidier, and it can lock a new starter out on their first morning                                                  |
| No password field on SCR-009's edit mode, and no route here voluntarily           | Changing a password on purpose is self-service, which BRD-001 §10 puts out of scope. This screen is forced, or it is not reached                                                                            | A "change my password" link on SCR-004. Useful, and it quietly adds the self-service reset that was explicitly excluded — **worth raising as a change request if wanted** |
| **Sign out** is a quiet text link *beneath* the card, not inside it                | Decided 2026-09-10. The spec has always promised sign-out here — it is what stops an outage on ST-06 stranding a new starter outside the product on their first morning — but no layout and no component ever gave it a home, so the frame could not have kept the promise. Outside the card it is reachable without competing with **Save and continue**, and its position says what it is: a way out, not a step | Inside the card beneath the primary action (two actions in one card, one of which abandons the task); a top-bar sign-out (there is no shell on this screen, and adding one contradicts "the shell appears only once the account is the holder's own") |
| The policy checklist has three looks — met, pending, blocking                       | Pending and blocking cannot be the same, or a refused submit changes nothing on screen and the button reads as dead. Pending and *error* cannot be the same either, or a form nobody has touched yet appears to have five faults in it. The distinction is carried by icon and by text, so it survives without colour vision (NFR-008)                                                                        | Two looks only, as originally written. Fewer variants on `policy-checklist`, and one of the two failure modes above is then guaranteed |
| The desk backdrop is drawn at 1280 only, not at 768 or 360 | Added 2026-09-10. SCR-001 carries it at all three widths; this screen cannot. Its form is five policy rules, two fields, a warning and a sign-out link — about 836px at 768 — so reserving a bottom band would push a page that currently fits into a scroll that exists **only** to show decoration, on the one screen a new starter cannot skip (PRIN-4). At 1280 the art lives in right margin the form was never going to use, so it costs nothing, and **Sign out** clears it by 24px. The decoration yields; the form does not | Drawing it at every width and letting the frames grow. Consistent with SCR-001, and it buys a scroll with decoration. **Worth your veto at review if you would rather have the art everywhere and accept the taller page** |

## Conflicts and open questions

| #   | Conflict / question                                                                                                                                                                                                                                                                       | Between            | Owner         | Status                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | This entire screen rests on a decision, not on an approved requirement. BRD-001 has no requirement for a forced password change; REQ-018 and REQ-021 create administrator-set passwords and say nothing about replacing them.                                                              | design vs BRD-001  | PO/BA (`/ba`) | **Closed 2026-09-08 — codified as REQ-029.** BRD-001 now carries REQ-029 (the forced change), BR-001.17 (the full rule, including that the administrator-set password stays valid until the change succeeds) and V-15 (the reuse refusal behind ST-03). Every state on this screen now traces to an approved requirement |

## Designer handoff

Tokens: `inception/design/tokens.json` (W3C DTCG — importable into Figma via Tokens Studio, Penpot, and others). Draw one frame per `ST-##` above; the numbering is the checklist. Name each frame `WF / SCR-010 · Set your password / ST-## <state>` (`HF /` once styled) — the name is the only thing that ties a frame back to this spec. Grid, spacing, and the per-frame checklist: `inception/design/wireframe-rules.md`.

Six states at **360px, 768px and 1280px** (NFR-004), including one extra 360px frame with the keyboard raised and the checklist still visible. **19 frames.** The card matches SCR-001's — draw it from that frame so the arrival reads as continuous.

**No new colour role is needed** (checked 2026-09-10). The checklist's three looks are already covered: met on `--c-success-*`, pending on `--c-text-muted`, blocking on `--c-danger-ink` — the danger family used here as a status, so it keeps `--c-border` rather than `--c-border-strong`. Field edges are `--c-border-control`; focus is the ring plus its `--bw-2` offset gap; the card takes `--c-border-strong` and `shadow/1` on the page ground; ST-04's in-button spinner takes the **button's label colour**, never a text colour.

Two things to carry into a later build rather than this one: **ST-05's admin path**, which lands on SCR-005 and should be drawn when that screen is built; and `policy-checklist` itself, which is **built here first and inherited by SCR-009** — so build it as a component with a met/pending/blocking axis, not as three hand-assembled lists.

**Built 2026-09-10 — 19 `HF /` frames.** Five card states at 360, 768 and 1280, plus ST-05
drawn on SCR-002 carrying the toast at all three widths, plus the extra 360 frame with the
keyboard raised: the checklist ends 38px clear of the keyboard, so NFR-004’s promise is a
measured fact rather than a claim. `policy-checklist` was built as specified — a
`Policy rule` set with a met/pending/blocking axis and a `Policy checklist` wrapper that
holds the five rows — and it is ready for SCR-009 to inherit. **The admin path of ST-05 is still outstanding** and belongs to
SCR-005’s own build, exactly as this section says. Design system & mockups file:
<https://www.figma.com/design/xjFVgBbMrJUl7Ys3EX3Cbn>.
