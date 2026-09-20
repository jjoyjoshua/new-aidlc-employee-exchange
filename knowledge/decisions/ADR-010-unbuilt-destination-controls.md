# ADR-010 — A control whose destination is unbuilt ships visible, `aria-disabled`, and stating why

|             |                                                                          |
| ----------- | ------------------------------------------------------------------------ |
| **Status**  | proposed                                                                 |
| **Date**    | 2026-09-19                                                               |
| **Decider** | Joy Joshua (drafted by Architect persona)                                |
| **Serves**  | US-016, US-020; US-017, US-018, US-019, US-021 – US-027; NFR-008, PRIN-2 |

## Context

This product ships one screen per story, and a screen's acceptance criteria routinely name
controls whose destination story has not been written yet. US-016's inventory named **Add desk**,
**Edit** and **Deactivate** in AC-06 and AC-08 while US-017, US-018 and US-019 were still
unwritten. US-020's people list names four row-menu items in AC-10 — **Edit**, the role action,
**Reset password**, **Deactivate**/**Activate** — while US-023 – US-027 are unwritten. SCR-009 and
the five destination stories will each hit it again.

The project has a standing rule that points the other way, and it is a good rule.
`apps/ui/src/routes.tsx:10-11`:

> *"Addresses reserved but not built by US-001 are listed in the design note rather than stubbed
> here — a route with no screen behind it is a 404 that looks like a bug."*

US-002 applied it to keep a **Settings** row out of the account menu. US-013 §6.2 applied it to
decline building the *"Add desks so people can book"* branch of its own empty state. Its remedy is
always the same: **omit the control.**

Omission stopped being available the moment an AC named the control. US-016's AC-08 requires
**Edit** and the activate/deactivate action to be *"both directly visible"*; US-020's AC-10
requires four items *"in a fixed order"* with the destructive one last behind a divider — a safety
property, per that story's own QA note. Dropping an AC is a Gate 1 change routed through a
`change-request` issue, not something a delivery persona decides.

US-016 resolved this in its design note §6 and flagged the recurrence risk as its **open item 6**:
*"If you expect this three more times this release and want it held by a document rather than by §6
plus a test, write it now rather than at the third one."*

**US-020 is the second occurrence, and it demonstrated the failure this ADR exists to prevent.**
US-020's DEV applied US-016 §6 *verbatim* — `decisions.md` D-03 says so in those words — and the
verbatim application was wrong, because US-016's controls were buttons in a table row and
US-020's are the entire contents of a popup menu. `Button` renders the HTML `disabled` attribute
(`apps/ui/src/components/button/Button.tsx:62`); a disabled `<button>` is not focusable and is
skipped by most screen readers' browse modes. Four disabled items inside a `role="menu"` produce a
menu with **zero focusable elements**: focus has nowhere to go when it opens, US-020/AC-12
(*"dismissing returns focus to its trigger"*) has nothing to test, arrow-key movement
(`SCR-008:224`) has nothing to move between, and AC-10's fixed order is unperceivable by exactly
the users the order protects.

A design-note section does not travel between stories. A rule does.

## Decision

**We will render a control whose destination story has not shipped as a real, correctly labelled,
correctly placed control that is `aria-disabled="true"` and remains focusable, carrying its reason
in the accessibility tree, and proven by a test named after the story that will delete it.**

Concretely, and in this order:

1. **Render it.** Correct label, correct position, correct geometry at every width the screen's
   NFR-004 frames define. Not omitted, not hidden, not a placeholder.
2. **`aria-disabled="true"`, never the HTML `disabled` attribute.** The control keeps its tab stop
   and its accessible name; its handler returns early. `ButtonProps extends
   ButtonHTMLAttributes` (`Button.tsx:20`), so `aria-disabled` passes through `...rest` and **no
   shared component gains a prop for this.**
3. **State the reason where assistive technology can reach it.** A visually-hidden span plus the
   same string as `title` — the pair `AdminBookingRow.tsx:79-81` established, because *"`title`
   alone is not an accessible name in practice"*. Each screen defines its own
   `.<screen>__visually-hidden`; there is no global `sr-only` utility in this codebase and none is
   introduced.
4. **The reason names no story id and promises no release.** *"Not available yet"* and nothing
   more specific. A story id is internal jargon; a date is a commitment UX and the PO own.
5. **Prove it with a positive assertion, titled with the story that deletes it.** Present, named,
   `aria-disabled`, and carrying its reason. The destination story cannot ship without editing
   that test, which is the visibility a `// TODO` does not give.
6. **The gap must be one named, scheduled story wide.** Every control shipped this way names a
   story that exists and depends on the current one. This is the clause that keeps the decision
   from becoming a licence to ship dead interface.

**Where the enabled destination genuinely exists, this ADR does not apply** and
`routes.tsx:10-11` governs unchanged: omit the control rather than route a click to a catch-all.

## Alternatives considered

| Option | Pros | Cons | Why rejected |
| ------ | ---- | ---- | ------------ |
| **Omit the control until its story ships** (`routes.tsx:10-11`, US-002 §6.1, US-013 §6.2) | The project's existing rule; no dead interface; nothing to delete later | Fails any AC that names the control — US-016/AC-06, AC-08; US-020/AC-10 | **Fails approved acceptance criteria.** Dropping an AC is a Gate 1 `change-request`, not a delivery decision. The rule still governs where no AC names the control |
| **HTML `disabled`** (US-016 §6.2 as written) | Browser-native; blocks Enter and Space with no handler; one attribute for the next story to delete | Not focusable; skipped in screen-reader browse mode; **inside a menu it leaves zero focusable elements**, so the popup's own ACs become untestable | **Rejected on evidence from US-020.** It happens to work in a table row surrounded by other focusable things and fails in a popup. A rule that holds only in one container is not a rule |
| **Enabled, navigating to the unbuilt address** | Looks finished | `routes.tsx:76`'s catch-all sends the click to `/sign-in` | Literally the failure `routes.tsx:10-11` forbids, and worse than a 404 |
| **Enabled, no-op on click** | Trivial | A control that accepts a click and does nothing is indistinguishable from a broken one, and gives a screen-reader user no way to learn otherwise | PRIN-2 — *"a half-built control communicates a falsehood"* (US-013 §6.2's third reason) |
| **Enabled, opening a "coming soon" dialog** | Explains itself | Ships copy nobody approved and invents a numbered state the screen spec does not have | Invents design; UX and the PO own that copy |
| **Merge each pair of stories so no destination is ever unbuilt** | No dead controls at all | Collapses the one-story-one-PR cadence Gate 2 is built on; US-016 alone delivers AC-04's count, which US-019's block needs on screen | A scope call for the PO, story by story (US-016 §6.3), not a standing architectural answer |

## Consequences

**Easier.** A screen ships complete against its approved frames and its ACs are testable as
written. The destination story's diff is one attribute plus one handler plus one test title — and
the test makes it impossible to ship that story without visiting every control it enables.
Reviewers get a single rule instead of re-deriving the argument per screen, and the
`routes.tsx:10-11` tension is settled once rather than re-litigated each time.

**Harder.** Every such control carries a real accessible reason, which means UX owns a string per
control before the screen ships. `aria-disabled` needs an explicit early return in the handler,
which HTML `disabled` gave free — a control that forgets it is live. **That early return is the
single highest-value thing to check in review of any screen applying this ADR.**

**Follow-up work created.**

1. **US-016's already-shipped controls use HTML `disabled`.** They are in a table row, where it is
   harmless, and every one of them has since been enabled by US-017 – US-019 — so **no retrofit is
   required and none should be opened.** Recorded so the inconsistency is understood rather than
   discovered.
2. **`apps/ui/src/components/README.md`** gains one line pointing at this ADR, so the rule is
   found from the component folder rather than only from a story's design note.
3. **The reason string is UX's**, and is still open at the time of writing (US-016 open item 8,
   US-020 §12 item 5). This ADR fixes the *mechanism*, not the words.
4. **US-021 – US-027 each apply this ADR by name** in their design notes rather than re-deriving
   §6. SCR-009's form is the next application and the first outside a list row or a menu.
