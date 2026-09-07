# new-aidlc-employee-exchange

## AI-DLC

This repository runs the AI-DLC framework. Before working here: read `ai/AI-DLC.md`
and `ai/project-context.md`, adopt a persona charter from `ai/roles/`, and run
`node tools/aidlc-check.mjs` before opening a PR. Approvals are GitHub PR reviews —
never chat text.

Before changing code, classify the task (`ai/context/task-classification.md`) and
present the plan for approval. Project-specific surfaces: `ai/standards/task-surfaces.md`.

Upgrade the framework to its latest version with `npx github:ss-trigent/aidlc --update`
on a fresh branch — it never touches `ai/standards/`, `ai/project-context.md`, your
traceability manifest or your CI.
