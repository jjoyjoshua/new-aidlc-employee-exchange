# Jira ticket templates

Templates a persona fills in to create or update a Jira ticket. Rules that govern _when_ and _whether_ to write live in [`ai/context/jira-sync.md`](../../context/jira-sync.md). Read that first; it is binding.

**Why these exist:** not everyone who needs to follow the work has repository access. The Jira board is how a client, a manager, or a tester sees what the team is doing. These templates make those tickets consistent and readable by someone who will never open a pull request.

## The templates

| File                | Creates               | From                                          |
| ------------------- | --------------------- | --------------------------------------------- |
| `epic.md`           | Epic                  | `EPIC-###` in `inception/stories/epics/`      |
| `story.md`          | Story                 | `US-###` in `inception/stories/user-stories/` |
| `test.md`           | Test                  | One per `AC-##` of a story                    |
| `bug.md`            | Bug                   | A GitHub issue labelled `bug`                 |
| `change-request.md` | Task (change request) | A GitHub issue labelled `change-request`      |

## How they work

Each file is frontmatter (the Jira fields) plus a body written in **ordinary Markdown**.

Placeholders use `${NAME}`, not `{{NAME}}`, which is monospace in Jira wiki markup.

```
---
issuetype: Story
summary: '${STORY_ID} — ${TITLE}'
labels: [aidlc]
---

## What this delivers

${STORY_STATEMENT}
```

**Jira does not accept Markdown over its API.** What looks like Markdown support in the Cloud editor is the editor converting as you type or paste. The two real wire formats are:

| Target                     | Format                                | Flag                 |
| -------------------------- | ------------------------------------- | -------------------- |
| Jira Cloud (REST v3)       | Atlassian Document Format (ADF JSON)  | `--api v3` (default) |
| Jira Server / DC (REST v2) | wiki markup (`h2.`, `*bold*`, `----`) | `--api v2`           |

So templates are authored in Markdown and `tools/aidlc-jira.mjs` converts at the API boundary. That keeps the format question in one function instead of five files, lets prettier format these files like any other Markdown, and means switching instance type is a flag rather than a rewrite.

Supported Markdown: headings, paragraphs, bullet lists, block quotes, pipe tables, thematic rules, and inline `**bold**`, `_italic_`, `` `code` ``, `[text](url)`. That is the whole subset the templates need. Anything richer would not survive both targets.

Fill them with the tool, never by hand:

```bash
node tools/aidlc-jira.mjs --story US-003            # dry run — prints the payload, writes nothing
node tools/aidlc-jira.mjs --story US-003 --tests    # also a test ticket per acceptance criterion
node tools/aidlc-jira.mjs --story US-003 --api v2   # render wiki markup instead of ADF
node tools/aidlc-jira.mjs --story US-003 --apply    # create or update in Jira
```

Dry run needs no credentials, so the exact ticket text can be reviewed in a pull request before it reaches a live board.

## Placeholders

Every placeholder any template uses. The tool fails loudly on an unknown one rather than sending `${SOMETHING}` to a client-visible ticket.

| Placeholder          | Filled from                                                       |
| -------------------- | ----------------------------------------------------------------- |
| `${STORY_ID}`        | `US-###`                                                          |
| `${EPIC_ID}`         | `EPIC-###`                                                        |
| `${TITLE}`           | The artifact's heading, minus its ID prefix                       |
| `${STORY_STATEMENT}` | The As a / I want / So that block                                 |
| `${GOAL}`            | An epic's goal paragraph                                          |
| `${REQ_LIST}`        | The requirements the story cites, with their text                 |
| `${AC_LIST}`         | Numbered acceptance criteria, Given/When/Then                     |
| `${SCREEN_LIST}`     | `SCR-###` screens serving the story, with their state count       |
| `${STORY_LIST}`      | Stories under an epic, with their tracked ticket keys where known |
| `${OPEN_QUESTIONS}`  | Unresolved questions with named owners, or an explicit "none"     |
| `${REPO_STATE}`      | `Draft — awaiting approval` or `Approved` — derived, never typed  |
| `${ARTIFACT_URL}`    | Deep link to the artifact on the default branch                   |
| `${PR_URL}`          | The pull request, when one exists                                 |
| `${AC_ID}`           | `AC-##`                                                           |
| `${AC_TITLE}`        | The criterion's heading                                           |
| `${AC_BODY}`         | Its Given/When/Then                                               |
| `${TEST_NAME}`       | The active test's name, which cites `US-###/AC-##`                |
| `${TEST_FILE}`       | Path of the test file                                             |
| `${RESULT}`          | `Pass` · `Fail` · `Not yet automated` — from a real run only      |
| `${CI_RUN_URL}`      | The CI run the result came from                                   |
| `${ISSUE_NUMBER}`    | GitHub issue number, e.g. `#12`                                   |
| `${ISSUE_URL}`       | Link to that issue                                                |
| `${REQUESTER_WORDS}` | The request verbatim, as the requester put it                     |
| `${BLAST_RADIUS}`    | What hangs off the affected requirement, read from the manifest   |
| `${DECISION_OWNER}`  | The named human who decides                                       |
| `${STEPS}`           | Reproduction steps                                                |
| `${EXPECTED}`        | Expected behaviour, citing the criterion                          |
| `${ACTUAL}`          | What actually happened, with real output                          |
| `${ENVIRONMENT}`     | Where it was seen                                                 |
| `${SEVERITY}`        | The human QA's call                                               |
| `${JIRA_KEY}`        | An existing ticket key, when updating                             |
| `${STORY_KEY}`       | The parent story's ticket key                                     |

## Editing a template

These are client-facing, so treat a change like a change to product copy:

- Plain language in the description. Implementation detail belongs in a comment, not here.
- Markdown only, and only the subset above. `aidlc-check` rejects wiki markup left in a template. It would be double-converted and reach a client as noise.
- Never add a field that carries approval or sign-off. The tool refuses to write those, and a template implying otherwise is misleading.
- Never add sprint, assignee, or estimate. Jira owns those; the repository does not model them.
- Keep the deep links. A ticket that cannot be traced back to its artifact is where drift starts.

`aidlc-check` verifies every template parses, that its placeholders are all known, and that none of them reaches for a forbidden field.
