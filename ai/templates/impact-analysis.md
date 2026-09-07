# US-### — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                  |
| ----------- | ------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-###-<slug>.md` |
| **Tier**    | Complex                                          |
| **Updated** | YYYY-MM-DD                                       |

## Surfaces crossed

Name the classification surface, not a vague area. The five are in `ai/context/task-classification.md`.

| Surface                  | Crossed? | What exactly                                    |
| ------------------------ | -------- | ----------------------------------------------- |
| Contract                 | yes/no   | <the endpoint, prop, event, or CLI argument>     |
| Persistence              | yes/no   | <the entity, column, index, or migration>       |
| Trust                    | yes/no   | <the guard, role, credential, or PII path>      |
| Dependency & integration | yes/no   | <the package or external service>               |
| Operational              | yes/no   | <the job, env value, or middleware>             |

## Files and callers

Every changed symbol, and who calls it. A caller nobody listed is a regression nobody predicted.

| File              | Symbol         | Change    | Callers found (`file:line`)   |
| ----------------- | -------------- | --------- | ----------------------------- |
| `path/to/file.ts` | `functionName` | signature | `path/a.ts:12`, `path/b.ts:88` |

## Regression risk

| Area                | Risk              | Why                                          | Covered by             |
| ------------------- | ----------------- | -------------------------------------------- | ---------------------- |
| <feature or module> | high/medium/low   | <the mechanism by which it could break>      | TC-## or the test path |

## Deliberately not touched

- <what sits right next to this change and stays as it is, so a reviewer does not read the omission as an oversight>
