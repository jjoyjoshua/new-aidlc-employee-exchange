# US-### — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                  |
| --------- | ------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-###-<slug>.md` |
| **Spec**  | `spec.md`                                        |
| **Tier**  | Simple \| Medium \| Complex                      |

## Approval — Gate D1

| Field                | Value           |
| -------------------- | --------------- |
| Status               | awaiting review |
| Approved by          | —               |
| Approved on          | —               |
| Plan commit approved | —               |

`Approved by` is the human's name and email from `git config user.name` / `user.email`; if either is unset, ask them rather than writing `unknown`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**, the commit before this stamp. That SHA is what makes the approval verifiable: a reviewer at D2 runs `git diff <sha> -- <this file>` and sees whether the plan changed after approval. The name is self-asserted, so it is attribution, not authentication.

## Steps

Ordered. Each step names the files it touches, the `FR-##` it advances, and how it is verified. Test-first per acceptance criterion: the failing test named `... (US-###/AC-##)` comes before the code that turns it green.

### Step 1 — <what this step delivers>

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-01                                                      |
| Files    | `path/to/file.ts` (modify), `path/to/new.spec.ts` (create)  |
| Verify   | `<the exact command>` — expected: <the exact result>        |

### Step 2 — <what this step delivers>

| Field    | Value                                               |
| -------- | --------------------------------------------------- |
| Advances | FR-02                                               |
| Files    | `path/to/other.ts` (modify)                         |
| Verify   | `<the exact command>` — expected: <the exact result> |

## Rollback

How to undo this if it goes wrong after merge: revert the PR, or the specific data or config step that a revert would not cover.

## Open questions

| Question                                         | Owner         | Blocks |
| ------------------------------------------------ | ------------- | ------ |
| <what could not be answered by reading the code> | <who decides> | Step N |

A non-empty table blocks the D1 approval. Answer or close every row before asking for `go`.
