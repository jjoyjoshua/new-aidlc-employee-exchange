# Testing standards

## Levels & placement

| Level                         | Tool                                         | Where                        |
| ----------------------------- | -------------------------------------------- | ---------------------------- |
| Unit                          | Vitest                                       | `*.spec.ts` next to the unit |
| Integration (API modules, DB) | Vitest + Nest testing module                 | `apps/api/**/*.spec.ts`      |
| API contract                  | Vitest (supertest-style) against running app | `apps/api`                   |
| UI component                  | Vitest (vitest-angular)                      | `apps/ui/**/*.spec.ts`       |
| Accessibility                 | story a11y notes + review checklist §5       | asserted in component tests  |
| Performance                   | budget asserts citing the NFR (`NFR-###`)    | `*.spec.ts` next to the code |
| End-to-end (browser)          | Playwright + `@playwright/mcp`               | `<e2e-root>/src/*.spec.ts`   |

Run via Nx only: `npm run test`, `npm run affected:test`.

## Rules

- Test the **requirement**: every TC cites `US-### / AC-##`; tests assert observable behavior, not implementation internals
- Per story: positive cases from AC, then negative, then boundary — all three classes or a written justification
- Deterministic tests only, no sleeps/real network/wall-clock deps; use fakes and fixed seeds
- Test names read as specs: `describe('RoutingService') → it('rejects shipment when no feasible route exists (US-003/AC-04)')`
- A red test is a finding: never deleted, skipped, or loosened to pass. Fix code or (with BA/human approval) fix the requirement
- Coverage: every AC ≥1 TC before a story is _done_; graph-engine algorithms additionally cover the documented edge cases
- **The AC citation is a label, not the proof.** `aidlc-check` can only confirm an active test named `US-###/AC-##` exists and passes. An empty body would satisfy it. The proof is the assertion, so write the test first and watch it fail; a reviewer who can't see which assertion maps to the AC treats that as a finding

## End-to-end

E2E is the **last** level, not the default one: it is the slowest and flakiest proof of any criterion, so it earns its place only for behaviour that genuinely spans the browser and the stack. A criterion provable at unit or API level is proven there, and the plan says where.

- **Placement is a decision, not a convention.** `<e2e-root>` is chosen when the layer is installed (`node tools/aidlc-scaffold.mjs --profile e2e --root <dir>`, default `e2e/`) and recorded thereafter by `playwright.config.ts`'s `testDir`. Nothing else records it, so nothing else can drift from it, and no layout is assumed: Nx, flat, `packages/`, or anything else.
- **A plan precedes the tests.** `<e2e-root>/plans/US-###.md` from `ai/templates/test-plan.md`, reviewed before generation.
- **Same repo (default):** the spec path goes in the story's `tests[]` and rides the story PR. The criterion is proven exactly as for any other test — the AC citation in the test title, verified by `aidlc-check`.
- **Separate QA repo:** evidence travels as `knowledge/traceability/e2e-coverage.json`, opened as a PR against the product repo and validated there when present. It **cannot block** a story PR, because the product repo cannot see the test, so a team that needs e2e to block uses the same repo.
- Deterministic still applies, and is harder here: seeded data through a setup project and `storageState`, never a sleep, and never a shared mutable environment that two runs can race on.

## Bug reports

Reproducible or it doesn't exist: steps, expected (AC ref), actual, environment, severity. Filed to DEV; regression TC added on fix.
