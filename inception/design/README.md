# Design

What lives here, and what deliberately does not.

| Here                       | Contains                                                                    |
| -------------------------- | ----------------------------------------------------------------------------- |
| `research/BRD-###-<slug>.md` | The 2a research pass: assumptions, competitor scan, personas, `INSIGHT-##` |
| `ia.md`                    | Sitemap, navigation model, critical-path flows, the screen inventory         |
| `principles.md`            | `PRIN-#` design principles, each citing the insight it derives from         |
| `screens/SCR-###-<slug>.md` | Screen specs: purpose, every numbered `ST-##` state, a11y notes             |
| `tokens.css`               | The design system's single source — colors, type, spacing, radius, elevation |
| `tokens.json`              | **Generated** from `tokens.css` by `aidlc-check --write` — never hand-edited |
| `wireframe-rules.md`       | Grid, layout discipline, frame naming — for the designer's tool or a frame-generating agent |

**Not here: the visual design files.** Frames stay in Figma, Penpot, or whatever
the designer uses. The tool imports `tokens.json`, so the design file and this
repo agree on the values without either owning the other. What this folder holds
is the part a reviewer must be able to check: which screens exist, which states
each has, and how the screens connect. Frames are drawn from it — by the
designer, or by `/ux` through a Figma connector when one is present.

## Rules `aidlc-check` enforces

- A story with a `## UI` section cites a screen
- A screen's `ST-##` states match its manifest entry
- Every screen is reachable: marked `"entry": true` or in another screen's `links_to`
- Text-on-surface token pairs meet WCAG AA 4.5:1 (warning, both themes)
- `tokens.json` is generated, never edited by hand

Incomplete is a warning before delivery and an error on a `feat/US-###` branch.

## Adding a screen

Run `/ux`. It interviews you, numbers the states so none are skipped, writes the
spec, and updates the manifest. Consistency with what already
exists beats a fresh idea — read the neighbouring specs and `tokens.css` first.

Tailor this README to your project; it is yours from here.
