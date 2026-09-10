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

**A frame named `· 1280` is 1440px wide.** The width in a frame name is the *content*
width it verifies, not the frame's own size — the desktop row above is the frame,
and the approved wireframe frames measure 1440 exactly. Corrected 2026-09-08 after
the first hi-fi build derived its own numbers instead of reading these ones.

The shell, measured off the approved frames rather than re-derived:

| Frame | Sidebar | Content region | Content padding | Inner column |
| ----- | ------- | -------------- | --------------- | ------------ |
| 1440 (named `· 1280`) | 240 | 1200 | 48 | **1104** |
| 768 | 72 | 696 | 24 | **648** |
| 360 | — (56px top bar) | 360 | 16 | **328** |

The sidebar is full-bleed to the frame's left edge, and it is **240px — not the
column-grid width**. Deriving it from columns 1–2 gives 180px and a 1020px content
column instead, and that mistake is easy to make because the arithmetic is
self-consistent and *looks* right. The inner column is what components are
measured against: **1104 / 648 / 328**.

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

## The sidebar carries content, not just navigation

Three things belong in it that a styling pass can quietly lose, because none of
them is a colour:

- the **product lockup** — at 360 there is no rail, so it moves to the 56px top bar
- the **short nav labels** the wireframes settled on: *Bookings*, *Book*, *Desks*,
  *People*. Not *My bookings* or *Book a desk*, which wrap at 240px
- the **account menu at the foot** — Sign out, plus Settings for employees only.
  [`ia.md`](./ia.md) states this: the account menu sits at the foot of the sidebar
  on desktop and behind an avatar in the top bar on mobile. Admin rails carry no
  Settings item, because REQ-004 keeps the two areas apart

The first hi-fi build dropped the lockup and the whole account menu, kept the long
labels, and sized the rail at 180px. It validated clean — no hardcoded colour, every
state numbered — and still looked wrong, because a token audit cannot see missing
content. **Read the approved wireframe before rebuilding a shell in colour.**

The active item never relies on colour: a 3px indicator bar (shape), a
medium-weight label (weight), and a `--c-fill-subtle` pill. Three cues, of which
the fill is the weakest.

**That indicator is absolutely positioned, and every indicator should be.** As a
layout child the 3px bar consumed 3px of the row, which pushed the collapsed
icon 2px off centre on the active item only, and left active and inactive rows in
the expanded rail 3px out of alignment with each other. Both are the kind of fault
you see before you can name — the rail simply looks untidy. An indicator marks a
row; it does not take part in its layout. Fixed 2026-09-08.

**Icons rank navigation; text carries account actions.** The account menu at the
foot is text-only, on 36px rows. Icons on those rows put three icon sizes in a
240px column — a 32px avatar, 20px nav glyphs, 16px menu glyphs — which reads as
clutter rather than as hierarchy, and 20px rows with no vertical padding left the
labels touching each other. `Icon / settings` and `Icon / sign-out` stay in the
library for the mobile account menu, which is not drawn yet.

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
body-sm/regular  body-sm/medium  label/medium  label/caps  mono/regular
```

Each style binds all four properties to variables — family, weight, size, line
height — so the typeface is one variable, not one edit per text node.

`label/caps` is `label/medium` plus 8% tracking, and the tracking has to live in
the STYLE. Uppercase micro-labels — the zone headings on SCR-003, an eyebrow line
— are cramped at `--t-label` without it, and setting letter spacing on the text
node instead **silently detaches the style**, which is exactly how 38 zone labels
ended up carrying loose font settings in the first build of the hi-fi file.
Added 2026-09-08.

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

Seven rules the palette carries with it. Each exists because the alternative
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

- **A card on the page ground uses `--c-border-strong`, not `--c-border`.** The
  page and a card differ by **1.07:1** — beige-50 against white — so the card's
  edge is doing effectively all of the separating, and at `--c-border`'s 1.50:1 it
  apologises. `--c-border-strong` (beige-400) gives **2.07:1** and is already named
  "decorative emphasis divider", which is precisely this job; a card container is
  not a control boundary, so WCAG 1.4.11's 3:1 does not apply to it. Cards carry
  `shadow/1` as well — the token exists for "cards, rows" and was going unused on
  every product card. Two things deliberately do NOT change: **dividers inside a
  card** stay on `--c-border`, because bumping those too reads as stripes; and
  anything already separated by something else — the date picker and dialog on a
  shadow, the alert and toast on a status colour — keeps `--c-border`. Resolved
  2026-09-08 by the designer after comparing three treatments side by side (the
  comparison board is kept in the hi-fi file as the record).

- **`--c-text-disabled` is a LIGHT-ground token.** `tokens.css` documents it at
  2.69:1, and that is its ratio on **white**. Put it on `--c-fill-disabled`
  (beige-400, a mid-tone) and it collapses to **1.30:1** — which is what the first
  hi-fi build did to the disabled confirm action: the worst contrast in the file,
  on a label that is an *instruction* ("Select a desk"), and a slab that read at
  1.94:1 against the page, giving the one element you cannot press more visual
  weight than any card edge. So a disabled control **retreats to a quiet fill plus
  a `--c-border-strong` edge** and never sits on a mid-tone fill: its disabledness
  is carried by the absent brand colour, not by making its label unreadable. The
  more legible `--c-text-muted` is unavailable over a fill (rule 1 above), and
  `--c-text-on-fill` at 8.69:1 reads as enabled — so **2.37:1 is the honest
  ceiling**, which is acceptable: WCAG 1.4.3 exempts inactive controls, and it is
  in family with the other disabled variants at 2.52–2.69:1. Geometry does not
  change, so "no layout shift" between disabled, enabled and busy still holds.
  `--c-fill-disabled` is consequently unused by Button — it still serves disabled
  fields and toggles on the form screens. Resolved 2026-09-08.

- **A destructive action is SOLID crimson, and it is its own role.** Added 2026-09-08,
  closing the open question on SCR-002 and SCR-003. `--c-danger-action` /
  `-hover` / `-pressed` / `-label` fill a destructive button; the
  `--c-danger-fill/-border/-ink` family stays what it always was — a status *chip*.
  The fill is `red-600`, the crimson already in the palette, so **no new hue arrived**
  and blocked, cancelled and destructive remain one family; white on it is 7.18:1. The point
  of the separate name is that `--c-danger-border` must never be used as a fill — the
  two roles may alias the same primitive today and are still different promises. Focus keeps
  its `--bw-2` offset: the forest ring on this fill is **1.34:1**, so a solid
  destructive button without the offset has no visible focus state at all.

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

## A list is one card, not a card per row

A zone, a table, any run of rows: **one card, rows divided by 1px `--c-border`
dividers.** The screen spec's layout sketch draws it that way — the box encloses
all of a zone's rows — and the reason is not decorative. Give every row its own
bordered white card and the page ground survives only as the 8px gutters between
them, which reads as grout rather than as a ground; the warm surface never gets
to do its job, and the palette gets blamed for a layout mistake. The first hi-fi
build of SCR-003 made exactly this error, and it is invisible to a token audit —
every colour was a token, every state was numbered, and it still looked wrong.

A row inside a card therefore carries no border, no radius and no fill at rest.
Its selected state is a left bar plus its indicator plus its chip; its taken state
is the icon, the muted number and the chip. The card supplies the white and the
edge.

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

## A component can lie about its own size

Three faults from the SCR-002 build, all of which validated clean and looked wrong. Each
is invisible to a token audit, because none of them is a colour.

**The visible button is a CHILD of the button.** `Button`'s root is a transparent
wrapper around a `Surface` that hugs its label. Resize the instance and the box grows
while the painted surface stays put — a 296px-wide instance still showing an 85px pill, and
a 48px height override that never reaches the thing you can see. So resizing a button is
always **two** moves: set the instance, then set its `Surface` to `FILL` on the axis you
changed.

**And do NOT fix that in the component.** Setting `Surface` to `FILL` on all 24 variants
looks like the tidy fix and is a regression: a button whose surface fills can no longer be
sized by its own label, so every hug button in the file — `Cancel A-01 for this date`,
`Pick a different date` — stops tracking its text. Hug is the default because it is
right; stretching is the exception and belongs on the instance that wants it.

**Cloning a variant drops its text property references.** `componentPropertyReferences`
does not survive `clone()`. The clone keeps the property *definition*, so setting the
property on an instance succeeds silently and changes nothing — the new variant goes on
showing the set's default copy. Four Dialog variants shipped that way for ten minutes: the
frames said "Cancel this booking?" while the instance property said "Cancel your desk?".
After cloning a variant, re-attach every text reference and read one instance back.

**A text property means the INSTANCE owns the copy.** Once a variant's text node is bound
to a `Title#` property, whatever characters you typed into the variant are ignored in
favour of the property's default. A new context added to `Empty state` therefore appears
carrying the *first* context's words until the frame sets them. Variant-level copy is a
placeholder; the frame is where the words are decided.

**A `FILL` text node can latch at zero width, and it looks like a font bug.** Set a text
child to `FILL` before its siblings exist, inside a frame that is itself `FILL` inside
another auto-layout frame, and the node can keep a width of 0 while its parent reports the
right size and the node reports `layoutSizingHorizontal = "FILL"`. Ten password dots then
render as a vertical thread one character wide — which reads as a broken glyph, not as a
layout fault, so the wrong thing gets investigated. Re-setting `FILL` does nothing; the
repair is `FIXED` → `resize()` → `FILL`, which forces the relayout. Found 2026-09-10 on the
`Error focus` field variants, whose input sits one frame deeper than every other variant
because of the focus ring. **Check the rendered width of any `FILL` text child you added
before its siblings.**

## The login backdrop is a ground, and it yields to content

SCR-001 and SCR-010 sit on a line-drawing of a desk (added 2026-09-10 at the
designer’s request). Three rules keep it decoration rather than a problem.

**It carries no colour of its own.** `inception/design/assets/login-backdrop.svg`
is geometry only: `currentColor`, no page ground, not one literal hex. The stroke
comes from `--c-illustration-line` and the ground from `--c-surface`, so the
backdrop cannot drift from the palette and both themes work from one file. The
supplied artwork shipped its own background rect in the exact value of
`--c-surface`; duplicating that would have created a second place for the page
colour to live, so it was removed rather than copied.

**One file, not three.** The three supplied SVGs carried byte-identical path data
and differed only in scale and hand-tuned stroke width.
`vector-effect="non-scaling-stroke"` holds the line at ~1.3px / ~1px at any size,
which is what those stroke widths were compensating for — so the geometry is
stored once and placed three ways:

| Frame | Art width | Anchored | Bottom margin |
| ----- | --------- | -------- | ------------- |
| 1440 (`· 1280`) | 600 | bottom, **right** (48 from the edge) | 8 |
| 768 | 440 | bottom, centred | 56 |
| 360 | 281 | bottom, centred | 44 |

At 1280 it sits in the right margin, beside the content column rather than under
it. At 768 and 360 there is no side margin, so it becomes a **bottom band** and
the frame reserves that band as bottom padding — the content column is centred in
what remains, never in the whole frame.

**Nothing readable is ever set on top of it.** The card is opaque and may cover as
much of the drawing as it likes; that is what a backdrop is for. The rule is about
the two things that sit on the bare ground: the product lockup (top — never near
it) and SCR-010’s **Sign out** link (bottom — squarely in its way). Every frame
keeps **≥ 32px** between the content column and the art: vertical clearance where
the art is a band, horizontal clearance at 1280 where `Sign out` and the desk are
side by side. Two SCR-001 frames at 360 (ST-04, ST-05) grew ~130px to hold that
clearance, because their alert makes the column taller.

**Where it does not appear, and why.** SCR-010 carries it at 1280 only. Its form is
a six-rule checklist plus two fields and a sign-out link — about 836px at 768 — so
reserving a band there would push a page that currently fits into a scroll that
exists only to show decoration. A backdrop that costs the user a scroll on the one
screen a new starter cannot skip has stopped being decoration (PRIN-4). At 1280 it
costs nothing, because it lives in margin the form was never going to use. The
`ST-05 Saved` frames carry no backdrop either — they are SCR-002’s shell, not the
login ground.


## A screen with no shell still gets its card as a component

SCR-001 and SCR-010 are the only two screens with no `app-shell`, and the temptation is to
draw each state as a one-off frame — there is no chrome to reuse, so what is there to
componentise? The card. `Sign in card` and `Set password card` each hold **one variant per**
**`ST-##`**, and every frame is a page ground, a lockup and one instance. Eleven card states
built once, placed 31 times.

The reason is the same one behind `Desk form popup`: three frames of one state at 360, 768
and 1280 must differ **only** in width. Build them as three frames and they differ in
whatever else drifted — a padding, a label, a field left in the wrong state — and the
reviewer cannot tell a responsive decision from a mistake. With one variant behind all
three, a width frame has exactly one degree of freedom, which is the point of drawing it.

These two frames also have no grid: the shell table above measures a content region they do
not have. The card is a fixed **400px** at 768 and 1280 and the 328px inner column at 360,
centred on both axes, and it is the *same* card on both screens so the forced password step
reads as one continuous arrival (designer, 2026-09-10). Sign out on SCR-010 sits **outside**
the card, beneath it — an escape hatch, not a step, and last in the tab order.

## Section headings align with the content column, not with the card

A section heading — `Upcoming`, `Past bookings` — sits at the **left edge of the
content column**, flush with the card beneath it, and a disclosure chevron sits at that
column's right edge. So the `Accordion header` carries **no horizontal padding**: it was
built with 16px and the two headings on SCR-002 then disagreed with each other by 16px,
which reads as a wobble long before you can name it. Vertical padding stays, because the
header is a control and needs its 44px.

Row text is inset 16px by the row; the heading above the card is not. That difference is
correct and deliberate — the heading labels the card, it is not inside it.

## A booking is not a desk

The state tokens divide into two families that are easy to conflate and must not be:
`--c-state-available/taken/mine/inactive-*` describe a **desk**, and
`--c-state-confirmed/completed/cancelled-*` describe a **booking** (REQ-028). Added
2026-09-08 for SCR-002, which shows all three booking statuses in one list; they alias
families the palette already had, so **no new colour entered it**.

Borrowing across the two is the same category of mistake as using a border colour as a
fill. `--c-state-taken-*` is named for a taken desk; a *completed booking* that borrows
it inherits a meaning nobody intended the first time the taken-desk treatment changes.
Completed uses the quiet `--c-fill-subtle` instead, with no border, and its clock icon
does the work.

**The active item in the bottom bar is a property, not an override.** `Bottom bar` shipped
with Book hardcoded as the active tab, which made every SCR-002 mobile frame wrong until it
gained a `Tab` axis — the same shape as the Sidebar's `Nav`. A screen selects its own
active item. Ten frames each overriding two icon colours and a bar's visibility is ten
chances to miss one.

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

**A second file holds the design system and the hi-fi frames.** Created
2026-09-08. The wireframe file above only ever carried a greyscale palette —
eleven grey primitives behind twelve colour roles, enough to prove structure —
and the pass-2b product palette is 53 primitives behind 52 roles. Rather than
recolour a file whose whole point is that a grey frame cannot argue about brand,
`HF /` frames and the full token library live separately.

| | |
| --- | --- |
| **File** | Employee Desk Booking — Design System & Mockups (Figma, Trigent-IBC team) |
| **URL** | https://www.figma.com/design/xjFVgBbMrJUl7Ys3EX3Cbn |
| **Synced by** | `/ux` through the Figma connector, from `tokens.css` and the specs in `screens/` |
| **Direction** | One-way, as above. The spec PR is what gets approved; a frame never is |
| **Contents** | 170 variables (57 primitives · 65 colour roles in Light and Dark · 48 scale), 13 text styles, 4 elevation styles, 21 icons, 29 components — including the `Nav × Density` Sidebar set that covers the admin screens too, and the `Field & Form` page the auth screens introduced — and 100 `HF /` frames: SCR-003 (12 states), SCR-002 (10), SCR-001 (5) and SCR-010 (6), each at 1440 (`· 1280`), 768 and 360, plus one extra 360 frame for SCR-010 with the keyboard raised |

**Six screens have no** `HF /` **frames yet — SCR-004 through SCR-009, the admin set.**
SCR-003 was drawn first because it is the only screen where clay "yours" and blocked red
appear in the same desk list, which makes it the real test of the pass-2b palette. SCR-002
followed it because the two share the cancel dialog, so drawing them together settles that
component once (2026-09-08). SCR-001 and SCR-010 were drawn together on 2026-09-10 for the
same reason: they are the same 400px card at three sizes, and building them apart is the
surest way to make them stop matching. Between them they complete the employee journey in
colour — sign in, set your password, book a desk, my bookings.

The six that remain are larger and older than these four, and their specs predate the
pass-2b palette, the one-card rule, the disabled-control rule, `--c-border-control` and the
focus-offset rule. SCR-001 and SCR-010 each had a pre-build pass before a frame was drawn,
and it found five faults; assume the admin specs need the same pass before 171 frames
exist, not after.


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
