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

**The card is 400px wide at both 768 and 1280, centred on both axes, and it does not grow with the breakpoint** (decided 2026-09-10 by the designer). This screen and SCR-010 are the only two with no `app-shell`, so the grid's inner columns — 1104 at desktop, 648 at tablet — measure a content region these screens do not have. A 1104px sign-in form is a reading line four times longer than anything written on it. 400px sets every field at a comfortable measure and holds the longest string on the screen, the help text, in two lines. SCR-010 uses the same 400px card, so the forced password step reads as the same place rather than a new one. At 360 the card is the page: the 328px inner column inside 16px page margins.

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
- **Shows** an error region above the fields — *"We can't reach the booking service right now. Try again in a moment."* — carrying a **Try again** control **inside the region**, beneath the message and aligned to its right edge. **Sign in** stays below, present and enabled. Both fields keep their contents, password included, so a retry is one tap
- **Can do** retry, or wait. Nothing the user typed is lost

**The page ground carries a decorative line-drawing of a desk** (added 2026-09-10).
It sits behind the card and is purely decorative — it never carries meaning, never
encodes a state, and no text is set in it. At 1280 it is anchored bottom-**right**,
beside the content column; at 768 and 360 there is no side margin, so it becomes a
bottom band and the frame reserves that band as padding, centring the column in
what remains. Content keeps at least 32px clear of it at every width. Artwork:
`inception/design/assets/login-backdrop.svg` (geometry only); colour:
`--c-illustration-line`; placement: `wireframe-rules.md`.

## Components

| Component        | Used for                                                       | States it appears in         |
| ---------------- | -------------------------------------------------------------- | ---------------------------- |
| `text-field`     | Email input, with label, error slot and invalid styling         | ST-01 – ST-05                |
| `password-field` | Password input with a show/hide toggle                          | ST-01 – ST-05                |
| `button`         | Primary **Sign in**; also **Try again** in ST-05                | ST-01 – ST-05                |
| `alert`          | Form-level error region (`error` variant)                       | ST-04, ST-05                 |
| `spinner`        | Inline busy indicator inside the button                         | ST-03                        |
| `card`           | The form container                                              | ST-01 – ST-05                |
| `login-backdrop` | Decorative desk line-drawing on the page ground, behind the card | ST-01 – ST-05                |

## Interaction and accessibility

- **Keyboard:** tab order is email → password → show/hide → **Sign in**, and in ST-05 the alert's **Try again** precedes them all, because it sits above the fields. Enter submits from either field. Nothing on this screen requires a pointer. **Corrected 2026-09-10:** this line used to place show/hide *before* the password field. That contradicts the layout above — the toggle sits inside the password field, at its right edge — and it contradicts SCR-010, which orders the same pair correctly. Built as written, the tab after email would have landed on a visibility toggle for a field the user had not reached yet
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
| A fixed 400px card at every width above 360, rather than a grid-derived one                        | Decided 2026-09-10 by the designer. The grid describes the shell, and this screen has none; the inner-column widths that govern every other screen measure nothing here. A form is bounded by its reading line, not by the viewport. Fixing the width also makes SCR-001 and SCR-010 the same card at three sizes, which is what makes the forced password step read as one continuous arrival | A card that grows with the breakpoint. It uses the space a large monitor offers, and it makes the two auth screens stop being the same object; the password checklist would reflow differently at each width for no gain |
| **Try again** sits inside ST-05's alert, and **Sign in** stays below it                            | They submit the same thing, and the redundancy is deliberate: after a failure the eye is on the alert, and on a phone the button may be below the fold. A recovery path is the wrong place to make someone hunt for the control they already know                                                                          | A single control — dropping Try again and letting **Sign in** be the retry. One less button, and it puts the recovery action somewhere other than where the explanation is. **Worth your veto at review if you would rather have the one button** |
| A decorative desk line-drawing sits on the page ground behind the card | Added 2026-09-10 at the designer’s request. These two screens were the only ones with a bare ground, and an empty beige field is the weakest thing about the first screen anyone sees. It is a **ground**: purely decorative, no meaning, no state, no text set in it, so WCAG 1.4.3 and 1.4.11 do not apply to it, and the opaque card may cover as much of it as it likes. At 1280 it sits bottom-**right**, beside the column; at 768 and 360 it becomes a bottom band the frame reserves as padding. Every frame keeps ≥ 32px between content and art — the two 360 frames carrying an alert (ST-04, ST-05) grew ~130px to hold that. Colour comes from `--c-illustration-line`; the artwork file carries no colour at all | Pinning the art to the frame bottom regardless of the column. It reads fine on the three short states and collides with the column on the two tall ones — the kind of fault that appears in some states and not others, which is exactly the kind nobody catches until build |

## Conflicts and open questions

Both rows resolved 2026-09-07. Row 2 adds a requirement to BRD-001 and is listed in the PR handover for `/ba`.

| #   | Conflict / question                                                                                                                                                                                                                | Between                     | Owner            | Status   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------- | -------- |
| 1   | Should a deactivated account be told it is deactivated? The generic message (ST-04) protects against account enumeration; a specific one helps the one honest case. BRD-001 V-01 groups them but does not say what the user is told. | REQ-005 vs security posture | PO / security    | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — stay generic.** One message covers a wrong password and a deactivated account, so the screen never confirms which email addresses are real accounts. ST-04's copy stands as written, including the pointer to the office admin. Confirms V-01; no BRD change |
| 2   | How long does a session last, and is it extended by use? Nothing in BRD-001 says. It decides whether this screen is seen weekly or daily, and whether a "keep me signed in" control is warranted.                                   | REQ-002, NFR-003            | PO / Architect   | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — 30 days, extended by use.** Right for a low-sensitivity internal tool, and it keeps a password prompt out of the cancellation path. **New non-functional requirement — `/ba` must add it to BRD-001**; the accepted risk is that a lost unlocked phone can book and cancel desks |

The session decision also removes the one control this screen was holding open, and the first-sign-in decision adds SCR-010 behind it.

## Designer handoff

Tokens: `inception/design/tokens.json` (W3C DTCG — importable into Figma via Tokens Studio, Penpot, and others). Draw one frame per `ST-##` above; the numbering is the checklist. Name each frame `WF / SCR-001 · Sign in / ST-## <state>` (`HF /` once styled) — the name is the only thing that ties a frame back to this spec. Grid, spacing, and the per-frame checklist: `inception/design/wireframe-rules.md`.

Five states, and draw each at **360px, 768px and 1280px** — NFR-004 names all three as verification widths, so a frame at one width is a third of a state. **15 frames.**

**Every treatment this screen needs already has a token** (checked 2026-09-10) — no new colour role is required, unlike SCR-002's build. Specifically: field edges are `--c-border-control` and not `--c-border`; focus is the ring plus its `--bw-2` offset gap; the card sits on the page ground with `--c-border-strong` and `shadow/1`; the ST-04 and ST-05 alerts use the danger family as a status chip, keeping `--c-border`; and ST-03's in-button spinner takes the **button's label colour**, never a text colour — the defect the SCR-002 build found, where the only cue that a request is in flight sat at 1.02:1 on the primary button.

Draw ST-01 at 400px first and vary the rest from it; the card geometry is identical across all five states, and only the alert region's presence changes the height.

**Built 2026-09-10 — 15 `HF /` frames, all five states at 360, 768 and 1280.** The card is a
`Sign in card` component set with one variant per `ST-##`, so the three widths of a state
cannot drift apart; the frame supplies only the page ground and the lockup. Three library
components were built for this screen and SCR-010 and did not exist before: `Text field`,
`Password field` and (on SCR-010) `Policy checklist`. No new colour role was needed, as
predicted above. Design system & mockups file:
<https://www.figma.com/design/xjFVgBbMrJUl7Ys3EX3Cbn>.
