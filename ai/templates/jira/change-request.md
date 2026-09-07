---
issuetype: Task
summary: 'Change request ${ISSUE_NUMBER} — ${TITLE}'
labels: [aidlc, change-request]
---

## What is being asked for

In the requester's own words:

> ${REQUESTER_WORDS}

## What it affects

Read from the team's traceability records, so nothing is missed:

${BLAST_RADIUS}

## Who decides

${DECISION_OWNER}

## What happens if it is accepted

The affected specification is not edited in place. It is reissued through the same review it passed the first time, so the change is as traceable as the original decision.

---

### Tracking

| Field         | Value         |
| ------------- | ------------- |
| State         | ${REPO_STATE} |
| Request       | ${ISSUE_URL}  |
| Change record | ${PR_URL}     |

_Tracked automatically from the team's repository. Acceptance of this change is recorded in the change record, not on this ticket._
