# Wireframe rules

For whoever draws the frames — a designer in Figma/Penpot/Sketch, or a
frame-generating agent. The repo holds the spec (`screens/`, `tokens.css`);
these rules keep the frames matched to it. None of this is CI-enforced — it
cannot be, the frames live in the tool — which is exactly why it is written down.

## Frame naming — the one rule that ties a frame to the spec

```text
WF / SCR-### · <Screen name> / ST-## <State name>     (wireframe)
HF / SCR-### · <Screen name> / ST-## <State name>     (hi-fi)
```

One frame per `ST-##` in the spec — the numbering is the checklist. A frame
whose name matches no spec state is an orphan; a state with no frame is
undrawn work hiding.

## Grid

Apply the grid before placing any content. Nothing sits outside the columns.

| Breakpoint | Columns | Gutter | Margin | Frame width | Max content |
| ---------- | ------- | ------ | ------ | ----------- | ----------- |
| Desktop    | 12      | 24px   | 40px   | 1440px      | 1280px      |
| Tablet     | 8       | 20px   | 24px   | 768px       | —           |
| Mobile     | 4       | 16px   | 16px   | 390px       | —           |

A persistent sidebar sits in columns 1–2; main content in 3–12.

## Spacing

All spacing from the `--s-*` scale in `tokens.css` — no in-between values.
Component padding `--s-8`/`--s-16`, gaps between elements `--s-16` or
`--s-24`, between sections `--s-48`, page rhythm `--s-64`.

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

## Recurring page patterns

Empty, error, loading, and page-header are designed once and reused — a screen
spec's `ST-##` says *when* they appear, not what they look like. Empty states
differ by context (first use, cleared by filter, no permission, nothing yet);
errors differ by cause (not found, server, offline, forbidden) — reuse the
pattern, vary the copy and recovery action. If a pattern component does not
exist yet, it earns its place in the library the first time a screen needs it.

In the design tool, name component variants `Property=Value` (`Type=Primary,
State=Hover`) so a spec can reference a variant unambiguously.

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
- [ ] Reuse existing pattern components before drawing new shapes
- [ ] Frame named `WF / SCR-### · <name> / ST-## <state>`
- [ ] Every `ST-##` in the spec has its own frame

Tailor this file to your project; it is yours from here.
