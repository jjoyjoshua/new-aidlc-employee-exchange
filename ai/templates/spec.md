# US-### — <feature name>

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                   |
| ----------------- | ------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-###-<slug>.md`  |
| **Traces to**     | REQ-###, NFR-###                                  |
| **Screen**        | SCR-### — or `none` when the story has no UI       |
| **Covering ADRs** | ADR-### — or `none`                               |
| **Tier**          | Simple \| Medium \| Complex                       |
| **Status**        | draft \| approved \| implemented                  |
| **Updated**       | YYYY-MM-DD                                        |

## Problem

Two or three sentences in technical terms: what the system does today, and what it must do instead. The business case belongs in the story. Do not restate it.

## Functional requirements

Each `FR-##` is one testable behaviour, traced to the acceptance criterion it serves. An FR that serves no AC is scope the story did not ask for: delete it, or take it to the BA as a change request.

| ID    | Requirement                          | Priority | Serves | Status      |
| ----- | ------------------------------------ | -------- | ------ | ----------- |
| FR-01 | <observable behaviour, one sentence> | Must     | AC-01  | not started |
| FR-02 | <observable behaviour>               | Should   | AC-02  | not started |

## Non-functional requirements

| ID     | Requirement                                    | Serves           |
| ------ | ---------------------------------------------- | ---------------- |
| NFR-01 | <limit, budget, or guarantee, with its number> | NFR-### or AC-## |

## Technical constraints

- <a constraint the implementation must respect: an existing pattern, a layer rule, a contract that cannot change>

## Out of scope

- <what a reader might reasonably expect here and will not find, so nobody adds it later "for consistency">
