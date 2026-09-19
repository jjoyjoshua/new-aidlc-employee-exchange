# US-016 — change log

> The curated history of this spec: what changed and why, in the words of whoever changed it. Git holds every edit; this holds the ones that mattered. A Medium-tier change to an existing package appends a row here.

| Date       | Change                                 | Why                    | Requirements affected        |
| ---------- | ----------------------------------------- | -------------------------- | ----------------------------- |
| 2026-09-19 | Package created: `spec.md`, `implementation-plan.md`, `impact-analysis.md`, `decisions.md`, `traceability.md`, this file, on top of the Architect's `design-note.md` | DEV picks up US-016 (desk inventory), the next unimplemented story in dependency order after US-011–US-015 | FR-01 through FR-11, NFR-01, NFR-02 added |
| 2026-09-19 | All 14 implementation-plan steps completed, test-first: contract, repository, service, `StatusChip`'s third variant, the moved `use-desks`/`fetch-desks` hook, and the new `screens/desks/` screen. `traceability.md` and this package's status updated to reflect it | Gate D1 `go` received; ready for the human to commit, push, and open the story PR | FR-01 through FR-11, NFR-01, NFR-02 — all implemented |

A plan edited after its Gate D1 approval **must** have a row here **dated on or after the approval date**. Check 16 compares the plan against the approved SHA and fails a silent change; an older row does not cover a newer edit.
