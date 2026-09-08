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

**Three frames per `ST-##` in the spec — one at each verification width, `· 360`,
`· 768` and `· 1280`.** NFR-004 names all three (revised 2026-09-08, BRD-001
open question #11), and every screen spec repeats them: a frame at one width is
a third of a state. The numbering is the checklist. A frame whose name matches
no spec state is an orphan; a state missing any width is undrawn work hiding.

**768 used to be the exception, and is not any more.** While NFR-004 named only
360 and 1280, drawing all 90 states a third time would have cost 90 frames to
verify a width no requirement asked for — so each screen got a single 768 frame
of its default state, enough to prove the collapsed-sidebar shell `ia.md`
defines there. NFR-004 now names 768 as a verification width, which makes the
middle shell a commitment rather than a courtesy, and this rule changed with it
exactly as it said it would.

**What that costs, concretely.** 90 states × 3 widths = **270 frames**. 190
exist (90 states at 360 and 1280, plus the 10 screen-level 768 frames). The 10
already drawn are each a default state at 768, so they stand as-is; **80 new 768
frames** are outstanding — the non-default states of every screen. Until those
exist, the middle shell is verified for ten default states and nothing else,
and NFR-004 is a claim rather than a checked fact.

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

**`--f-body` is Inter** — resolved 2026-09-08 in pass 2b. `tokens.css` declares
`Inter, system-ui, sans-serif`. The frames had been standing Inter in for an
unresolved `system-ui`; naming it means the frames and the product now agree
rather than merely resembling each other. Set Inter explicitly on every text
style — it is no longer a stand-in, so a frame left on the tool's default face
is now wrong rather than provisional.

## Wireframes are greyscale; hi-fi frames use the 2b palette

`WF /` frames stay greyscale — they prove structure, and a grey frame cannot
argue about brand. `HF /` frames use the pass-2b palette (warm neutral +
forest + clay, landed 2026-09-08), and only ever through the semantic `--c-*`
names. Colour is never painted onto a frame directly: if a value is not in
`tokens.json`, it is not in the design.

Four rules the palette carries with it. Each exists because the alternative
measurably fails, so none of them is a preference:

- **A field's edge is `--c-border-control`, not `--c-border`.** The quiet beige
  borders are decorative dividers at 1.5:1 — fine between rows, not as the
  boundary of a text input, which WCAG 1.4.11 requires at 3:1. Affects every
  form frame: SCR-001, SCR-007, SCR-009, SCR-010.
- **Focus is a ring plus a `--bw-2` offset gap in `--c-focus-ring-offset`.** The
  ring is brand green and so is the primary button — drawn without the offset
  gap, the ring is 1.00:1 against that button and simply is not there.
- **Text over a `--c-fill-*` is `--c-text-on-fill`.** `--c-text-muted` on the
  subtle fill is 4.33:1 and fails. The fills are fills, never surfaces.
- **Every state carries its icon and its label.** The pale state fills are ΔE
  9.5 apart normally and ΔE 2.2 under deuteranopia — indistinguishable. The
  icon is the signal, the coloured border the second cue, the fill the third
  and weakest (NFR-008). A frame where only the fill changes between two states
  is a frame that has not drawn the state.

**One value in the palette is not the supplied one.** The red family sits at
hue ~352 rather than the supplied ~11, decided 2026-09-08: at the original hue,
blocked/cancelled red was ΔE 13.6 from clay "yours" — ΔE 7.7 under colour-blind
simulation — and the two appear in the same desk list on SCR-003. The status
colour moved so the brand colour would not have to. Clay `#B2542C` is exactly
as specified.

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
