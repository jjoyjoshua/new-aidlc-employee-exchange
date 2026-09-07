# US-### — <Story title>

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-###-<slug>`) merging with every AC proven by a test named `... (US-###/AC-##)`.

|                |                                         |
| -------------- | --------------------------------------- |
| **Epic**       | EPIC-###                                |
| **Traces to**  | REQ-###, BR-###.#                       |
| **Priority**   | Must / Should / Could                   |
| **Estimate**   | <n> pts (AI draft — humans re-estimate) |
| **Depends on** | US-### or —                             |

## Story

As a <actor>
I want <capability>
So that <business value>.

## Acceptance criteria

### AC-01 <short name>

- **Given** <precondition>
- **When** <action>
- **Then** <observable result>

<!-- each AC individually testable; aidlc-check requires a citing test per AC at delivery -->

## Edge cases

- <boundary/negative/unusual conditions — or "none, because ...">

## UI (only if the story has one)

<Inline low-fi sketch (ASCII blocks), states (empty/loading/error/success), responsive + a11y notes. No separate wireframe documents.>

## QA notes

<Testability hints, data setup, risky areas.>

## API impacts

<Endpoints touched/created, validated against the OpenAPI contract; or "none".>
