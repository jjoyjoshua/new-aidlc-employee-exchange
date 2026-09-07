# SCR-010 — Set your password

> Approval = Gate 1 review of this file's PR. A state is "designed" when it is numbered here, listed in the manifest, and drawn as its own frame in the design tool (`WF / SCR-### · <screen> / ST-## <state>`).

|                 |                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Serves**      | — (stories not yet drafted; the `US ↔ SCR` edge is added by `/ba` in Discovery step 3)                                                  |
| **Traces to**   | REQ-002, REQ-018, REQ-021, NFR-003, NFR-004 — **plus a new requirement pending** (see Conflicts, row 1)                                 |
| **Surface**     | `apps/ui` `features/auth` — `/set-password`, forced after sign-in while the account's password is administrator-set                      |
| **Persona**     | P-1 Priya on her first morning, and anyone whose password was just reset ([research](../research/BRD-001-employee-desk-booking.md))     |
| **Primary job** | Replace the password somebody else chose for me with one only I know, and get on with booking a desk                                    |
| **Principle**   | PRIN-1 — says why you are here before asking for anything; PRIN-3 — a refused password says which rule it missed, not "invalid"          |
| **Status**      | draft — awaiting designer review                                                                                                        |

## Purpose

This screen exists because of a decision taken on 2026-09-07 (Joy Joshua, PO/BA): a password set by an administrator must be changed by its owner at first use. Until that decision, an administrator who created an account retained a working credential for it indefinitely — including after they stopped being an administrator.

It is reached on exactly two occasions, both of which mean *somebody else currently knows your password*: the first sign-in after an account is created (REQ-018), and the first sign-in after an administrator resets it (REQ-021). It is not a settings screen and it cannot be reached voluntarily — with no self-service reset in this release (BRD-001 §10), there is no route here for someone who simply wants a new password.

It is deliberately **not** a state on SCR-001. Sign-in and choosing a password are different jobs with different failure modes, and burying a four-rule policy checklist inside the sign-in card would hide five states nobody would count.

## Place in the flow

- **Reached from:** SCR-001 — automatically, when the signed-in account's password is still the administrator-set one
- **Leads to:** SCR-002 (role = Employee), SCR-005 (role = Admin)

There is no way past this screen other than through it, and no navigation shell around it — the app shell appears only once the password is the account holder's own. Sign-out is available, and returns to SCR-001 with the temporary password still valid, so nobody can be locked out by abandoning this step.

## Layout

Single centred column, one card, matching SCR-001 so the transition reads as one continuous arrival rather than a new place.

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
│  │ ✓ 8 characters or more        │  │  all four rules visible
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
└─────────────────────────────────────┘
```

The closing warning is the one piece of copy on this screen that people will remember, and it is the truthful consequence of BRD-001 §10. Someone choosing a password they will forget deserves to know now, not in three weeks.

## States

### ST-01 Default

- **When** the screen loads after a sign-in with an administrator-set password
- **Shows** the explanation of why this screen appeared; a **New password** field (focused) with a show/hide control and all four policy rules from V-12 listed as an unmet checklist; a **Confirm new password** field; an enabled **Save and continue**; and the no-self-service-reset warning
- **Can do** type a password, toggle visibility, submit

### ST-02 Rules not met

- **When** submit is attempted with a password missing one or more of the four V-12 rules, with either field empty, or with the two entries not matching — caught in the browser before any request
- **Shows** unmet rules still marked unmet in the checklist rather than collapsed into one message, so the remaining work is visible at a glance; a mismatch is reported beneath the confirm field as *"These don't match."* Each marked field carries an icon and a border change, never colour alone
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
- **Can do** get on with the thing they signed in to do

### ST-06 Save failed

- **When** the request fails for a reason that is not ST-03: server error, timeout, lost connection
- **Shows** an error region stating what is still true: *"We couldn't save that just now. The password you signed in with still works. Try again."* Both fields retain their contents — a compliant password retyped from memory tends to be a weaker one
- **Can do** retry. Sign-out remains available, and the temporary password still works, so nobody is stranded here by an outage

## Components

| Component          | Used for                                                                | States it appears in        |
| ------------------ | ----------------------------------------------------------------------- | --------------------------- |
| `card`             | The form container, matching SCR-001                                    | ST-01 – ST-06               |
| `password-field`   | **New password** with show/hide; **Confirm new password**                | ST-01 – ST-04, ST-06        |
| `policy-checklist` | The four V-12 rules, met and unmet — shared with SCR-009                 | ST-01 – ST-04, ST-06        |
| `button`           | **Save and continue**                                                    | ST-01 – ST-06               |
| `alert`            | `error` for the reuse refusal and for a failed save                      | ST-03, ST-06                |
| `spinner`          | Inline busy indicator inside the button                                  | ST-04                       |

No `app-shell` on this screen — the navigation appears only once the account is the holder's own.

## Interaction and accessibility

- **Keyboard:** new password → show/hide → confirm → **Save and continue**. Enter submits from either field. Four tab stops
- **Focus:** visible ring on every control (`--c-focus-ring`). After ST-02 focus goes to the first field needing attention; after ST-03 to the new-password field, which has been cleared
- **Non-colour signalling:** **each policy rule shows a met/unmet icon and stays readable as text** — a checklist told apart only by green and grey ticks is unusable for a colour-blind user, and this one stands between them and the product. Invalid fields carry icons and text messages, not just borders
- **Announcements:** the checklist is a live region announcing each rule as it is satisfied (*"A number: met"*), so a screen-reader user knows when they are done without re-reading five lines. ST-03 and ST-06 are assertive. The heading is announced on arrival, so the reason for the unexpected screen is the first thing heard
- **Password managers:** `autocomplete="new-password"` on both fields — this *is* the account holder's own credential, unlike the field on SCR-009, so a manager should be encouraged to save it. Given the no-self-service-reset warning, a saved password is the best outcome available
- **At 360px:** the card is the page. The checklist sits directly beneath the field it describes and stays visible with the keyboard raised (NFR-004)

## Structural decisions

| Decision                                                                    | Rationale                                                                                                                                                                                                   | Alternative rejected                                                                                                                                     |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Its own screen, not a state on SCR-001                                        | Six states, four policy rules and a distinct job. Inside the sign-in card they would be states nobody counts — the thing the numbering exists to prevent                                                    | A step inside SCR-001. One less file, and five hidden states                                                                                              |
| Explains why the screen appeared, before asking for anything                   | Nobody navigated here. An unexplained password form after a successful sign-in reads as a failure or a phishing page (PRIN-1)                                                                               | A bare "Set your password" heading. Shorter, and it makes a legitimate screen look suspicious                                                              |
| All four rules shown before the first keystroke                                | Same reasoning as SCR-009: V-12 has four independent requirements, and revealing them one failure at a time turns one attempt into five. Here it is worse — the user is locked out of the product until they pass | Validating on blur, first failure only. Standard, and adversarial at the least forgiving moment                                                            |
| Reusing the administrator-set password is refused (ST-03)                       | The decision's entire purpose is that the administrator stops holding a working credential. Accepting the same value would satisfy the flow and defeat the reason for it                                     | Allowing it. Fewer states, and the screen becomes ceremony                                                                                                 |
| The no-self-service-reset warning is on this screen, not only on SCR-001         | This is the one moment someone is actively choosing a password. SCR-001's version of this message is for people who have already forgotten; this one is for people about to                                  | Leaving it to SCR-001. Consistent, and it arrives after it can help                                                                                        |
| Sign-out available, and the temporary password keeps working                     | An outage on ST-06, or an interruption, must not strand someone outside the product. The temporary password is still the credential of record until this screen succeeds                                     | Invalidating the old password on arrival. Tidier, and it can lock a new starter out on their first morning                                                  |
| No password field on SCR-009's edit mode, and no route here voluntarily           | Changing a password on purpose is self-service, which BRD-001 §10 puts out of scope. This screen is forced, or it is not reached                                                                            | A "change my password" link on SCR-004. Useful, and it quietly adds the self-service reset that was explicitly excluded — **worth raising as a change request if wanted** |

## Conflicts and open questions

| #   | Conflict / question                                                                                                                                                                                                                                                                       | Between            | Owner         | Status                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | This entire screen rests on a decision, not on an approved requirement. BRD-001 has no requirement for a forced password change; REQ-018 and REQ-021 create administrator-set passwords and say nothing about replacing them.                                                              | design vs BRD-001  | PO/BA (`/ba`) | **Decided 2026-09-07 (Joy Joshua, PO/BA) — needs codifying.** `/ba` must add the requirement to BRD-001 before this is built, or the screen traces to a rule that exists only in this file. Listed in the PR handover |

## Designer handoff

Tokens: `inception/design/tokens.json` (W3C DTCG — importable into Figma via Tokens Studio, Penpot, and others). Draw one frame per `ST-##` above; the numbering is the checklist. Name each frame `WF / SCR-010 · Set your password / ST-## <state>` (`HF /` once styled) — the name is the only thing that ties a frame back to this spec. Grid, spacing, and the per-frame checklist: `inception/design/wireframe-rules.md`.

Six states at **360px and 1280px** (NFR-004), including one 360px frame with the keyboard raised and the checklist still visible. The card matches SCR-001's — draw it from that frame so the arrival reads as continuous.
