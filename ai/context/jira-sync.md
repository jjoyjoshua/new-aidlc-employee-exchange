# Jira sync — binding rules for every persona

Jira is a **parallel tracking flow**: it makes work visible, shareable with the client, and gives tests a trackable home. It is **not an approval surface**. This file binds every persona the same way `guided-interaction.md` does. The decision and its costs are recorded in [ADR-002](../../knowledge/decisions/ADR-002-jira-tracking-flow.md).

## What Jira is for here

| Purpose               | What that means in practice                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Delivery tracking** | Epics and stories appear on the board the team already runs. Sprints, assignees and estimates stay Jira's business                              |
| **Client visibility** | A client reads tickets, not a repository. Tickets are written to be read by someone outside the team                                            |
| **Test evidence**     | Each acceptance criterion gets a test ticket whose result is filled from a real CI run, so "what was tested" is answerable without reading code |
| **Not approval**      | No Jira field, transition, or comment opens or closes a gate                                                                                    |

## The one rule that matters

```
GitHub  ─────────────────────────►  Jira
(truth: approvals, status, checks)   (tracking · client view · test evidence)

Jira  ───────────────────────────►  inception/product/inputs/
(a ticket someone filed)             (raw input, verbatim — like any customer need)

Approval  ───────────────────────►  ✗  never leaves GitHub, in either direction
```

**Approval never travels.** A ticket transitioned to Done, a sign-off field, a comment saying "approved" — none of these constitute a gate approval. Gate approval is a GitHub pull-request review bound to a commit SHA. If a ticket says approved and no GitHub review exists, the work is **not** approved, and a persona asked to proceed on that basis must say so plainly and stop.

The reason is identity, not preference. A pull-request review authenticates who approved exactly which bytes. A ticket field authenticates nothing once it has crossed an integration boundary. It can be set by an automation, a bulk edit, or anyone with edit rights, and _what_ was approved is no longer recoverable. That is the single thing this framework cannot forward through an integration.

## Writing for a client

Because tickets are shared outside the team, they are held to a different standard than a commit message:

- **Plain language.** The summary and description say what the user gets, not how the code is organised. No repository paths as the payload, no framework vocabulary a client has never seen.
- **Internal detail goes in a comment, not the description.** File paths, branch names, and implementation notes are useful to the team and noise to a client. The description is the client-readable part.
- **Never leak what is not theirs.** Other clients' names, internal cost figures, unrelated security findings, or credentials must never reach a ticket. When in doubt, leave it out and say so in the pull request.
- **An open question stays visibly open.** If a requirement is unresolved, the ticket says so with the owner. A ticket that reads as settled when it is not is worse than no ticket.

## What syncs, and in which direction

| Fact                                      | Direction     | Notes                                                                      |
| ----------------------------------------- | ------------- | -------------------------------------------------------------------------- |
| Epic and story tickets                    | GitHub → Jira | Created from the merged artifact, never before Gate 1 merges               |
| Acceptance criteria text                  | GitHub → Jira | Copied for readability; the repository file stays canonical                |
| **Test ticket per acceptance criterion**  | GitHub → Jira | One per `AC-##`, linked to its story; see below                            |
| **Test result + the CI run it came from** | GitHub → Jira | Filled from a real run only. Never typed by hand, never inferred           |
| Delivery status (in progress / merged)    | GitHub → Jira | Derived from the PR and check runs                                         |
| Deep links to the artifact and the PR     | GitHub → Jira | So Jira is never where someone reads the spec                              |
| Bug and change-request tickets            | either        | Whichever system it was filed in; the counterpart is created, cross-linked |
| A ticket describing a new need            | Jira → GitHub | Saved verbatim to `inception/product/inputs/`, then treated as raw input   |
| **Approval, sign-off, gate state**        | **never**     | GitHub reviews only                                                        |
| **Sprints, assignees, estimates, boards** | **never**     | Jira owns these outright — the repository does not model them              |

That last row is deliberate: duplicating sprint and assignee data into the repository would recreate the status-file anti-pattern the framework was rebuilt to remove.

## The test flow

This is the part that earns Jira its place. Our tests already cite the criterion they prove (`US-003/AC-02` in the test name), and CI already runs them. The sync turns that into something a client or a test manager can read:

```
AC-02 in the story  →  test ticket "US-003/AC-02 — Leg detail expanded"
                       linked to the story ticket
                       result: Pass / Fail / Not yet automated
                       evidence: the CI run URL and the test's file
```

Rules:

- **A result is only ever written from a real run.** No manual pass. If a criterion has no automated test yet, the ticket says `Not yet automated`, which is honest and, unlike a green tick nobody earned, actionable.
- **The test name is the identifier.** `aidlc-check` already proves every criterion is cited in an active test, so the ticket and the code cannot drift apart without CI noticing.
- **A failing test is never re-marked as passing in Jira.** The fix is a fix.

## Who may write to Jira

| Persona                  | May write                                                               |
| ------------------------ | ----------------------------------------------------------------------- |
| `/manager`               | Yes — tracking status and cross-linking is its job                      |
| `/ba`                    | Yes — epic and story tickets after Gate 1 merge; change-request tickets |
| `/qa`                    | Yes — bug tickets and the test tickets above                            |
| `/ux`, `/dev`, `/devops` | Read only — route ticket work to the personas above                     |
| `/architect`             | **Read only, always**                                                   |

**A note on the two advisory personas.** `/architect` and `/manager` are read-only _in this repository_ by tooling. Their agents disallow `Write` and `Edit`. That guarantee covers files, **not external systems**: a write-capable Jira tool is not the `Write` tool, so the existing restriction does not reach it. `/manager` writing tracking status to Jira is inside its charter. It reports, it does not author product state. `/architect` writing anything to Jira is not, and that limit is a charter rule rather than a tool restriction, stated plainly rather than pretended to be enforced.

## How a persona writes to Jira

**Never by ad-hoc API or MCP calls.** Every write goes through one tool, so there is one place where these rules are actually applied:

```bash
node tools/aidlc-jira.mjs --story US-003             # dry run — prints the payload, writes nothing
node tools/aidlc-jira.mjs --story US-003 --tests     # include a test ticket per AC
node tools/aidlc-jira.mjs --story US-003 --apply     # perform the write
```

Dry run is the default and needs no credentials, so the exact payload for any ticket can be reviewed in a pull request before it touches a live instance.

**Reads are a different question, and the tempting direction.** A QA engineer holding a ticket key and no story ID needs to get from `LOG-142` to `US-003`. That resolution is a **read**: it goes through the `jira` field recorded in `knowledge/traceability/manifest.json`, and a read-only Jira MCP may fetch the ticket to discover the key. The story text itself always comes from GitHub. A ticket is never a source of requirements. If a key resolves to no story in the manifest, the story is not merged, and the persona stops and says so rather than generating work from ticket prose. Same rule as the table above, applied where people actually bend it.
 The tool refuses to write approval-bearing or Jira-owned fields — done transitions, sign-off fields, sprint, assignee, estimate — regardless of what a template or a task instruction asks for. If the tool cannot do what a task needs, that is a change to the tool through a normal PR, not a reason to reach for the API.

## Ticket format

Templates are authored in **Markdown**. Jira accepts none. The Cloud editor's apparent Markdown support is it converting as you type. The tool converts at the API boundary:

- `--api v3` (default) → **Atlassian Document Format**, the JSON structure Jira Cloud stores rich text in
- `--api v2` → **wiki markup**, for Jira Server / Data Center

Authoring in Markdown keeps the wire format in one function rather than five template files, and means a template is reviewable and formattable like any other file in the repository. `aidlc-check` rejects wiki markup left in a template, because it would be converted twice and reach a client as noise.

## Configuration

Instance facts live in the environment, never in the repository:

| Variable           | Meaning                                        |
| ------------------ | ---------------------------------------------- |
| `JIRA_BASE_URL`    | e.g. `https://acme.atlassian.net`              |
| `JIRA_PROJECT_KEY` | e.g. `LOG` — where tickets are created         |
| `JIRA_EMAIL`       | Account the API token belongs to               |
| `JIRA_API_TOKEN`   | API token. Never committed, logged, or printed |

The tool masks the token in all output. A missing variable fails `--apply` with a clear message and never falls back to a guess.

## Traceability

A ticket key is recorded on the artifact it tracks, in `knowledge/traceability/manifest.json`:

```json
"US-003": { "...": "...", "jira": "LOG-142" }
```

`aidlc-check` validates the key's shape and that it matches `JIRA_PROJECT_KEY` when that is set. The key is a **convenience edge for humans**, not a governance edge: no gate depends on it, and a missing key is a warning. **Jira going away must never break the build.** That is the test of whether this integration stayed in its lane.

## When Jira and GitHub disagree

GitHub wins, always. A persona that notices a mismatch:

1. Re-syncs from GitHub if it is stale tracking data
2. Raises it with the human if it implies someone changed scope in Jira

Never resolve a disagreement by editing the repository to match Jira. That is the reverse direction, and it is how a governance model quietly acquires a bypass.
