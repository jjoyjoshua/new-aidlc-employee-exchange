# Onboarding

About 15 minutes, whatever your role. This repository runs **AI-DLC**: you work
with an AI persona for your role, and approvals are GitHub pull-request reviews
rather than chat text — with one exception, called out below.

## 1. The shortest possible version

Work moves through three gates. Each one asks a single question, and a human
answers it by approving a PR:

| Gate            | Question                        | Who drafts                  |
| --------------- | ------------------------------- | ---------------------------- |
| **1 Discovery** | Are we building the right thing? | BA, UX, Architect            |
| **2 Delivery**  | Does this story provably work?   | DEV, QA, Architect           |
| **3 Release**   | Can we ship it safely?           | DevOps                       |

Nothing is "approved" because an AI said so. Approval is your click in GitHub,
recorded against your identity, on a branch that CI has already checked. One
exception, named on purpose: the developer's implementation plan is approved in
chat, before any code exists, because a pull request at that point is a review
people learn to skip. Your name and the version you read are written into the
plan, and CI fails a plan that changed afterwards without saying so.

## 2. Start your persona

In your editor, type the command for your role:

```
/aidlc        not sure? start here — it works out who you are and routes you
/ba           requirements, stories, change requests
/ux           screens, states, the design system
/architect    system + DB design, ADRs, PR review
/dev          plan a story, get the plan approved, then implement it as one PR
/qa           tests derived from requirements, browser tests, bug reports
/devops       CI, releases, rollback
/manager      status, routing, delivery plans
```

Works in Claude Code, Cursor, opencode and GitHub Copilot — the personas are
pinned in this repository, so cloning it is your whole setup.

The persona interviews you in plain language. You do **not** need to know the
framework, the file layout, or git to use it. If one starts talking in paths and
IDs, tell it to explain in plain words — that is in its charter.

## 3. What building something actually looks like

A story is approved and it is yours. You type `/dev` and name it. From there:

| #   | Who     | What happens                                                                                                                              |
| --- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | AI      | Reads the story, sizes the task, verifies what it can by reading your code, and **asks** about anything it cannot verify                    |
| 2   | AI      | Writes a spec package into `inception/specs/US-###-<slug>/` — the technical requirements, an ordered implementation plan, and what the change will touch |
| 3   | **You** | **Gate D1.** Read `implementation-plan.md` and `impact-analysis.md`. Reply `go`, or say what is wrong. Any open question is answered first |
| 4   | AI      | Writes your name, the date, and the exact version you approved into the plan                                                                |
| 5   | AI      | Implements it — a failing test per acceptance criterion first, then the code that turns it green                                            |
| 6   | AI      | Records where each requirement landed, and pastes real command output into the pull request                                                 |
| 7   | **You** | **Gate D2.** Review the PR in GitHub, run anything that has to be checked by hand, merge                                                    |

**Two decisions, both yours: the plan, then the merge.** Everything between them
the AI owes you without asking again.

Why the plan is reviewed first: a wrong assumption costs a sentence to fix in a
plan and a rewrite to fix in a diff. Step 4 exists so that pause leaves a trace
— if the plan changes after you approved it, CI fails the PR unless the change
was written down.

**A one-line fix does not get all of this.** For a docs edit or a string change
you get the sizing and a `go`, nothing more. The bigger the surface the task
crosses — a new endpoint, a schema change, anything touching auth — the more of
the package it writes. It says which size it picked and why, so you can argue.

**Changed your mind, or the work grew?** Say so. It stops, re-presents, and waits
for a fresh `go` rather than quietly widening the diff.

## 4. Where things live

| Folder                    | What                                                       |
| ------------------------- | ------------------------------------------------------------ |
| `ai/`                     | The framework: role charters, gates, standards, templates   |
| `inception/product/`      | Requirements (`REQ-###`)                                     |
| `inception/stories/`      | Stories (`US-###`) and their numbered acceptance criteria    |
| `inception/design/`       | Research, IA, screen specs, design tokens, wireframe rules  |
| `inception/architecture/` | DB design + app architecture                                |
| `inception/specs/`        | One folder per story being built: technical requirements, the approved plan, impact, decisions, traceability |
| `knowledge/`              | Traceability manifest and architecture decisions (`ADR-###`) |
| `<e2e-root>/`             | Browser tests, if this project installed them: reviewed plans + generated specs. Where it is comes from `testDir` in its `playwright.config.ts` |

## 5. The one rule worth memorising

If something is unclear, the persona asks — it does not guess. Hold it to that.
A confident wrong answer costs more than a question.

---

**This file is yours.** Replace this section with what a new joiner on *your*
project needs: the domain in a paragraph, how to run things locally, who to ask.
Run `/aidlc` and say "help me write the project part of ONBOARDING.md".
