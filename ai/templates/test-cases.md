# US-### — manual test cases

> **Only for scenarios that can never be automated.** There are three homes for a verification scenario and a criterion belongs to exactly one:
>
> | Scenario | Home |
> | -------- | ---- |
> | Provable at unit or API level | a test file, title citing `US-###/AC-##` — blocks via check 4 |
> | Needs a browser | `<e2e-root>/plans/US-###.md` (`ai/templates/test-plan.md`), approved then generated (ADR-006) |
> | Cannot be automated at all — a real email arriving, a third-party sandbox, a physical device, a visual judgement | this file |
>
> Most stories have no rows here, and that is the expected state, not a gap. Written by QA from the story, before reading the diff. Results filled in at Gate D2.

|             |                                                  |
| ----------- | ------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-###-<slug>.md` |
| **Updated** | YYYY-MM-DD                                       |

## TC-01 — <what this case proves>

| Field        | Value                                                        |
| ------------ | ------------------------------------------------------------ |
| Type         | manual / device / third-party / visual                       |
| Covers       | FR-01, AC-01                                                 |
| Why manual   | <what makes this impossible to automate — not "no time">     |
| Precondition | <the state that must exist first>                            |
| Action       | <what the tester does, step by step, without reading code>   |
| Expected     | <what is observably true afterwards>                         |
| Result       | —                                                            |
| Date         | —                                                            |

## TC-02 — <what this case proves>

| Field        | Value                                            |
| ------------ | ------------------------------------------------ |
| Type         | manual                                           |
| Covers       | FR-02, AC-02                                     |
| Why manual   | <what makes this impossible to automate>         |
| Precondition | <the state that must exist first>                |
| Action       | <what the tester does>                           |
| Expected     | <what is observably true afterwards>             |
| Result       | —                                                |
| Date         | —                                                |
