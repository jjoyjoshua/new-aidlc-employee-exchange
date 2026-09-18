# US-002 — change log

> The curated history of this spec: what changed and why, in the words of whoever changed it. Git holds every edit; this holds the ones that mattered. A Medium-tier change to an existing package appends a row here.

| Date       | Change                                                                                                                                          | Why                                                                                                                                                                                                | Requirements affected |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 2026-09-18 | Package created — `spec.md`, `implementation-plan.md`, `impact-analysis.md`, `decisions.md`, `traceability.md`, this file, and the Architect's `design-note.md` | Second story of delivery, classified Complex (new write endpoint, session-termination trust surface). Written before any code, per `ai/gates/delivery.md` Gate D1 | FR-01 – FR-15 created |
| 2026-09-18 | `AccountMenu`'s disclosure (`D-05`/`FR-09`) superseded by `D-06`: static, always-visible Whoami + Sign out footer rows, per the hi-fi Figma sidebar. Plan lives in `US-001-sign-in/implementation-plan.md`'s addendum, since the same PR restyles `AppShell` too | `D-05` itself flagged this as an open question pending UX confirmation (design-note.md §6.1); the Figma file is that confirmation. Put to the human explicitly before proceeding — this changes tested behaviour from an already-merged story | FR-09 description superseded; AC-01 unchanged |

A plan edited after its Gate D1 approval **must** have a row here **dated on or after the
approval date**. Check 16 compares the plan against the approved SHA and fails a silent change;
an older row does not cover a newer edit.
