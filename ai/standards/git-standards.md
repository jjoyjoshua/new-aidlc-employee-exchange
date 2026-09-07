# Git standards

## Branches

| Purpose                        | Pattern                           |
| ------------------------------ | --------------------------------- |
| Story implementation (Gate 2)  | `feat/US-###-<slug>`              |
| Bug fix (issue-linked)         | `fix/<issue#>-<slug>`             |
| Gate 1 artifacts (BRD/stories) | `docs/<slug>`                     |
| Pipeline / CI                  | `ci/<slug>`                       |
| Refactor / chore               | `refactor/<slug>`, `chore/<slug>` |

Never commit directly to `main`. Branch protection enforces it.

## Commits — conventional commits + artifact IDs

```
<type>(<scope>): <imperative summary> [<ARTIFACT-ID or #issue>]

- bullet per meaningful change
```

Types: `feat fix docs test refactor ci chore perf`. Scope = Nx project or domain (`routing`, `ui`, `graph-engine`, `product`, `stories`...). The reference links the commit into traceability: `[US-###]` for story work, `[#12]` for issue-driven fixes, `[BRD-###]` for Gate 1 artifacts.

Example:

```
feat(routing): implement Dijkstra shortest path [US-002]

- adjacency + feasibility pruning per ADR-001
- tests for US-002/AC-01..AC-05 incl. disconnected-graph edge case
```

## PRs

- One story (or one artifact set, or one fix) per PR
- Description from `ai/templates/pr-description.md`; fix PRs include a regression test citing the issue
- `node tools/aidlc-check.mjs` green locally before requesting review
- Merge = the gate: required CI statuses + human GitHub review (`ai/gates/delivery.md`, solo policy included)
- Squash-merge; delete branch after
