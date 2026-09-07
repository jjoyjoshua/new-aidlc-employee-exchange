---
issuetype: Test
summary: '${STORY_ID}/${AC_ID} — ${AC_TITLE}'
labels: [aidlc, test]
parent: '${STORY_KEY}'
---

## What is being proven

${AC_BODY}

## Result

| Field          | Value          |
| -------------- | -------------- |
| Outcome        | ${RESULT}      |
| Evidence       | ${CI_RUN_URL}  |
| Automated test | `${TEST_NAME}` |
| Location       | `${TEST_FILE}` |

## How this is verified

An automated test carries this criterion's identifier in its name, so the test and the criterion cannot drift apart without the build noticing. The result above is filled from a real pipeline run.

**Not yet automated** means exactly that: no test exists for this criterion yet. It is never a substitute for a pass.

---

### Covers

${STORY_ID} / ${AC_ID} — [${STORY_ID}](${ARTIFACT_URL})

_Tracked automatically from the team's repository. Results are never set by hand._
