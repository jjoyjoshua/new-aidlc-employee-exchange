# US-029 — change log

| Date       | Change                                                    | Why                                                              | Requirements affected |
| ---------- | ----------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------ |
| 2026-09-21 | Package created: `spec.md`, `implementation-plan.md`, `decisions.md`, `traceability.md` | Gate D1 planning for US-029, chosen from the ready backlog (US-030/031 were also ready; US-029/US-032 carried an open change-request that turned out not to touch US-029's own ACs — issue #59) | FR-01 through FR-08 drafted |
| 2026-09-21 | Step 1's file list gains `domain/cancellation-copy.ts` + spec; D-05 rewritten as one template with two swapped fragments; D-07 added | Implementing Step 1, `domain/README.md` turned out to already name "what should this notification say? (BR-001.20)" as a domain-owned rule — the same BR-001.20 AC-04/05/06 cite. Plan approved before this file was re-read; the human's `go` covered the outcome (FR-01 unchanged), not this internal split | FR-01 (no AC change) |
| 2026-09-21 | Step 5 retargeted from the two real-Postgres concurrency spec files to `bookings.routes.spec.ts`/`admin.routes.spec.ts` | Implementing Step 5, both concurrency files turned out to call the repositories directly with no `notifications` dependency in scope — they cannot observe a send and were never going to prove FR-08. AC-09 splits into a DB-layer fact (already proven, unchanged) and a route-layer fact (new tests, correctly placed) | FR-08 (no AC change) |

A plan edited after its Gate D1 approval **must** have a row here **dated on or after the
approval date**. Check 16 compares the plan against the approved SHA and fails a silent change;
an older row does not cover a newer edit.
