# AI context loading — cost guidance

**Honest classification (post-review): this is efficiency guidance, not governance.** Nothing can verify what a persona actually read; what the framework _enforces_ lives in CI and branch protection. Follow this to keep sessions fast, cheap, and focused, not because it's checked.

## The rule

0. Tier the task first ([`task-classification.md`](task-classification.md)) — the tier sets the budget below
1. Start from the task's artifact (a story, a BRD section, a PR, an issue)
2. Follow its ID links one hop upstream (story → its REQs) and to its gate's listed inputs
3. Load your charter (`ai/roles/`) + the gate doc (`ai/gates/`). In a standalone QA repo there are no gates and no `inception/`: load the charter, `standards/testing-standards.md`, and read the story from the product repo over `gh api`
4. Load only the standards your task touches (coding for implementation, testing for tests, ...)
5. Load code only for the modules under change

## Budget per tier

| Tier        | Budget       | Load                                                                                             |
| ----------- | ------------ | ------------------------------------------------------------------------------------------------ |
| **Simple**  | **Minimal**  | The one artifact or file asked about. Nothing else — no charter chain, no standards               |
| **Medium**  | **Standard** | Charter + gate doc + the story and its AC + the standards the change touches + modules under change |
| **Complex** | **Full**     | Standard, plus the covering ADRs, the architecture deliverable, and the contract/schema the change crosses |

## Example — implementing a story

```
US-### story → AC → inline UI sketch → covering ADR
→ coding standards → api/security standards → modules under change
```

Not `apps/`, not other features, not the full BRD.

## Anti-patterns

- "Let me read the whole repo first" — follow the chain instead
- Loading downstream artifacts to write upstream ones (implementation details don't belong in requirements)
- Re-litigating merged artifacts — approved is settled; changes go through a `change-request` issue and a new PR
