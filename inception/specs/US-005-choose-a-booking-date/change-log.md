# US-005 — change log

> The curated history of this spec: what changed and why, in the words of whoever changed it. Git holds every edit; this holds the ones that mattered. A Medium-tier change to an existing package appends a row here.

| Date       | Change                                                                                                   | Why                                                                                          | Requirements affected |
| ---------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------ |
| 2026-09-18 | Package created: `spec.md`, `design-note.md` (Architect), `impact-analysis.md`, `decisions.md`, `implementation-plan.md`, `traceability.md` | US-005 tiered Complex (new endpoint-shaped question + shared component surface); the Architect's design note found no new endpoint is actually needed, so the plan is smaller than US-001–US-004's | FR-01 – FR-10, NFR-01, NFR-02 |
| 2026-09-18 | Plan approved at Gate D1 (base `94e9ce8`); Step 6 changed during implementation from "modify `AppShell`" to "render the page header inside `BookADesk`" (D-06) | `AppShell` is a documented structural stub the human asked to leave for a separate follow-up; the page header AC-07 needs is scoped to one screen, and every existing screen already renders its own heading the same way | FR-09 |
| 2026-09-18 | Fix: `BookADesk` wraps `DatePicker` in a centering anchor (`.book-a-desk__picker-anchor`), matching Figma's "Popover anchor" (node 44:4385) | Found by manual browser check against the confirmed Figma frames: the calendar was rendering left-aligned in the flex column instead of centred under the full-width strip | FR-06, FR-07 |

A plan edited after its Gate D1 approval **must** have a row here **dated on or after the approval date**. Check 16 compares the plan against the approved SHA and fails a silent change; an older row does not cover a newer edit.
