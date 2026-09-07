# US-### — e2e plan

> Approval = review of this file's PR, **before** any test is generated from it. That review is the only cheap moment to catch a step that tests something adjacent to the criterion rather than the criterion itself.

|               |                                                            |
| ------------- | ---------------------------------------------------------- |
| **Story**     | `inception/stories/user-stories/US-###-<slug>.md`           |
| **Traces to** | REQ-###                                                    |
| **Target**    | `$E2E_BASE_URL`, or the `webServer` in `playwright.config.ts` |
| **Seed**      | `<e2e-root>/src/seed.setup.ts` — what data and which account |
| **Status**    | draft — awaiting review                                    |

## Scope

One or two sentences: which of the story's criteria are proven **here** rather than at unit or API level, and why the browser is needed for them. E2E is the slowest and flakiest proof available (`ai/standards/testing-standards.md`), so a criterion that a cheaper level can prove is not listed below.

## AC-## — <criterion title, copied from the story>

Every scenario is written so a human could execute it by hand, without reading code. That is what makes this plan reviewable on its own, and what lets generation produce a test without guessing intent.

### Positive

1. <action — where the user is, what they do>
2. <action>
3. <action>

**Expected:** <what is observably true afterwards: what is on screen, what the URL is, what the data now says. Observable behaviour, never an internal call.>

### Negative

1. <action that should be refused, or input that is invalid>

**Expected:** <the refusal the user sees, and that nothing changed>

### Boundary

1. <the case sitting exactly ON the limit the criterion names — not near it>

**Expected:** <which side of the limit the behaviour falls>

## AC-## — <next criterion>

### Positive

1. <action>

**Expected:** <observable result>

## Not covered here

| Criterion | Proven where instead |
| --------- | -------------------- |
| AC-##     | `<path>` — unit / API level |

A criterion in the story that appears in neither this plan nor this table is a gap, not a decision. Say so rather than leaving it out silently.
