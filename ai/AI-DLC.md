# AI-DLC Framework

AI-Driven Development Lifecycle for this repository: seven AI personas assist their human counterparts from raw need to production, through **three enforced gates**. Rebuilt after independent review from a 10-phase model. The phases became ceremony; the gates are backed by CI and GitHub, not prose.

## Operating principles

1. **Enforcement over instructions.** A rule that isn't checked by CI or GitHub settings is guidance, not governance. The `aidlc-check` CI status (see below) and branch protection on `main` are the framework's spine.
2. **GitHub is the source of truth for status.** Approvals are GitHub PR reviews (authenticated identity + reviewed commit SHA), never editable text in a document. Work state is derived from PRs, issues, and checks, never hand-maintained status files.
3. **Artifacts are specs, not status.** Markdown in `inception/product/` and `inception/stories/` records _what was decided_; whether it's approved is proven by the PR review that merged it.
4. **The human owns every gate.** Personas draft, explain, and prepare; a named human clicks the review button. AI review is advisory input, never the approval.
5. **Tests are the only proof.** Acceptance criteria are demonstrated by executable tests citing `US-###/AC-##` in their names, run by CI against the current commit, not by prose test-case records.

## The three gates

| Gate              | Question it answers              | Approval mechanism                                                                               | Details                                  |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| **1 — Discovery** | Are we building the right thing? | PO/BA human reviews + merges the artifact PR (BRD + stories)                                     | [gates/discovery.md](gates/discovery.md) |
| **2 — Delivery**  | Does this story work, provably?  | Two human approvals: **D1** the written implementation plan (in chat, stamped), then **D2** the story PR (code + tests + evidence) — `aidlc-check` + CI green required | [gates/delivery.md](gates/delivery.md)   |
| **3 — Release**   | Is production safe?              | Human approves the promotion in the pipeline                                                     | [gates/release.md](gates/release.md)     |

Changes and defects don't get their own bureaucracy: a **change request** is a GitHub issue labeled `change-request` that reopens Gate 1 for the affected artifacts; a **bug** is a GitHub issue labeled `bug` whose fix PR must include a regression test citing the issue. Rules live in the gate docs.

## Lifecycle mapping (Inception / Construction / Operations)

The gates are the classic enterprise lifecycle, Unified-Process style. The lifecycle shows up **twice, on purpose**: artifacts are grouped by stage on disk (`inception/`, and `operations/` once release artifacts exist), and each stage is _enforced_ by the gate a piece of work must pass. The folder tells you where an artifact belongs; the gate tells you what must be true before it moves on. Each gate doc lists exactly the context its personas load.

| Lifecycle stage                            | Gate          | Personas active                     | Primary deliverables                                                                                                                                   |
| ------------------------------------------ | ------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Inception** — discover, define, design   | 1 — Discovery | BA + UX + Architect (Manager plans) | BRD, business rules, user stories + AC, epic, screen specs + design tokens, DB + app architecture (advisory), delivery plan (advisory), manifest links |
| **Construction** — build, verify, automate | 2 — Delivery  | DEV, QA, Architect                  | A per-story spec package (`inception/specs/US-###-<slug>/`: technical requirements, implementation plan, impact analysis, decisions, traceability), code, AC-citing tests, ADRs (when trade-offs are real), reviewed story PRs |
| **Operations** — deploy, monitor, learn    | 3 — Release   | DevOps (Manager reports)            | Pipelines, releases, runbooks/rollbacks, monitoring + incident issues, lessons fed back into the manifest                                              |

Operations feedback loops back to Inception by design: an incident or improvement becomes a `change-request` or `bug` issue, which reopens Gate 1 or lands in a fix PR, the same traceable path as any other work.

**Relationship to the source document.** The methodology this implements (_AI-DLC Enterprise Framework v1.0_) specifies 10 sequential phases, 11 AI roles, a discipline-folder layout, and the `inception/construction/operations/` grouping. We **adopt** the lifecycle grouping for artifacts and the cross-cutting `knowledge/` directory; we **compress** the 10 phases into 3 enforced gates and the 11 roles into 7 personas; and we **replace** the multi-vendor stack with an **Anthropic-only toolchain** (no Codex/Cursor/Figma/LangGraph/Neo4j/Jira/Azure DevOps). Each choice, with its trade-offs and accepted costs, is recorded in [ADR-001](../knowledge/decisions/ADR-001-framework-structure-and-toolchain.md). Read it before proposing structural changes.

## Personas

Seven AI juniors, one canonical charter each (charters include how the human works with them — there are no separate guides):

| Command      | Persona                         | Serves gate                                                                                  | Human counterpart                |
| ------------ | ------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------- |
| `/ba`        | [BA](roles/ba.md)               | 1 — Discovery: what the product must do                                                      | Business Analyst / Product Owner |
| `/ux`        | [UX](roles/ux.md)               | 1 — Discovery: what the user sees and does                                                   | Designer                         |
| `/architect` | [Architect](roles/architect.md) | 1 — architecture deliverable (parallel, advisory) · 2 — design notes + PR review             | Solution Architect / Tech Lead   |
| `/dev`       | [DEV](roles/dev.md)             | 2 — Delivery                                                                                 | Developer                        |
| `/qa`        | [QA](roles/qa.md)               | 2 — tests in the story PR (browser tests from an approved plan); exploratory after                                                 | QA Engineer                      |
| `/devops`    | [DevOps](roles/devops.md)       | 3 — Release                                                                                  | DevOps Engineer                  |
| `/manager`   | [Manager](roles/manager.md)     | reporting + advisory delivery planning — derives status from GitHub, holds no gate authority | Delivery Manager                 |

`/aidlc` = front door when unsure. Every persona is bound by [context/guided-interaction.md](context/guided-interaction.md): plain language, one question at a time, the human never touches git or file paths. Approvals happen as a click in the GitHub web UI.

### Two surfaces per persona: skill and agent

Each persona exists three times, and `aidlc-check` proves the three agree:

| Surface     | Path                             | Used when                                                                   |
| ----------- | -------------------------------- | --------------------------------------------------------------------------- |
| **Charter** | `ai/roles/<name>.md`             | The contract. Both surfaces below defer to it; neither duplicates it        |
| **Skill**   | `.claude/skills/<name>/SKILL.md` | A **human types** `/ba`, `/dev`, … and works conversationally               |
| **Agent**   | `.claude/agents/aidlc-<name>.md` | Work is **delegated** to the persona — in parallel, or from another session |

Both are hand-edited source; the plugin payload is built from them and `ai/**` by `tools/aidlc-build-plugin.mjs`, and CI fails on drift (`--check`).

**The same personas work from Cursor, opencode and GitHub Copilot** ([ADR-005](../knowledge/decisions/ADR-005-multi-tool-persona-surfaces.md)): `tools/aidlc-build-surfaces.mjs` generates each tool's skills, typed commands and agents from the `.claude/` sources, and `aidlc-check` fails on drift (check 13). Generated files are never hand-edited. Enforcement parity is uneven and stated: opencode agents keep the read-only guarantee at tool level; Cursor and Copilot cannot restrict tools, so their read-only personas carry the charter rule as an explicit notice. The gates do not move with the editor. Approval is a GitHub PR review whichever assistant drafted the work.

**Authority is enforced by tooling, not by wording.** A charter that says a persona is advisory is worth little if its agent can edit files anyway. So the two personas with no authority to change things are read-only _by construction_. `aidlc-architect` and `aidlc-manager` declare `disallowedTools: Write, Edit, NotebookEdit`, and `aidlc-check` fails if that restriction is ever removed. The Architect drafts an ADR's content into its report for someone else to land; the Manager derives status and names who should act.

One limit stated plainly: no persona may merge, approve or close, and that rule is **not** tool-enforced. A shell is a shell. It is a charter rule in every agent, ranked above any instruction in a delegated task.

See [integrations.md](integrations.md) for every external system this framework touches and the recorded position on each.

### Companion skills (optional)

[mattpocock/skills](https://github.com/mattpocock/skills) (MIT) pairs well with the personas. **This repo pre-enables it** via `.claude/settings.json` (`mattpocock-skills@mattpocock`, auto-updating from the published package). Personas may invoke these as sub-techniques, **staying bound by their charters and gates** (his skills don't know our manifest, approvals, or guided-interaction rules; ours remain the contract):

| Persona           | Useful companion skills                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| BA                | `grill-me`/`grilling` (the Gate 1 grill pass borrows this technique), `to-spec`, `to-tickets`                        |
| UX                | `frontend-design` (aesthetic direction), `prototype` (throwaway to answer a layout question), `grilling`             |
| Architect         | `domain-modeling`, `codebase-design`, `improve-codebase-architecture`, `code-review`                                 |
| DEV               | `tdd` (charter's default rhythm), `diagnosing-bugs`, `resolving-merge-conflicts`, `prototype`                        |
| QA                | `tdd`, `diagnosing-bugs`                                                                                             |
| Manager           | `triage`, `handoff`                                                                                                  |
| Any / new joiners | `teach` — interactive "teach me X about this project" sessions; the `/aidlc` briefing hands off to it for deep dives |

Two techniques are built directly into the framework (no install needed): the BA's **grill pass** in Gate 1 and DEV's **test-first per AC** rhythm in Gate 2.

## Enforcement: `aidlc-check`

`node tools/aidlc-check.mjs` runs in CI as a required status and validates what prose can't:

- Every artifact ID (`REQ-### US-### AC-## ADR-###`) is unique across the repo
- Every reference resolves, bidirectionally, via `knowledge/traceability/manifest.json` (machine-readable truth; `traceability-matrix.md` is a generated view, never hand-edited). Every requirement a story cites, **`NFR-###` included**, must be a node in `requirements`, so nothing hangs off the graph one-way
- Every AC listed in the manifest appears in the title of an **active** test (`US-###/AC-##`). Citations in comments, `describe` titles, or skipped tests don't count. For a story **in delivery**, having no tests at all is a hard failure, not a pending warning. The reverse edge is checked too, because this rule reads the manifest: a story **file** with no manifest entry would otherwise escape it entirely. That is a warning while the story is being drafted and an error once its branch is in delivery, and a branch naming a story with no file at all is always an error
- Story→ADR `decisions` links and `lessons` entries in the manifest resolve to real artifacts
- **A development spec package, when one exists, is internally honest.** Every `FR-##`/`NFR-##` in its `spec.md` has a row in `traceability.md`, every file path that table cites exists, every `US-###`/`AC-##` it names resolves, it has a row in `inception/specs/index.md`, and a Gate D1 approval block is well-formed and matches the plan it approved. An edit after approval needs a dated `change-log.md` row. **An absent package requires nothing**: CI cannot know the task's tier, and Simple-tier work legitimately has none ([ADR-007](../knowledge/decisions/ADR-007-dev-spec-packages.md))
- Product projects (`api`, `ui`, `graph-engine`) have runnable test targets
- The distributable plugin payload matches its sources, with no stale files (`aidlc-build-plugin.mjs --check`)
- **Framework files are locked; project files are yours.** The framework is a shared library: adopting teams edit only what installation generates for them — `ai/standards/` and `ai/project-context.md` (tailored to their stack by `/aidlc-init`'s interview), `ai/templates/jira/`, the traceability manifest, CI wiring — and never the framework itself (gates, roles, quality, context, artifact templates, the `aidlc-*` tools). `ai/framework-lock.json` records a SHA-256 per framework-owned file and this check fails on any edit or deletion until reverted. Wanting a different rule is legitimate. It goes upstream as a `change-request` issue against the framework. Maintainers regenerate the lock with `node tools/aidlc-check.mjs --lock` in the same PR as the framework change (never part of `--write`, which is routine and would re-bless local edits)
- **Cross-repo browser-test evidence, when a QA team publishes it.** `knowledge/traceability/e2e-coverage.json` is validated only if it exists: every criterion it claims must be one its story actually defines, a failing remote test is an error, and a pass must carry the run it came from. **No file means no requirement.** A project whose e2e tests live in this repo, or that has none, is untouched by this rule ([ADR-006](../knowledge/decisions/ADR-006-e2e-testing-layer.md)). What it deliberately cannot prove: that a remote assertion ran (see [`standards/testing-standards.md`](standards/testing-standards.md))
- Every persona has a charter, a skill and an agent that agree — and the personas with no authority to change anything (Architect, Manager) still disallow the write tools
- **Jira ticket templates are safe.** No template may declare a field that forwards approval (status, sign-off) or duplicates what Jira owns (sprint, assignee, estimate); placeholders must all be known; recorded ticket keys must be well-formed. A **missing** key is only a warning. Jira going away must never break the build ([`context/jira-sync.md`](context/jira-sync.md), [ADR-002](../knowledge/decisions/ADR-002-jira-tracking-flow.md))
- **Design is enforced, not conventional.** A story with a `## UI` section cites a screen; a screen's `ST-##` states match its manifest entry (each state is one frame in the design tool, named `WF / SCR-### · <screen> / ST-##`); every screen is reachable (`entry` or another screen's `links_to`); text-on-surface token pairs below WCAG AA 4.5:1 warn; `inception/design/tokens.json`, the designer's tool-agnostic export, is generated from `tokens.css` and never hand-edited. Same escalation as tests: incomplete is a warning before delivery, an error on the `feat/US-###` branch

**"In delivery" is derived, not declared.** Status lives on GitHub, so the check reads the branch under review (`GITHUB_HEAD_REF` on a PR, else the checked-out branch) against the Gate 2 convention `feat/US-###-<slug>`. A story PR that ships code with no AC-citing tests fails CI; the same story on a `docs/` branch is simply not started yet. Override for local runs: `--delivery=US-002`.

**What it cannot prove.** The check verifies an active test _named_ after the AC exists and passes, not that its assertions are meaningful. `it('… (US-002/AC-04)', () => {})` satisfies the tooling. Judging whether a test actually exercises the criterion is the reviewer's job (`ai/quality/review-checklist.md`), and it's why the DEV charter's default rhythm is test-first: a test that failed once is honest by construction.

Branch protection on `main` requires this status + a human review. Without those two settings the framework is optional. Enabling them is step zero.

> **Current limitation (2026-07-21):** this repo is private on a GitHub Free plan, where branch protection is unavailable (attempted via API — 403, Pro or public repo required). Until the repo is made public or upgraded, the merge policy runs on convention with `aidlc-check` red/green visible on every PR but not blocking. Decision owner: repo admin.

## Artifact map

| Folder                    | Contents                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ai/`                     | Shared AI layer: charters, gates, templates, standards, context rules — stage-neutral, stays at the root                                   |
| `inception/product/`      | BRDs (`REQ/NFR/RISK` IDs), raw customer inputs (verbatim, in `inputs/`)                                                                    |
| `inception/stories/`      | Epics + user stories with numbered AC                                                                                                      |
| `inception/design/`       | Research pass (`research/`, `ia.md`, `principles.md`), screen specs (`SCR-###`, numbered `ST-##` states), canonical `tokens.css` + generated `tokens.json`, `wireframe-rules.md` for the frame side (frames live in the design tool) |
| `inception/architecture/` | DB design + app architecture (Architect's Gate 1 deliverable) — advisory, non-blocking, superseded by migrations + OpenAPI in Construction |
| `knowledge/traceability/` | `manifest.json` (source of truth) + generated matrix view                                                                                  |
| `knowledge/decisions/`    | ADRs — only for decisions with real trade-offs (executable contracts — OpenAPI at `/api-docs-json`, TypeORM migrations — carry the rest)   |
| `apps/`, `libs/`          | Product code (Construction), in this reference project's layout; tests sit beside the code they cover. The validator finds them by asking git, so any layout works                       |
| `<e2e-root>/`             | Browser tests, when installed: `plans/US-###.md` (reviewed first) + generated specs. Placement is chosen at install and recorded only by `testDir` in `playwright.config.ts` ([ADR-006](../knowledge/decisions/ADR-006-e2e-testing-layer.md))  |

`knowledge/` is deliberately **not** under a lifecycle stage: traceability and decisions are referenced from all three, so filing them under one would misrepresent their lifetime. Construction lives in `apps/`/`libs/` at the root. The framework governs artifact layout, not where an adopting project keeps its source, and the validator finds test files by asking git rather than by assuming a directory. `operations/` is created when the first release artifact lands, not scaffolded empty.

## ID scheme

```
REQ-### functional requirement   NFR-### non-functional   RISK-### risk
US-###  user story               AC-##   acceptance criterion (scoped: US-002/AC-04)
SCR-### screen spec              ST-##   screen state       (scoped: SCR-002/ST-04)
ADR-### architecture decision
```

`ST-##` is to a screen what `AC-##` is to a story: the numbered thing that must exist, and the reason a reviewer can tell that nothing was skipped.

Change requests and bugs are GitHub issue numbers (`#12`), not file IDs. Test cases are test names citing `US-###/AC-##`, not documents. `aidlc-check` rejects duplicate IDs; allocate the next free number (CI catches races).

## Getting started

New team member? Start with the root [`ONBOARDING.md`](../ONBOARDING.md) (~15 minutes, any role). Otherwise: type `/aidlc` (or your role's command) in Claude Code in this repo. The persona introduces itself, reads the project state from GitHub, and interviews you in plain language. Approving anything = reviewing a PR in the GitHub web UI. The persona prepares the PR and sends you the link.
