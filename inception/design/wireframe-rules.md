# Wireframe rules

For whoever draws the frames — a designer in Figma/Penpot/Sketch, or a
frame-generating agent. The repo holds the spec (`screens/`, `tokens.css`);
these rules keep the frames matched to it. None of this is CI-enforced — it
cannot be, the frames live in the tool — which is exactly why it is written down.

## Frame naming — the one rule that ties a frame to the spec

```text
WF / SCR-### · <Screen name> / ST-## <State name> · <width>     (wireframe)
HF / SCR-### · <Screen name> / ST-## <State name> · <width>     (hi-fi)
```

Two frames per `ST-##` in the spec — one at each verification width, `· 1280`
and `· 360` (NFR-004 names both, and every screen spec repeats it: a frame at
one width is half a state). The numbering is the checklist. A frame whose name
matches no spec state is an orphan; a state missing either width is undrawn
work hiding.

**`· 768` is the exception: one frame per screen, not per state.** NFR-004 does
not name 768 as a verification width, but `ia.md` defines a distinct shell there
(icon-only collapsed sidebar), and an undrawn shell is a shell nobody has checked.
So each screen gets a single 768 frame — its default state, the one that exercises
the layout hardest — and that is enough to prove the shell and catch a layout that
breaks. Drawing all 90 states a third time would cost 90 frames to verify a width
no requirement asks for. If NFR-004 gains 768 (see the open question in `ia.md`),
this becomes two frames per state and the coverage rule changes with it.

The width suffix is the last segment, after the state name, so frames sort by
screen, then state, then width — which is the order a reviewer reads them in.

## Grid

Apply the grid before placing any content. Nothing sits outside the columns.

| Breakpoint | Columns | Gutter | Margin | Frame width | Max content |
| ---------- | ------- | ------ | ------ | ----------- | ----------- |
| Desktop    | 12      | 24px   | 40px   | 1440px      | 1280px      |
| Tablet     | 8       | 20px   | 24px   | 768px       | —           |
| Mobile     | 4       | 16px   | 16px   | 360px       | —           |

A persistent sidebar sits in columns 1–2; main content in 3–12.

Mobile is 360px, not a roomier 390px, because that is the width every screen
spec names for verification and PRIN-4 designs to. A layout that survives 360
survives 390; the reverse is not true.

Three things the middle breakpoint changed, none of them cosmetic:

- **The collapsed nav label is a hover state, not a permanent overlay.** `Show tooltip`
  on the Sidebar defaults to **off**; a label left visible sits on top of the page
  content and reads as a bug. Turn it on only to document the hover state.
- **Card row actions sit side by side.** Full-width stacked buttons are right at 360
  and absurd at 648, where a single "Edit" runs half the screen. One `Actions` row,
  two equal children — better at both widths.
- **Fewer date chips.** See SCR-003: seven chips plus arrows do not fit 616px.

**At 768 the sidebar is 72px, so the content area is 648px** — and that number
is the one that matters. Measured against it, all three admin tables overflow:
All bookings needs 793px, People 854px, Desks 672px. That is why SCR-005,
SCR-006 and SCR-008 switch to their card layout below **1024**, not below 768.
Check a new table against 648px before assuming it survives the middle
breakpoint.

## Spacing

All spacing from the `--s-*` scale in `tokens.css` — no in-between values.
Component padding `--s-8`/`--s-16`, gaps between elements `--s-16` or
`--s-24`, between sections `--s-48`, page rhythm `--s-64`.

## Typography comes from a style, never from loose font settings

Every text node carries a **text style**. No frame sets a family, weight, size
or line height by hand — if a text node shows loose values, the style was not
applied and the type ramp is a suggestion rather than a system.

Styles are named `<size>/<weight>`, because `tokens.css` treats size and weight
as separate scales (`--t-*` and `--fw-*`) and a size-only ramp cannot say that a
button label is `body` at medium weight while a field value is `body` at regular:

```text
display/semibold  heading-xl/semibold  heading-lg/semibold  heading/semibold
heading-sm/medium  body-lg/regular  body/regular  body/medium
body-sm/regular  body-sm/medium  label/medium  mono/regular
```

Each style binds all four properties to variables — family, weight, size, line
height — so the typeface is one variable, not one edit per text node.

`mono/regular` exists for one job — a credential that must be read aloud
accurately (SCR-008 ST-11). It binds `fontFamily/mono` (`--f-mono`), so the
monospace face is swappable on its own.

**Swapping the typeface takes two variables, not one.** `fontFamily/body` sets
the family; `fontStyle/semibold` (and its siblings) set the weight *names*,
which are family-specific strings — Inter spells it `Semi Bold`, most other
families spell it `SemiBold`. Change both together or the heavier weights fall
back silently.

**`--f-body` is unresolved.** `tokens.css` declares `system-ui, sans-serif`;
design tools have no `system-ui`, so the frames stand Inter in its place. Which
typeface the product actually ships is a styling decision, open for pass 2b.

## Wireframes are greyscale

Wireframes use only the greyscale `--c-*` set from `tokens.css`. Brand colour
arrives in pass 2b, on tokens — never painted onto a frame first.

## Layout discipline

Every container is auto-layout; nothing is manually positioned.

| Mode  | Behaviour                     | Use for                                  |
| ----- | ----------------------------- | ---------------------------------------- |
| FILL  | stretches to fill the parent  | page wrappers, sections, rows            |
| HUG   | wraps its children            | buttons, tags, cards with variable content |
| FIXED | explicit size                 | icons, avatars, images                   |

Standard nesting: page frame (FILL) → layout wrapper (FILL, grid-constrained)
→ section (FILL) → card (HUG) → header/body (FILL), footer actions (HUG).

## Popups are drawn over the screen they open from

A popup frame is never the card on an empty background. It is:

```text
the originating screen  →  a full-frame scrim (--c-scrim)  →  the card
```

Without the screen behind it and the scrim over that screen, a form card reads
as a page, and a reviewer cannot tell whether it replaced the list or floated
above it. Draw the backdrop from the screen that launches it — the desk form
over **Desks**, the user form over **People** — and dim it.

At ≥768px the card is centred. Below that it is a bottom sheet anchored to the
frame's bottom edge, full width, with its bottom corners squared off, so a strip
of the dimmed screen stays visible above it. That strip is doing work: it is the
only thing telling a phone user they are on top of something, not inside it.

**The card is a component, not a frame you rebuild.** `Desk form popup` and
`User form popup` each hold every state as a variant, both built on the shared
`Dialog header` (**76px** — 24px above and below the title) and `Dialog footer`.
Change the chrome once and every frame follows. A popup assembled by hand in
each frame drifts by the third state.

## Recurring page patterns

Empty, error, loading, and page-header are designed once and reused — a screen
spec's `ST-##` says *when* they appear, not what they look like. Empty states
differ by context (first use, cleared by filter, no permission, nothing yet);
errors differ by cause (not found, server, offline, forbidden) — reuse the
pattern, vary the copy and recovery action. If a pattern component does not
exist yet, it earns its place in the library the first time a screen needs it.

In the design tool, name component variants `Property=Value` (`Type=Primary,
State=Hover`) so a spec can reference a variant unambiguously.

## Where the frames live

| | |
| --- | --- |
| **File** | Employee Desk Booking — Wireframes (Figma, Trigent-IBC team) |
| **URL** | https://www.figma.com/design/flHQMgn1EHOPby1e3kaDph |
| **Synced by** | `/ux` through the Figma connector, from the specs in `screens/` |
| **Direction** | One-way. The repo is upstream; the file is redrawn from the spec, never the reverse |
| **Contents** | 180 frames — all 10 screens, all 90 `ST-##` states, each at 1280 and 360 |

The file carries the token set as Figma variables — a `Color` collection with
**Light** and **Dark** modes aliased to a hidden `Primitives` greyscale ramp, and
a `Scale` collection for spacing, radius, control heights and the type ramp.
Every variable's web code syntax is its `tokens.css` custom property, so a
variable in the file and a token in the repo are the same thing under two names.
Nothing in a frame carries a raw value, which is what makes the styling pass a
mode switch rather than a redraw.

## Design-file organisation (suggestion, not a rule)

A shared file needs an order whoever creates the pages. One that works:
an index page first, then research boards (if kept in the tool), then one
wireframe page per screen in `SCR-###` order, then design-system foundations
and components, then hi-fi pages per screen. Keep the order stable; people
navigate shared files by muscle memory.

## Per-frame checklist

- [ ] Grid applied, content inside columns
- [ ] Auto-layout everywhere, modes per the table above
- [ ] Spacing and colour from tokens only — no raw values
- [ ] Every text node carries a text style; no loose font settings
- [ ] A popup sits over its originating screen, dimmed with `--c-scrim` — never on a bare background
- [ ] Icons optically aligned to the text they label (a 20px icon on a 24px line sits `--s-2` lower)
- [ ] Reuse existing pattern components before drawing new shapes
- [ ] Frame named `WF / SCR-### · <name> / ST-## <state>`
- [ ] Every `ST-##` in the spec has its own frame

Tailor this file to your project; it is yours from here.
