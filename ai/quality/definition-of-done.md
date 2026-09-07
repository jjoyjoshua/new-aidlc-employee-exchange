# Definition of Done (user story)

A `US-###` is **done** when its story PR is merged to `main`, which by construction means:

- [ ] Every `AC-##` has a passing test citing `US-###/AC-##` in its name (`aidlc-check` verifies against the manifest)
- [ ] Lint, typecheck, build, tests green in CI on the merged commit
- [ ] Architect persona findings at `blocker`/`major` resolved or rebutted in the PR thread
- [ ] Human review + merge in GitHub (solo policy: gates/delivery.md §Solo)
- [ ] `knowledge/traceability/manifest.json` row complete (REQ ↔ US ↔ tests); matrix view regenerated
- [ ] Browser-level criteria: the plan (`<e2e-root>/plans/US-###.md`) was reviewed before its tests existed, and the specs are in `tests[]` — or, for a separate QA repo, the published evidence names this story and every claimed criterion passed
- [ ] The spec package required by the tier exists and is current: `traceability.md` filled in the same commits as the code, `change-log.md` appended, a row in `inception/specs/index.md`
- [ ] `implementation-plan.md` carries a Gate D1 approval — approver, date, and the SHA they read — and any post-approval edit has a `change-log.md` row
- [ ] Every `TC-##` in `test-cases.md` has a Result and a Date (there may legitimately be none)
- [ ] ADR added if the design had real trade-offs; docs updated where behavior/commands changed

No checklist theater: items 1, 2, and 5 are machine-checked; 3–4 are visible in the PR record. One honest exception: when a story's browser-level proof lives in a **separate** QA repo, item 1 cannot be machine-checked for those criteria. This repo can verify the shape of the evidence and that the criterion exists, never that the remote assertion ran. That is the cost of that topology, and it is why same-repo e2e is the default in [`../standards/testing-standards.md`](../standards/testing-standards.md). If it merged green through protected `main`, it's done. If it didn't, it isn't.
