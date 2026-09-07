# PR: <type>(<scope>): <title> [US-###]

## Linked artifacts

- Story: `inception/stories/user-stories/US-###-<slug>.md` (Gate 1 baseline: <merge SHA>)
- ADR: `knowledge/decisions/ADR-###` (only if this PR adds one)
- Fixes: #<issue> (bugs/change requests, when applicable)

## AC → evidence

| AC    | Implemented in | Proven by (test name)          |
| ----- | -------------- | ------------------------------ |
| AC-01 | `<file>`       | `<spec>: '... (US-###/AC-01)'` |

## Command output (pasted, not summarized)

```
<lint / typecheck / test output>
```

## QA evidence

<Requirement-derived tests included (positive/negative/boundary per AC); exploratory notes; screenshots for UI.>

## Checklist

- [ ] Self-reviewed against `ai/quality/review-checklist.md`
- [ ] `knowledge/traceability/manifest.json` updated; `node tools/aidlc-check.mjs` green locally
- [ ] Regression test citing the issue (fix PRs only)
- [ ] No unrelated changes; docs updated where behavior/commands changed
