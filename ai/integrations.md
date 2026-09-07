# Integrations

Every external system this framework touches, with a **recorded position**. An integration with no position is how a governance model quietly acquires a bypass, so "declined" and "deferred" are recorded here as deliberately as "adopted".

## Governance-critical vs convenience

The distinction matters more than the list. Exactly one integration is load-bearing.

| Integration                                   | Class            | If it disappeared                                                                            |
| --------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| **GitHub** (reviews, issues, checks, Actions) | **Load-bearing** | The gates stop functioning. Approval identity, status truth and CI all live here             |
| Nx                                            | Structural       | Task running breaks; the validator's test-target check fails                                 |
| Jira                                          | Convenience      | Tracking and the client's view go dark; **no gate is affected and the build stays green**    |
| Design tools (Figma, Penpot, …)               | Convenience      | Nothing in the graph changes — the repo holds the spec and tokens; a tool holds pixels       |
| Claude Design                                 | Convenience      | The design system stays repo-local and reviewable in the PR — nothing is lost from the graph |
| MCP servers (reference)                       | Convenience      | Personas lose reference lookups; gates unaffected                                            |
| Playwright + Playwright MCP                   | Convenience      | Browser tests stop running. No gate is affected: cross-repo e2e evidence is validated only when present, and same-repo e2e specs are ordinary tests |
| Cursor / opencode / GitHub Copilot            | Convenience      | Those entry points go dark; the Claude surfaces, charters and gates are untouched            |
| mattpocock/skills                             | Convenience      | Personas lose sub-techniques; charters unaffected                                            |

## Adopted

### GitHub — the spine

Approvals are pull-request reviews (authenticated identity bound to a reviewed commit SHA). Work state is derived from PRs, issues and check runs. Change requests and bugs are labelled issues with required-field forms. `aidlc-check` runs as a status on every PR.

Personas read state via `gh`. **No persona may merge, approve, or close** — that is the human's click, and it is the one boundary the whole model rests on.

> Outstanding: branch protection requiring `aidlc-check` + a human review is unavailable on this repository's plan. Until then the merge policy is convention. This is the highest-value open item in the framework.

### Design tools — any of them, downstream

**Position: the framework is design-tool agnostic, and deliberately upstream of whatever tool the designer prefers.**

The source methodology's phases 2–3 produced wireframes and Figma frames as the design deliverable. A frame is a URL: `aidlc-check` cannot validate it, so those phases could only ever be convention. So we inverted the direction rather than picking a competing tool. The repository holds what a gate can check; the design tool holds what a gate cannot:

| In the repo (`inception/design/`, enforced)                                   | In the designer's tool (not checked in)            |
| ----------------------------------------------------------------------------- | -------------------------------------------------- |
| `SCR-###` screen specs — numbered `ST-##` states, rules, decisions, conflicts | Wireframes, high-fidelity frames, flows            |
| `tokens.css` (canonical) + generated `tokens.json` in **W3C DTCG** format     | The imported token set, applied to frames          |
| `wireframe-rules.md` — grid, frame naming, per-frame checklist                | Frames, components, variants, annotation, comments |

`tokens.json` imports into **Figma (Tokens Studio), Penpot, Style Dictionary**, or anything else reading DTCG. Because it is generated from `tokens.css` and CI fails on drift, the palette a designer draws with cannot diverge from the palette the product ships, which is the one guarantee a Figma-first workflow could never give.

**What this deliberately does not do:** it does not replace the designer's canvas, and it does not try to. Frames stay in their tool. It also does not capture Figma's collaboration surface — comment threads, handoff annotations, version history of a visual. That remains the honest gap recorded in ADR-001, and it is now a smaller one: the collaboration that _matters to a gate_ (which states exist, which conflicts are unresolved, who owns them) has moved into reviewable files, and the rest stays where designers already do it well.

No tool is mandated, no tool is declined. Adding one costs nothing in this framework because nothing depends on it.

### Claude Design — an optional rendered view

`claude.ai/design` design-system projects, driven by the `/design-sync` skill and the `DesignSync` tool.

**Direction of truth is one-way.** `inception/design/` is canonical. A Claude Design project is a _rendered view_ for people who should not have to read a repository — a product owner, an architect. Nothing is authored there and pulled down; that would put a Gate 1 artifact outside version control. The same is true of any Figma library built from `tokens.json`: it is a view.

Status: screens and tokens exist; **sync is not enabled yet** and no project has been written to. See [`inception/design/README.md`](../inception/design/README.md).

### Jira — tracking and client visibility, never approval

Adopted 2026-07-31, reversing ADR-001's decline on the exact terms that decline pre-committed to. Rationale and costs: [ADR-002](../knowledge/decisions/ADR-002-jira-tracking-flow.md). Binding rules: [`ai/context/jira-sync.md`](context/jira-sync.md).

**Why it changed.** Two reasons, neither about approval: people who need to follow the work — clients, some managers, testers — do not have repository access, and a repository is not a shared view for them; and tests had no trackable home outside the code, so "what was tested, and did it pass?" required reading test names and CI logs.

**What it is.** A parallel flow carrying delivery tracking, a client-readable view, and test evidence. Tickets are created **on request** from `ai/templates/jira/` — epic, story, test, bug, change request — and each states its real state, so a board never implies agreement that does not exist. The ticket key is recorded in the manifest as a convenience edge for humans.

**The boundary, and it is the whole point:** **approval never travels, in either direction.** No Jira field, transition, or comment opens or closes a gate. Gate approval is a GitHub pull-request review bound to a commit SHA — because that authenticates who approved exactly which bytes, and a ticket field authenticates nothing once it has crossed an integration boundary. Jira also keeps sprints, assignees and estimates outright; mirroring those into the repository would recreate the status-file anti-pattern.

**Enforcement, not prose alone.** One writer, `tools/aidlc-jira.mjs`, dry-run by default so client-visible text is reviewable in the PR before it reaches a live board. It refuses approval-bearing and Jira-owned fields, and `aidlc-check` (check 12) rejects any template that declares one, any unknown placeholder, and any malformed ticket key. A **missing** key is only ever a warning: Jira going away must not break the build, which is the test of whether this stayed in its lane.

Not tool-enforced, and said plainly: `/architect` must not write to Jira. Its read-only guarantee is `disallowedTools: Write, Edit`, which covers files, not external systems, so that limit is a charter rule.

### Nx — task orchestration

All tasks run through Nx (`npm run nx -- <target> <project>`), never the underlying tooling. `aidlc-check` requires every product project to declare a runnable test target, so "untestable code" is a build failure rather than an oversight.

### mattpocock/skills — companion techniques

Enabled via `.claude/settings.json` from the published marketplace, so nothing is vendored. Personas may invoke these as sub-techniques while **staying bound by their charters and gates**. Those skills do not know our manifest, approvals, or interaction rules. Two techniques are built in directly and need no install: the BA's grill pass and DEV's test-first rhythm.

## Adopted with a boundary

### Cursor, opencode, GitHub Copilot — same charters, generated surfaces

Adopted 2026-08-03 ([ADR-005](../knowledge/decisions/ADR-005-multi-tool-persona-surfaces.md)), scoping ADR-001's Anthropic-only position to the framework's own tooling. The persona charters are tool-agnostic by design, so each tool gets generated wrappers — skills (the shared Agent Skills format), typed commands (`/ba`, `/ux`, …) and delegatable agents — built by `tools/aidlc-build-surfaces.mjs` from the `.claude/` sources. `aidlc-check` (check 13) fails on drift; the generated files are never hand-edited.

**The boundary:** the gates do not move with the editor. Approval is a GitHub PR review and `aidlc-check` is the required status regardless of which assistant drafted the work. Enforcement parity is uneven and recorded rather than pretended: the Architect/Manager read-only guarantee is tool-enforced on Claude Code (`disallowedTools`) and opencode (`tools: write/edit: false`), and charter-enforced with an explicit injected notice on Cursor and Copilot, which have no per-agent tool restriction. Accepted cost: work drafted in another tool runs on that tool's model, so "one model vendor" describes the framework's tooling, not every drafting session. The enforcement spine is model-independent, which is the guarantee that matters.

### MCP servers — read-only context only

Personas may use MCP servers for **reference and context**: library documentation, workspace queries, reading external state. Currently configured: Nx (workspace/task queries), Context7 (library documentation), and — where the e2e layer is installed — Playwright (browser automation).

**Playwright MCP is the one exception to "read-only", and it is scoped rather than waved through.** It drives a browser, so it writes to a running application: that is the point, since a locator verified against the real DOM is the difference between a generated test and a guessed one. What keeps it inside the boundary below is *what* it may touch — a test environment, never a gate. It may not act against production, and nothing it does approves, merges, deploys, or edits an approved artifact. The trade-off is recorded in [ADR-006](../knowledge/decisions/ADR-006-e2e-testing-layer.md).

**Figma MCP is the second scoped exception, and it is conditional.** When a team has connected one, `/ux` may use it at the end of the design step to push greyscale wireframe frames — one per `ST-##`, named per `inception/design/wireframe-rules.md` — generated from the approved screen spec and tokens. What keeps it inside the boundary: frames are not gate artifacts (the spec PR is what merges), the sync is one-way from repo to tool, and it runs only when the human asks. The persona must first make sure that the connector can create frames; a read-only connector is reported as such and nothing is pushed. No connector, no step — the handoff is `tokens.json` plus the spec. Recorded in [ADR-008](../knowledge/decisions/ADR-008-ux-research-pass-and-wireframe-conventions.md).

**The boundary:** a persona must not use a write-capable MCP tool to do anything a gate governs. Nothing that merges a PR, approves a review, deploys, edits an approved artifact outside a reviewed PR, or writes project status. If an MCP server offers such a capability, using it is a gate bypass regardless of how convenient it is.

This boundary is **documented, not tool-enforced**. MCP tool availability is a client-side setting, and the framework says so rather than pretending otherwise. Adding a write-capable MCP server to this repo is a decision that belongs in an ADR.

## Declined

### Durable agent memory (PostgreSQL + vector database)

The source stack proposes a persistent memory store for agents. **Declined**, because durable project state outside GitHub is precisely the status-file anti-pattern the framework was rebuilt to remove: two sources of truth, one of them unvalidated and editable.

What replaces it: state is _derived_ — from PRs, issues, checks, and the traceability manifest — so it cannot drift from reality. Within-session context is the AI tool's own concern and needs no project infrastructure.

Postgres **is** used in this project, as the product's database. Different role, no relation to this decision.

## Deferred

### OpenTelemetry

Not adopted, not rejected. The current commitment is NFR-004: every optimize request logged with duration and result count, as structured logs (`nestjs-pino`). Distributed tracing earns its cost when there is more than one deployed service.

Revisit at the first real deployment, alongside the rest of the Gate 3 operations backlog in [`gates/release.md`](gates/release.md). The decision belongs to the DevOps human.

### Orchestration frameworks (LangGraph, AutoGen)

Declined for this project — see [ADR-001](../knowledge/decisions/ADR-001-framework-structure-and-toolchain.md) decision 4. The orchestration the source methodology asks for is the persona router plus the gates; the state such a service would hold already lives in GitHub and one JSON file. Revisit if personas ever need to run unattended in a pipeline rather than beside a human.

### Azure DevOps

Declined. Code, review, status and CI stay in one system with one identity model. Revisit only if the organisation mandates it, on the same terms Jira was adopted under: GitHub remains the approval surface and the other system mirrors it, never the reverse.
