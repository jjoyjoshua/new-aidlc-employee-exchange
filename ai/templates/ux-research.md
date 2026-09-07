# Research — <feature/epic name> (serves BRD-###)

> Advisory input to the design step, reviewed in the 2a PR. Nothing here is a gate artifact; what it earns is the right of every screen, principle, and label downstream to cite evidence instead of taste. Honesty rule: findings not grounded in real user data carry `[SYNTHESISED — validate with users]`; a validation nobody ran carries `[PENDING]`. A synthesised finding and a validated one must never look the same.

|            |                                              |
| ---------- | -------------------------------------------- |
| **Serves** | BRD-### — the requirements this design reads |
| **Inputs** | <interview notes, analytics, surveys — or "none: synthesised from requirements"> |
| **Status** | draft — reviewed with the 2a design PR       |

## Assumptions

What the requirements take for granted but never state. Each row names the cost of being wrong — that is what decides which ones get tested.

| #   | Assumption | Risk if wrong | Confidence | Test? |
| --- | ---------- | ------------- | ---------- | ----- |
| A-1 |            |               | low / med / high | yes / monitor |

## Competitor scan

3–5 products solving the same job. Patterns, not features: what to borrow, what to avoid, and why. Where a competitor visibly breaks a usability heuristic (Nielsen's ten), name it in Avoid — that is the cheapest usability review we will ever get.

| Product | Nav model | Onboarding | Empty/error handling | Borrow | Avoid (incl. heuristic broken) |
| ------- | --------- | ---------- | -------------------- | ------ | ------------------------------ |
|         |           |            |                      |        |                                |

## User research

Per source (interview, survey, analytics): who, what they said or did, pain points, goals. Note how many sources hit each pain — frequency is what separates a theme from an anecdote. If no primary data exists, synthesise from the requirements and mark every finding `[SYNTHESISED — validate with users]` — the label is mandatory, not shameful. No data yet but users in reach? Ask `/ux` for an interview guide — 5–7 open questions derived from the assumptions table above.

Redesigning an existing product? Add a short heuristic pass of the current one (Nielsen's ten): its worst violations are requirements nobody wrote down.

### Vocabulary

What users call things vs. what the BRD calls them. IA labels and UI copy use the left column.

| Users say | Internal term | UI label |
| --------- | ------------- | -------- |
|           |               |          |

## Personas

1–3, grounded in the research above (or labelled `[SYNTHESISED]`). Screen specs cite these by ID.

### P-1 <name — role>

- **Context:** <device, frequency, competing tasks>
- **Primary job:** <JTBD statement>
- **Pain today:** <what breaks or costs time>
- **Drives:** REQ-###, REQ-###

## Journey — how the job gets done today

The current experience for the primary persona, workarounds included — not the future state we intend to build. The pain rows are where insights come from; a step with no pain is a step the design must not break.

| Stage | User does | Pain | Opportunity |
| ----- | --------- | ---- | ----------- |
|       |           |      |             |

## Insights

5–8, each with the design implication that makes it actionable ("so the design must…" is the How-Might-We, already answered). Principles cite these.

| ID         | Insight (what we learned) | So the design must… |
| ---------- | ------------------------- | ------------------- |
| INSIGHT-01 |                           |                     |

## Concept validation

For each high-risk/low-confidence assumption: what was shown to users, what happened, the call. If untested, write the plan and mark `[PENDING — test before build]`; the walkthrough must say so out loud.

| Assumption | Concept tested | With | Result | Call |
| ---------- | -------------- | ---- | ------ | ---- |
| A-#        |                | <n> users / `[PENDING]` | | GO / GO-WITH-CHANGES / NO-GO |
