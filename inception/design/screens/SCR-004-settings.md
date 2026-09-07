# SCR-004 — Settings

> Approval = Gate 1 review of this file's PR. A state is "designed" when it is numbered here, listed in the manifest, and drawn as its own frame in the design tool (`WF / SCR-### · <screen> / ST-## <state>`).

|                 |                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Serves**      | — (stories not yet drafted; the `US ↔ SCR` edge is added by `/ba` in Discovery step 3)                               |
| **Traces to**   | REQ-003, REQ-026, REQ-027, NFR-004, NFR-006                                                                         |
| **Surface**     | `apps/ui` `features/account` — `/settings`, reached from the account menu in the employee shell                     |
| **Persona**     | P-1 Priya ([research](../research/BRD-001-employee-desk-booking.md))                                                |
| **Primary job** | Turn browser alerts on (or off again), and understand what I'll actually receive either way                          |
| **Principle**   | PRIN-5 — a channel that may not work must never look like one that will                                             |
| **Status**      | draft — awaiting designer review                                                                                    |

## Purpose

One switch, honestly presented. REQ-026 gives an Employee the ability to opt in to and out of browser push for booking events, defaulting to off; REQ-027 defines what arrives when they do. NFR-006 is the reason this needs a screen rather than a toggle in a menu: push depends on a browser permission that can be denied or absent, and when it is, the interface has to say so plainly instead of showing a switch in the **on** position that does nothing.

The screen also holds the employee's own details, read-only, because they are maintained by an administrator (REQ-019) and Priya will otherwise hunt for where to change them.

## Place in the flow

- **Reached from:** SCR-002 (account menu)
- **Leads to:** SCR-002

Sign out (REQ-003) is available here as well as in the account menu — on a phone the account menu is behind an avatar, and this is the screen people look for when they want to leave.

## Layout

One narrow column, two sections, no tabs. This screen holds one control and expects to grow slowly.

```
┌────────────┬──────────────────────────────────────────┐
│            │  Settings                                │
│    Bookings│                                          │
│    Book    │  Notifications                           │
│            │  ┌────────────────────────────────────┐  │
│            │  │ Browser alerts            [  ○ ]  │  │  the one control
│            │  │ Get an alert when a booking is     │  │
│            │  │ made or cancelled.                 │  │
│            │  │                                    │  │
│            │  │ ✉ Booking emails are always sent   │  │  the honest part:
│            │  │   to priya@company.com — including │  │  email is the promise,
│            │  │   your day-before reminder. You    │  │  push is the extra
│            │  │   can't turn those off.            │  │
│            │  └────────────────────────────────────┘  │
│            │                                          │
│            │  Your details                            │
│            │  ┌────────────────────────────────────┐  │
│            │  │ Name    Priya Raman                │  │  read-only
│            │  │ Email   priya@company.com          │  │
│            │  │ Role    Employee                   │  │
│            │  │                                    │  │
│            │  │ Your office admin looks after      │  │  says whose job,
│            │  │ these — and passwords.             │  │  not just "no"
│            │  └────────────────────────────────────┘  │
│  ─────────  │                                          │
│  ◕ Priya   │  [ Sign out ]                            │
└────────────┴──────────────────────────────────────────┘
```

The email paragraph sits inside the notifications card, above the fold, in both the on and off states. It is the only thing on this screen that is unconditionally true (BR-001.13), and PRIN-5 says it should be the loudest fact — a user who never finds the toggle still leaves knowing they will be emailed.

Nowhere on this screen is there a bell icon, a notification count, or an inbox. Push may never work for some users; advertising a notification system would be a promise the release cannot keep.

## States

### ST-01 Loading

- **When** the screen opens and the current opt-in flag and browser permission state are being read
- **Shows** the section headings and a skeleton in the toggle row; **Your details** may render immediately, since it comes from the session
- **Can do** wait, or navigate away

### ST-02 Push off

- **When** loaded, the employee has not opted in (REQ-026's default), and the browser supports push
- **Shows** the toggle in the off position with the label **Browser alerts** and one line of explanation; the unconditional email paragraph naming the address; **Your details** read-only
- **Can do** switch the toggle on (→ ST-03), sign out, go back

### ST-03 Requesting permission

- **When** the toggle has been switched on and the browser's own permission prompt is showing or the subscription is being registered
- **Shows** the toggle in an indeterminate busy position — **not** snapped to on, because the browser has not agreed yet — with the line *"Waiting for your browser to allow alerts…"*. The toggle is disabled while in flight
- **Can do** answer the browser prompt. Nothing in our interface can advance this state, which is exactly why the toggle must not pretend it has

### ST-04 Push on

- **When** permission was granted and the subscription is registered (REQ-027)
- **Shows** the toggle on, with what will actually arrive: *"You'll get an alert when a booking is made or cancelled."* and, immediately after, the boundary REQ-025 and BR-001.16 draw: *"Day-before reminders are email only."* The email paragraph remains
- **Can do** switch the toggle off (→ ST-02, no permission round-trip needed — opting out must not require the browser's agreement, BR-001.15)

### ST-05 Permission denied

- **When** the browser has denied notification permission — refused at the prompt, or blocked for the site previously
- **Shows** the toggle off and **disabled**, with the reason and the limit of our power stated plainly: *"Your browser is blocking alerts for this site. We can't turn them on from here — you'd need to allow notifications in your browser settings."* Then the reassurance, promoted: *"Your booking emails are unaffected."* No instructions per browser — they differ, they change, and being wrong here is worse than being brief
- **Can do** nothing to the toggle. The screen's job is to stop her retrying a switch that cannot move, and to leave her confident she is still informed (NFR-006)

### ST-06 Unsupported browser

- **When** the browser has no push support at all — a different cause from ST-05 and it needs different words, because there is no setting to change
- **Shows** the toggle absent rather than disabled, replaced by: *"This browser doesn't support alerts. Booking emails still arrive as usual."* A disabled control implies a route exists; here none does. This is NFR-006's graceful degradation
- **Can do** read it and move on. **Your details** and **Sign out** are unaffected

### ST-07 Change failed

- **When** the opt-in flag cannot be saved — the browser agreed but our request to record it failed, or an opt-out failed
- **Shows** the toggle reverted to its last known true position, never left mid-way, with an inline alert: *"We couldn't save that change. Your alerts are still off."* — naming the current reality rather than the intent — and **Try again**
- **Can do** retry. The toggle telling the truth matters more here than it looking obedient: a switch stuck on **on** while the server thinks otherwise produces a user who believes she will be alerted and is not (PRIN-5)

## Components

| Component     | Used for                                                                   | States it appears in |
| ------------- | -------------------------------------------------------------------------- | -------------------- |
| `app-shell`   | Sidebar / bottom bar, page header, account menu                            | ST-01 – ST-07        |
| `card`        | The two sections                                                           | ST-01 – ST-07        |
| `toggle`      | Browser alerts — needs on, off, busy/indeterminate and disabled variants   | ST-01 – ST-05, ST-07 |
| `definition-list` | **Your details** — read-only name, email, role                         | ST-01 – ST-07        |
| `alert`       | `info` for the always-on email note; `error` for a failed change            | ST-02 – ST-07        |
| `button`      | **Sign out** (REQ-003); **Try again**                                       | ST-01 – ST-07        |
| `skeleton-row` | Loading placeholder in the toggle row                                     | ST-01                |

## Interaction and accessibility

- **Keyboard:** tab reaches the toggle, then **Sign out**. Space toggles. The whole screen is three tab stops
- **Focus:** visible ring on the toggle and on **Sign out** (`--c-focus-ring`). After ST-07 focus stays on the toggle so a retry needs no re-navigation. A disabled toggle (ST-05) stays focusable so its explanation can be read by a screen reader — a disabled control removed from the tab order is a disabled control nobody can find out about
- **Non-colour signalling:** the toggle's state is announced and labelled in text (**On** / **Off**), never conveyed by its colour or position alone. ST-05's disabled state carries its reason as adjacent text, not as a colour change
- **Announcements:** the toggle is a `switch` with its checked state exposed. A successful change announces the new state and the boundary — *"Browser alerts on. Reminders are email only."* ST-05 and ST-06's explanations are associated with the control, so they are read as part of it rather than as unrelated text. ST-07's alert is assertive
- **Reduced motion:** the toggle's transition respects `prefers-reduced-motion`; there is nothing else animated on this screen

## Structural decisions

| Decision                                                                                     | Rationale                                                                                                                                                                                                                                                | Alternative rejected                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Push lives on its own screen rather than a prompt on SCR-002                                    | REQ-026 requires opting **out** as well as in, so the control needs a permanent home. A dismissible strip has nowhere to live once dismissed                                                                                                            | A one-time prompt on the bookings screen. Catches people at a better moment, and breaks the opt-out half of the requirement                                                                        |
| Three distinct unavailable states (ST-05 denied, ST-06 unsupported, ST-07 save failed)          | Each has a different cause and a different truthful message. Collapsing them yields "alerts unavailable", which tells a user with a fixable browser setting nothing, and a user with an unfixable browser a falsehood                                     | One generic unavailable state. Three fewer frames, and NFR-006's graceful degradation becomes a shrug                                                                                              |
| Toggle absent in ST-06, disabled in ST-05                                                       | A disabled control implies a route to enabling it. In ST-05 there is one (browser settings); in ST-06 there is none                                                                                                                                     | Disabling in both. Consistent, and it invites a hunt for a setting that does not exist                                                                                                              |
| The email paragraph appears in every state, including when push is on                            | It is the only unconditional promise in the notification design (BR-001.13). PRIN-5 makes it the loudest fact, not a footnote revealed by failure                                                                                                        | Showing it only when push is off. Tidier, and it lets a push user believe push is the channel that matters                                                                                          |
| No per-browser instructions in ST-05                                                             | They differ across browsers and versions, and stale instructions are worse than none. The sentence names what we cannot do and where the setting lives, without pretending to know her browser                                                          | Detecting the browser and giving steps. Helpful when right, actively misleading when wrong                                                                                                          |
| **Your details** shown read-only with a named owner                                              | REQ-019 gives editing to an Admin only. Omitting the details entirely means Priya searches for them; showing them without saying who changes them means she asks us. One sentence answers it, and covers passwords too (BRD-001 §10 — no self-service)   | Omitting the section. One less thing to draw, and it moves the question to a support conversation                                                                                                   |
| Opting out never requires a permission round-trip                                                | BR-001.15: opting out must stop push without affecting email. Making her re-confront a browser prompt to switch something off would be a trap                                                                                                            | Revoking the browser subscription as part of opting out. Cleaner technically, and it can fail in ways that leave the switch stuck                                                                    |
| No notification history, bell, or badge                                                          | The release sends push on two events (REQ-027) and stores nothing. An inbox would imply a durable record that does not exist                                                                                                                            | A notification centre. A whole feature nobody asked for, and a lie about persistence                                                                                                                 |

## Conflicts and open questions

| #   | Conflict / question                                                                                                                                                                                                                                                | Between            | Owner         | Status                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | When an Admin cancels an employee's booking (REQ-014), REQ-027 sends that employee a push notification. Does it say an admin did it? A push that reads "Your booking was cancelled" when the employee did not cancel it is alarming and unexplained.                | REQ-014, REQ-027   | PO/BA (`/ba`) | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — name the actor.** The alert says the office admin cancelled it, e.g. *"Your desk for Tue 9 Sep was cancelled by your office admin."* An unexplained cancellation alert is alarming and generates support messages. **Clarifies REQ-027 — `/ba` should record the agreed wording**; also covers the cancellations triggered by deactivating a user (SCR-008 row 4) |
| 2   | Should an Admin have this screen? Push is granted to Employees only (REQ-026), so an Admin has no notification setting — but they still need somewhere to sign out and see their own details. Currently the admin shell carries sign-out in the account menu only.  | REQ-026 vs REQ-003 | designer      | **Resolved 2026-09-07 (Joy Joshua, PO/BA) — no Settings screen for admins.** Push is employee-only (REQ-026), so there is nothing for an admin to configure. Sign-out stays in the admin shell's account menu (REQ-003). One less screen to build and keep true |

## Designer handoff

Tokens: `inception/design/tokens.json` (W3C DTCG — importable into Figma via Tokens Studio, Penpot, and others). Draw one frame per `ST-##` above; the numbering is the checklist. Name each frame `WF / SCR-004 · Settings / ST-## <state>` (`HF /` once styled) — the name is the only thing that ties a frame back to this spec. Grid, spacing, and the per-frame checklist: `inception/design/wireframe-rules.md`.

Seven states at **360px and 1280px** (NFR-004). The `toggle` component needs four variants drawn here — on, off, busy, disabled — and ST-06 needs none of them, which is the point of that state.
