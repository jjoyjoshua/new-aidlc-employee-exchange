# Gate 2 — Delivery

**Question:** does this story provably work?
**Personas:** [DEV](../roles/dev.md) implements, [QA](../roles/qa.md) derives tests from requirements, [Architect](../roles/architect.md) advises (design note when risky, advisory review always)
**Approver:** a human, twice — **D1** the written implementation plan (in chat), **D2** the story PR (GitHub review)
**Cadence:** one PR per story — `feat/US-###-<slug>`

## Flow

```
Approved story (Gate 1 baseline)
→ DEV persona tiers the task (ai/context/task-classification.md) and, at Medium/
   Complex, writes the spec package into inception/specs/US-###-<slug>/ — spec,
   impact analysis, implementation plan, decisions, traceability seed
→ DEV presents TASK CLASSIFICATION + PLANNED CHANGES pointing at the written plan

▼ GATE D1 — plan review, IN CHAT. The human reads implementation-plan.md and
  impact-analysis.md and replies `go`. DEV stamps the approval into the plan
  (name + email from git config, date, approved SHA); the developer commits it.
  Open questions block the `go`.

→ [Complex tier, or a design with real trade-offs] Architect persona drafts the design
   note / ADR-### into the same PR, before implementation
→ DEV persona implements; QA persona derives tests FROM THE STORY (before reading the diff):
   positive per AC, then negative, then boundary — test names cite US-###/AC-##
→ [Browser-level criteria only] QA persona writes <e2e-root>/plans/US-###.md FIRST, the
   human approves that plan, and only then are Playwright tests generated from it
→ DEV fills traceability.md and change-log.md as the code lands; manifest.json updated
→ Architect persona reviews the diff (advisory: findings rated, verdict suggested)
→ PR description: AC→evidence table, real command output, QA notes

▼ GATE D2 — PR review, IN GITHUB. The developer verifies and tests: green
  statuses, TC-## rows marked Pass with dates. A human reviews and merges.
  Merged = delivered.
```

**Two human gates, and only two.** D1 is the `go` on a written plan; D2 is the GitHub review that merges. Everything between them — the Architect's advisory review, QA's requirement-derived tests, the design note at Complex tier — is a persona obligation, not another approval the human has to give. The one exception is browser-level work, which keeps its own plan review ([ADR-006](../../knowledge/decisions/ADR-006-e2e-testing-layer.md)); that belongs to the QA cycle, not the development cycle.

Everything for the story rides **one PR**: code, tests, ADR if any, manifest update. No separate architecture PR, no post-merge test PR.

## Gate checks

| Check                                                                                                 | Enforced by                                                    |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Lint, typecheck, build, tests green                                                                   | CI (required statuses)                                         |
| Every AC in the manifest has a passing test citing `US-###/AC-##` in an active test title             | `aidlc-check`                                                  |
| A story PR with no AC-citing tests at all fails — delivery is derived from the `feat/US-###-*` branch | `aidlc-check`                                                  |
| A story in delivery is actually **in** the manifest — an unmanifested story would escape the AC→test rule, since that rule reads the manifest | `aidlc-check`                                                  |
| Those tests actually assert the criterion (a citation alone is not proof)                             | Architect persona review + human review                        |
| Browser-level criteria: the plan was reviewed before the tests were generated from it                 | Human review of the plan's own PR                              |
| E2E tests in a **separate** QA repo cannot block this PR — their evidence file is validated when published, and its absence requires nothing | `aidlc-check` (check 15); blocking needs same-repo e2e |
| IDs/links valid, manifest consistent (incl. NFR nodes), plugin payload undrifted                      | `aidlc-check`                                                  |
| A Complex-tier change (contract, schema, or trust boundary) carries a design note written _before_ the code | Architect persona review + human review — tiers in [`context/task-classification.md`](../context/task-classification.md) |
| Design fits, no security holes, code quality                                                          | Architect persona review (advisory) + human review (authority) |
| A spec package present under `inception/specs/` is internally honest — every FR traced, every cited path real, an index row, a well-formed approval matching the plan it approved | `aidlc-check` (check 16)                                       |
| The package exists at all, at the tier that requires it                                               | DEV charter + human review at D1 — CI cannot know the tier      |
| Approval identity                                                                                     | GitHub review, protected `main`                                |

## Why D1 is not a PR review

Everywhere else in this framework, approval means an authenticated GitHub review — identity plus commit SHA, not editable text. Gate D1 breaks that on purpose, in one place: a plan review that costs a PR round-trip is a plan review developers learn to route around, and the whole point of D1 is that it happens before any code exists.

What replaces it is partial, and named as such. The stamp in `implementation-plan.md` records the approver's name and email from `git config`, the date, and the SHA of the plan as they read it. The SHA is verifiable. `git diff <sha> -- <plan>` shows whether the plan changed after approval, and check 16 fails a silent change. The name is not: a persona writes the block and `git config` is self-asserted, so this is **attribution, not authentication**. A team that needs the stronger guarantee requests a GitHub review on the same branch. The package is already committed there. Gate D2 is unchanged and still carries merge authority.

## Solo policy (the only one)

When one human wears author and reviewer hats: the Architect persona's review becomes **blocking by convention**. Its `blocker`/`major` findings must be resolved or explicitly rebutted in the PR thread before self-merge. The self-merge itself is honest and visible: GitHub records who merged. No logged exceptions, no pretend second human. With two+ humans, whoever didn't author reviews — role titles irrelevant.

## Defects

Wrong behavior, found by anyone → **GitHub issue labeled `bug`**: reproduction steps, expected (citing `US-###/AC-##`), actual (real output). No reproduction, no bug. It stays a question for the reporter.

- Fix PRs (`fix/<issue#>-<slug>`) **must add a regression test citing the issue** (`(#12)` in the test name) — reviewer rejects otherwise.
- If investigation shows the _requirement_ is wrong → relabel `change-request`, route to Gate 1.
- Severity is the human QA's call, on the issue. Critical = outranks in-flight stories.
