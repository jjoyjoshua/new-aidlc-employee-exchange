# SCR-001 — Sign in

> Approval = Gate 1 review of this file's PR. A state is "designed" when it is numbered here, listed in the manifest, and drawn as its own frame in the design tool (`WF / SCR-### · <screen> / ST-## <state>`).

|                 |                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Serves**      | — (stories not yet drafted; the `US ↔ SCR` edge is added by `/ba` in Discovery step 3)                                    |
| **Traces to**   | REQ-001, REQ-002, REQ-005, NFR-003, NFR-004, NFR-008                                                                              |
| **Surface**     | `apps/ui` `features/auth` — `/sign-in`, and the redirect target for any unauthenticated request                            |
| **Persona**     | P-1 Priya and P-2 Marcus ([research](../research/BRD-001-employee-desk-booking.md)) — the only screen both roles share    |
| **Primary job** | Get into the product with the email and password I have, and understand what to do if they don't work                     |
| **Principle**   | PRIN-5 — the failure message tells the truth about what will and won't help; PRIN-4 — 360px first                         |
| **Status**      | draft — awaiting designer review                                                                                          |

## Purpose

The employee or administrator proves who they are with an email address and a password (REQ-002) and lands in the shell for their role. Done, for them, is being inside. The screen's harder job is the failure case: there is no self-service password reset in this release (BRD-001 §10), so a person who cannot get in has exactly one route — the office administrator — and this screen is the only place that can tell them so.

## Place in the flow

- **Reached from:** `entry` — the root an unauthenticated user lands on, and where every expired session returns
- **Leads to:** SCR-010 (whenever the account's password is still the administrator-set one — checked before the shell renders), then SCR-002 (role = Employee) or SCR-005 (role = Admin)

Sign-out from either shell returns here (REQ-003, specified on SCR-002 and SCR-005).

## Layout

Single centred column, one card. No marketing, no illustration, no second column — this is an internal tool people reach with intent. At 360px the card is the page with page margins only.

```
┌─────────────────────────────────────┐
│                                     │
│         Desk Booking                │  product name, --t-heading-lg
│         Sign in to book a desk       │  --t-body, --c-text-secondary
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Email                         │  │  label above field, always visible
│  │ [                          ]  │  │
│  │                               │  │
│  │ Password                      │  │
│  │ [                    ] [show] │  │
│  │                               │  │
│  │ [       Sign in       ]       │  │  full-width, --control-lg
│  │                               │  │
│  │ Trouble signing in?           │  │  static help text, not a link —
│  │ Contact your office admin.    │  │  there is no self-service reset
│  └───────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

## States

### ST-01 Default

- **When** the screen loads with no prior attempt
- **Shows** empty email and password fields, both labelled; a show/hide control on the password; an enabled **Sign in** button; the static "contact your office admin" help text
- **Can do** type into either field, toggle password visibility, submit (by button or Enter from either field)

### ST-02 Field validation error

- **When** submit is attempted with an empty field, or an email that is not a plausible address — caught in the browser, before any request
- **Shows** the message beneath the offending field, the field marked with an icon and a border change (never colour alone — NFR-008, and the a11y note below); other fields untouched; the button still enabled
- **Can do** correct the field and resubmit. Focus moves to the first field with an error

### ST-03 Submitting

- **When** a valid-looking submission is in flight
- **Shows** the button in a busy state with its label retained plus a spinner; both fields read-only; no layout shift
- **Can do** wait. Resubmission is prevented while in flight — a double-tap on a slow phone connection must not send two attempts

### ST-04 Rejected

- **When** the credentials are unknown, the password is wrong, **or** the account is deactivated (REQ-005, V-01) — one message covers all three, deliberately (see Structural decisions)
- **Shows** an error region above the fields: *"That email and password don't match an active account. If you think your account should be active, contact your office admin."* The password field is cleared; email is kept
- **Can do** retype the password and resubmit. Focus moves to the password field, and the error region is announced

### ST-05 Service unavailable

- **When** the request fails to reach the server, times out, or returns a server error — a different cause from ST-04 and it must not read like a rejection
- **Shows** *"We can't reach the booking service right now. Try again in a moment."* with a **Try again** control; both fields keep their contents, password included, so a retry is one tap
- **Can do** retry, or wait. Nothing the user typed is lost

## Components

| Component        | Used for                                                       | States it appears in         |
| ---------------- | -------------------------------------------------------------- | ---------------------------- |
| `text-field`     | Email input, with label, error slot and invalid styling         | ST-01 – ST-05                |
| `password-field` | Password input with a show/hide toggle                          | ST-01 – ST-05                |
| `button`         | Primary **Sign in**; also **Try again** in ST-05                | ST-01 – ST-05                |
| `alert`          | Form-level error region (`error` variant)                       | ST-04, ST-05                 |
| `spinner`        | Inline busy indicator inside the button                         | ST-03                        |
| `card`           | The form container                                              | ST-01 – ST-05                |

## Interaction and accessibility

- **Keyboard:** tab order is email → show/hide → password → Sign in → (error region's Try again, when present). Enter submits from either field. Nothing on this screen requires a pointer
- **Focus:** visible ring on every interactive element (`--c-focus-ring`). After ST-02 focus moves to the first invalid field; after ST-04 to the password field; after ST-05 focus stays where it was and the alert is announced without stealing it
- **Non-colour signalling:** an invalid field carries an icon and its message in text as well as a border change; the form-level alert carries an icon and the word describing the problem. A user who sees no colour difference loses nothing
- **Announcements:** the error region is a live region (`role="alert"`), announced once when it appears. The busy button announces its state change. The password show/hide control announces which mode it is in, not just that it was pressed
- **Autofill and password managers:** standard autocomplete hints on both fields (`username`, `current-password`) — an internal tool people sign into weekly is exactly where a manager should work
- **Security surface:** HTTPS in deployed environments is required (NFR-003); the password is never placed in a URL, and the show/hide toggle does not persist across loads

## Structural decisions

| Decision                                                                                     | Rationale                                                                                                                                                                                                                                                                                    | Alternative rejected                                                                                                                                                             |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One message for wrong password and deactivated account (ST-04)                                | V-01 groups them, and distinguishing them tells an attacker which addresses are real accounts. The message carries the useful half anyway — "if you think your account should be active, contact your office admin" — so the deactivated leaver still learns where to go without the system confirming their account exists | A distinct "your account has been deactivated" message. Kinder to the one legitimate case, an account-enumeration oracle in every other. **Flagged as open question 1** — this is a security-policy call, not mine |
| Static help text, not a "Forgot password?" link                                                | Self-service reset is out of scope (BRD-001 §10); a link that leads nowhere is worse than no link. PRIN-5 — never imply a route that does not exist                                                                                                                                            | A link opening a "contact your admin" page. One more screen to say one sentence                                                                                                  |
| Password retained on service error (ST-05), cleared on rejection (ST-04)                       | ST-05 is not the user's fault, so making them retype is punishment for our outage. ST-04 probably means the password was wrong, so keeping it invites a second identical attempt                                                                                                              | Clearing on both. Consistent and slightly hostile                                                                                                                                |
| Role decides the landing screen, silently — no role picker                                     | REQ-004 gives each user exactly one role, so a picker would offer a choice nobody has                                                                                                                                                                                                         | A post-sign-in "continue as…" step                                                                                                                                                |
| No "remember me" control                                                                       | Sessions last 30 days and are extended by use (decided 2026-09-07 (Joy Joshua, PO/BA)), so the default already is "remember me" — a checkbox would offer control over something nobody needs to change. Cancelling a booking must never be gated behind a password prompt (INSIGHT-04)                                  | A remember-me checkbox (a control with one sensible setting); a short session with re-authentication (adds friction to the act that frees desks)                                  |
| A first sign-in with an administrator-set password goes to SCR-010, not into the app             | Decided 2026-09-07 (Joy Joshua, PO/BA): the person who created the account must stop holding a working credential for it. The check happens before the shell renders, so there is no window in which the app is usable on somebody else's password                                                                       | Prompting later, or on a settings screen. Skippable, and it leaves the credential shared for as long as the user ignores it                                                       |

## Conflicts and open questions

Both rows resolved 2026-09-07. Row 2 adds a requirement to BRD-001 and is listed in the PR handover for `/ba`.

| #   | Conflict / question                                                                                                                                                                                                                | Between                     | Owner            | Status   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------- | -------- |
| 1   | Should a deactivated account be told it is deactivated? The generic message (ST-04) protects against account enumeration; a specific one helps the one honest case. BRD-001 V-01 groups them but does not say what the user is told. | REQ-005 vs security posture | PO / security    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — stay generic.** One message covers a wrong password and a deactivated account, so the screen never confirms which email addresses are real accounts. ST-04's copy stands as written, including the pointer to the office admin. Confirms V-01; no BRD change |
| 2   | How long does a session last, and is it extended by use? Nothing in BRD-001 says. It decides whether this screen is seen weekly or daily, and whether a "keep me signed in" control is warranted.                                   | REQ-002, NFR-003            | PO / Architect   | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — 30 days, extended by use.** Right for a low-sensitivity internal tool, and it keeps a password prompt out of the cancellation path. **New non-functional requirement — `/ba` must add it to BRD-001**; the accepted risk is that a lost unlocked phone can book and cancel desks |

The session decision also removes the one control this screen was holding open, and the first-sign-in decision adds SCR-010 behind it.

## Designer handoff

Tokens: `inception/design/tokens.json` (W3C DTCG — importable into Figma via Tokens Studio, Penpot, and others). Draw one frame per `ST-##` above; the numbering is the checklist. Name each frame `WF / SCR-001 · Sign in / ST-## <state>` (`HF /` once styled) — the name is the only thing that ties a frame back to this spec. Grid, spacing, and the per-frame checklist: `inception/design/wireframe-rules.md`.

Five states, and draw each at **360px, 768px and 1280px** — NFR-004 names all three as verification widths, so a frame at one width is a third of a state.
