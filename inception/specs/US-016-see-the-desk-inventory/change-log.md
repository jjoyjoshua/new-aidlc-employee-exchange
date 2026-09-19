# US-016 — change log

> The curated history of this spec: what changed and why, in the words of whoever changed it. Git holds every edit; this holds the ones that mattered. A Medium-tier change to an existing package appends a row here.

| Date       | Change                                 | Why                    | Requirements affected        |
| ---------- | ----------------------------------------- | -------------------------- | ----------------------------- |
| 2026-09-19 | Package created: `spec.md`, `implementation-plan.md`, `impact-analysis.md`, `decisions.md`, `traceability.md`, this file, on top of the Architect's `design-note.md` | DEV picks up US-016 (desk inventory), the next unimplemented story in dependency order after US-011–US-015 | FR-01 through FR-11, NFR-01, NFR-02 added |
| 2026-09-19 | All 14 implementation-plan steps completed, test-first: contract, repository, service, `StatusChip`'s third variant, the moved `use-desks`/`fetch-desks` hook, and the new `screens/desks/` screen. `traceability.md` and this package's status updated to reflect it | Gate D1 `go` received; ready for the human to commit, push, and open the story PR | FR-01 through FR-11, NFR-01, NFR-02 — all implemented |
| 2026-09-19 | CI's `aidlc-check` failed on PR #48: two test titles in `Desks.spec.tsx` and `DeskInventoryRow.spec.tsx` named `US-017`/`US-018`/`US-019` (as "the story that removes this disabled-control test"), and the check treats any literal `US-0NN` text in a test file as a citation requiring that story to list the file in its own manifest `tests[]` — which would have been a false citation, since these files prove no AC for those stories. Reworded to describe the future stories by feature name instead of ID | A citation the check cannot distinguish from a real one is worse than no citation; renaming preserves the human-readable forcing-function intent without polluting three other stories' manifest entries | none — wording only |

A plan edited after its Gate D1 approval **must** have a row here **dated on or after the approval date**. Check 16 compares the plan against the approved SHA and fails a silent change; an older row does not cover a newer edit.
