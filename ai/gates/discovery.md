# Gate 1 — Discovery

**Question:** are we building the right thing?
**Personas:** [BA](../roles/ba.md) drafts requirements, then stories · [UX](../roles/ux.md) drafts screens (structure, then styling) · [Architect](../roles/architect.md) drafts the architecture (parallel, advisory) · [Manager](../roles/manager.md) proposes the delivery plan (advisory)
**Approvers:** PO/BA human · the designer (screen structure) · the product team (styling), all via GitHub PR review
**Cadence:** once per feature/epic; reopened by accepted change requests

## Flow

Discovery runs in three ordered steps, each its own PR whose merge is the step's
exit. **Scope is locked left to right**, and stories are drafted last so they
describe a product whose requirements and screens are already settled ([ADR-003](../../knowledge/decisions/ADR-003-discovery-reorder-stories-last.md)):

```
Raw customer need (saved verbatim in inception/product/inputs/)

1. REQUIREMENTS  → BA interviews the human — grill pass: ambiguities interrogated
   (BA)            one question at a time BEFORE drafting (residue → open questions)
                 → drafts lean BRD (REQ/NFR/RISK, business rules) on a docs/ branch
                 → loop with the human until requirements are frozen — merge = frozen

2. DESIGN        2a STRUCTURE → UX opens with a research pass (research doc, IA
   (UX)             sitemap + critical paths, principles — advisory, honestly
                    labelled [SYNTHESISED]/[PENDING] where no user data exists),
                    derives the screen inventory from the IA, then drafts a
                    SCR-### spec per screen (SCR.requirements[], links_to/entry);
                    states numbered ST-##, structural decisions + conflicts
                    — approved by the DESIGNER
                 2b STYLING   → refined tokens.css (both themes) + regenerated tokens.json;
                    the designer styles the frames in Figma/Penpot/etc. on that palette
                    (frames stay in the tool — inception/design/README.md; with a Figma
                    connector, UX re-syncs them) — approved by the PRODUCT TEAM
                 → loop until design is approved; a styling change that forces a
                   structural change reopens 2a. merge = approved

3. STORIES       → only now, with requirements AND design frozen: BA slices INVEST
   (BA)            stories, each citing its REQs and — if it has UI — the already
                   approved SCR that serves it (the US ↔ SCR edge is added here)
                 → numbered Given/When/Then AC-##, edge cases; the PR opens when the human asks
                 → human reads the walkthrough, reviews + merges in GitHub

4. PLAN          → with scope locked, the MANAGER proposes a delivery plan: rough
   (Manager)       estimates, a two-week-sprint grouping, risks + a shareable report
                 → advisory only — the human decides the numbers and locks the plan
                   (sprints live in Jira, not a repo file); gates nothing

   ┌─ parallel, once requirements are frozen (step 1) ────────────────────────┐
   │ ARCHITECTURE  → the ARCHITECT drafts the DB design + app architecture into │
   │ (Architect)     inception/architecture/ (its own reviewed PR). Runs        │
   │                 alongside steps 2–4, needs only requirements, blocks       │
   │                 nothing — informs the build, never gates it.               │
   └──────────────────────────────────────────────────────────────────────────┘

Merged = approved. Each step's merge commit SHA is that step's scope baseline;
the stories merge is the locked scope that Gate 2 builds against. Steps 4 and
ARCHITECTURE are advisory: they inform delivery, they do not gate it.
```

**Two crafts, one gate, one order.** The BA decides what the product must do; UX decides what the user sees and does. They no longer share a PR: requirements freeze, then design freezes, and stories are written against both. A story is not drafted until the scope it describes can no longer move underneath it. A screen spec that needs an unwritten business rule is a BA open question that reopens step 1, never a UX invention, and a story with UI cites a screen that already exists rather than promising one.

**The order is charter-enforced, not CI-blocked.** The personas refuse to run ahead. `/ux` will not design without approved requirements, `/ba` will not draft stories until design is approved. CI keeps only the checks it always had (every cited artifact must resolve, bidirectionally); it does not turn a premature story into a red build. That was a deliberate choice ([ADR-003](../../knowledge/decisions/ADR-003-discovery-reorder-stories-last.md)). The guarantee lives in the personas and the human review, not a new gate.

## What each step's PR must contain

**Step 1 — requirements PR**

- `inception/product/requirements/BRD-###-<slug>.md` — business goal, actors, `REQ-###`/`NFR-###` (each testable, prioritized, sourced), constraints, `RISK-###`, out-of-scope, open questions with owners. Business rules live _inside_ the BRD (own section) — no separate rule files.
- `knowledge/traceability/manifest.json` — the `requirements` nodes (stories still empty at this point)

**Step 2 — design PR**

- `inception/design/research/BRD-###-<slug>.md`, `inception/design/ia.md`, `inception/design/principles.md` — the 2a research pass (templates: `ux-research.md`, `information-architecture.md`, `design-principles.md`). Advisory like the architecture: CI does not require them, but the designer reviews them in this PR, synthesised findings are labelled, and the screen inventory below comes from the IA.
- `inception/design/screens/SCR-###-<slug>.md` for each screen in the IA inventory — purpose, place in the flow (reached-from / leads-to), layout, numbered `ST-##` states (default/loading/empty/error at minimum), components, accessibility, structural decisions with rationale (citing `PRIN-#` where one applies), and a conflicts table that blocks sign-off while any row is open. The spec cites the `REQ-###`/`NFR-###` it serves, not a story, which does not exist yet.
- `inception/design/tokens.css` when the design system changes; `tokens.json` regenerated with `node tools/aidlc-check.mjs --write`
- `knowledge/traceability/manifest.json` — the `screens` nodes with `requirements[]`, mirrored by `screens[]` on each cited requirement (`aidlc-check` fails a screen that traces to neither a story nor a requirement)

**Step 3 — stories PR**

- `inception/stories/user-stories/US-###-<slug>.md` — INVEST stories, each citing its REQs, with numbered Given/When/Then `AC-##`, edge cases, and — if the story has UI — the already-approved `SCR-###` screen that serves it
- `inception/stories/epics/` entry when stories form an epic
- `knowledge/traceability/manifest.json` updated (REQ ↔ US links, and the US ↔ SCR edge added onto the screen approved in step 2). `aidlc-check` fails the PR otherwise

**Parallel — architecture PR (advisory, non-blocking)**

- `inception/architecture/` — DB design + app architecture, drafted by the Architect once requirements are frozen ([README](../../inception/architecture/README.md)). Its own reviewed PR; `aidlc-check` does not require it, and no other step waits on it.

**Step 4 — delivery plan (advisory, no repo artifact)**

- The Manager proposes estimates, a two-week-sprint grouping, and a shareable report from the merged requirements + stories. The human decides the numbers and locks the plan in Jira (which owns sprints/estimates per [ADR-002](../../knowledge/decisions/ADR-002-jira-tracking-flow.md)). Nothing is checked into the repo, and this step gates nothing.

## Gate checks

| Check                                                                                                                                                                              | Enforced by                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IDs unique, links bidirectional, manifest updated                                                                                                                                  | `aidlc-check` (required CI status)                                                                                                                         |
| Every REQ testable + sourced; no invented facts (TBDs owned)                                                                                                                       | Human review — the persona presents a walkthrough highlighting exactly these                                                                               |
| Ambiguities grilled before drafting — the open-questions table is the residue, not an afterthought                                                                                 | Human review of the walkthrough                                                                                                                            |
| Every UI story cites a screen; every screen traces to a story or a requirement and its states match its manifest entry; `tokens.json` is not hand-edited | `aidlc-check` (required CI status)                                                                                                                         |
| Screen conflicts resolved before sign-off; states cover the real failure modes; colour is never the only signal                                                                    | Designer review — the persona presents the states as a checklist                                                                                           |
| Every screen reachable (`entry` or linked from another screen); token contrast meets WCAG AA 4.5:1                                                                                 | `aidlc-check` — reachability warns pre-delivery and errors in delivery; contrast shortfalls warn                                                            |
| Research honesty: `[SYNTHESISED]`/`[PENDING]` labels present where no user data or test exists                                                                                     | Designer review of the walkthrough — the persona must call these out                                                                                       |
| Order held: design only after requirements are frozen, stories only after design is approved (scope locked)                                                                        | Charter + human review — the personas refuse to run ahead ([ADR-003](../../knowledge/decisions/ADR-003-discovery-reorder-stories-last.md)); not CI-blocked |
| Approval identity + reviewed content                                                                                                                                               | GitHub review on the PR (protected `main`)                                                                                                                 |

## Change requests

Someone wants to change an approved requirement or screen → any persona files a **GitHub issue labeled `change-request`** capturing the ask (requester's words verbatim) and the blast radius (read from `manifest.json`: which US/tests hang off the REQ, and which screens and components hang off the US). The PO decides on the issue. If accepted, the BA persona drafts a new artifact PR updating BRD + affected stories + manifest — same gate, same review. The issue links the PR; nothing is edited outside a reviewed PR.
