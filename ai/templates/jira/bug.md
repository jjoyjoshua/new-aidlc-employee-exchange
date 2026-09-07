---
issuetype: Bug
summary: 'Bug ${ISSUE_NUMBER} — ${TITLE}'
labels: [aidlc, bug]
priority: '${SEVERITY}'
---

## What goes wrong

${ACTUAL}

## What should happen instead

${EXPECTED}

## How to see it

${STEPS}

## Where it was seen

${ENVIRONMENT}

## Which criterion this breaks

${STORY_ID} / ${AC_ID} — [${STORY_ID}](${ARTIFACT_URL})

---

### Tracking

| Field    | Value        |
| -------- | ------------ |
| Severity | ${SEVERITY}  |
| Report   | ${ISSUE_URL} |
| Fix      | ${PR_URL}    |

_A fix for this cannot be accepted without a test that reproduces it first, so the same break cannot return unnoticed. Tracked automatically from the team's repository._
