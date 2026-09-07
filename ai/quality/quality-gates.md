# Quality gates

Three gates, each answering one question, each approved by an authenticated GitHub action. Full definitions in `ai/gates/`:

| Gate        | Question         | Approval                     | Enforced by                                             |
| ----------- | ---------------- | ---------------------------- | ------------------------------------------------------- |
| 1 Discovery | Right thing?     | PO/BA merges the artifact PR | `aidlc-check` + protected `main` + review               |
| 2 Delivery  | Provably works?  | Human approves the plan (D1), then merges the story PR (D2) | CI (lint/typecheck/test/build) + `aidlc-check` + review |
| 3 Release   | Production safe? | Human approves promotion     | pipeline + environment approval                         |

## The enforcement contract

A gate rule exists only if something checks it:

- **`aidlc-check`** (required CI status): ID uniqueness, bidirectional traceability via `manifest.json`, AC→test coverage, test-target presence, plugin payload drift, and — only when a separate QA repo published it — the cross-repo e2e evidence file. The full numbered list is in the header of `tools/aidlc-check.mjs`; that file is the contract, this line is the summary
- **Branch protection on `main`**: required statuses + human review; no direct pushes
- **GitHub identity**: who approved what, against which commit SHA, never an editable header

Anything not covered by those is _advice to humans_, and the docs say so rather than pretending.

## Solo policy

One policy, defined once in [gates/delivery.md](../gates/delivery.md) §Solo: AI Architect review becomes blocking-by-convention, self-merge is visible in GitHub, no exception logs. Two+ humans: non-author reviews.

## Review checklist

[review-checklist.md](review-checklist.md) is the shared checklist for DEV self-review and Architect advisory review, unchanged in spirit: correctness → architecture → security → performance → accessibility → practices → clean code, findings rated `blocker/major/minor/nit`.
