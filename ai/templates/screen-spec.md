# SCR-### — <Screen name>

> Approval = Gate 1 review of this file's PR. A state is "designed" when it is numbered here, listed in the manifest, and drawn as its own frame in the design tool (`WF / SCR-### · <screen> / ST-## <state>`).

|                  |                                                      |
| ---------------- | ---------------------------------------------------- |
| **Serves**       | US-### (, US-###)                                    |
| **Traces to**    | REQ-###, NFR-###                                     |
| **Surface**      | `apps/ui` `features/<area>` — <route or entry point> |
| **Persona**      | P-# (<research doc>) — or the actor from the BRD     |
| **Primary job**  | <what this persona is here to get done>              |
| **Principle**    | PRIN-# — <how it applies here, one clause>           |
| **Status**       | draft — awaiting designer review                     |

## Purpose

One or two sentences: what the user is trying to accomplish here, and what "done" looks like for them. If this cannot be written without inventing a business rule, stop and raise it with `/ba`.

## Place in the flow

Where this screen sits in the IA (`inception/design/ia.md`), mirrored in `manifest.json` so an unreachable screen or dead-end journey is caught, not discovered.

- **Reached from:** SCR-###, SCR-### — or `entry` (a root the user lands on directly)
- **Leads to:** SCR-###, SCR-### (`screens[].links_to` in the manifest)

## Layout

Structure in words — regions, hierarchy, what dominates. A rough ASCII block is welcome; a pixel-perfect one is not the job of this file.

```
┌─────────────────────────────────────┐
│ <region>                            │
├─────────────────────────────────────┤
│ <region>                            │
└─────────────────────────────────────┘
```

## States

Numbered like acceptance criteria, and for the same reason: an unnumbered state is a state someone forgets to build. Floor for any screen that loads data: default, loading, empty, error, plus every domain state the requirement implies.

### ST-01 <Name>

- **When** <the condition that puts the screen in this state>
- **Shows** <what the user sees>
- **Can do** <the actions available; "none" is a valid answer>

### ST-02 <Name>

- **When**
- **Shows**
- **Can do**

## Components

| Component | Used for                        | States it appears in |
| --------- | ------------------------------- | -------------------- |
| `<name>`  | <role on this screen>           | ST-##, ST-##         |

The library components this screen uses, by name. The designer builds them in the tool on the tokens; a component no screen lists is speculative library, not design.

## Interaction and accessibility

- **Keyboard:** tab order, what is operable without a mouse, where focus goes after each action
- **Focus:** visible ring on every interactive element (`--focus-ring`)
- **Non-colour signalling:** every status carries an icon or label, never colour alone (NFR-003)
- **Announcements:** what a screen reader is told when state changes

## Structural decisions

Recorded so the human can interrogate them at review. "Why this way?" should have an answer in the file, not in someone's memory.

| Decision | Rationale | Alternative rejected |
| -------- | --------- | -------------------- |
|          |           |                      |

## Conflicts and open questions

Blocks approval of this screen until each row has a resolution. A conflict resolved now is cheaper than a wireframe redrawn later.

| #   | Conflict / question | Between | Owner | Status |
| --- | ------------------- | ------- | ----- | ------ |
| 1   |                     |         |       | open   |

## Designer handoff

Tokens: `inception/design/tokens.json` (W3C DTCG — importable into Figma via Tokens Studio, Penpot, and others). Draw one frame per `ST-##` above; the numbering is the checklist. Name each frame `WF / SCR-### · <screen> / ST-## <state>` (`HF /` once styled) — the name is the only thing that ties a frame back to this spec. Grid, spacing, and the per-frame checklist: `inception/design/wireframe-rules.md`.
