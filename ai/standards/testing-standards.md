# Testing standards

## Levels & placement

| Level                        | Tool                                        | Where                            |
| ---------------------------- | ------------------------------------------- | -------------------------------- |
| Domain rules (**the default**) | Vitest                                    | `apps/api/src/domain/*.spec.ts`  |
| Server module / service      | Vitest                                      | `apps/api/src/modules/**/*.spec.ts` |
| API contract                 | Vitest + supertest against the Express app  | `apps/api/src/http/**/*.spec.ts` |
| UI component                 | Vitest + React Testing Library + jsdom      | `apps/ui/src/**/*.spec.tsx`      |
| Accessibility                | screen-spec a11y notes + review checklist §5 | asserted in component tests      |
| Performance                  | budget asserts citing the NFR (`NFR-###`)   | `*.spec.ts` next to the code     |
| End-to-end (browser)         | Playwright + `@playwright/mcp`              | `<e2e-root>/src/*.spec.ts`       |

Run with `npm test` at the root (fans out to every workspace), or `npm test -w apps/api` for one.

## Most AC tests belong in `domain/`

This is the point of the architecture's layering, and it changes how you write tests here.
The rules are pure functions that take **every** input as an argument, including today's
date. So the acceptance criteria that look hardest to test — the 30-day window, the weekday
rule, "which status does this booking read as today", the password rules, the notification
wording — are plain unit tests with **no database, no HTTP, and no clock mocking**.

If proving an AC seems to need a running server or a frozen clock, that is usually a signal
the rule leaked out of `domain/` and into a service. Move the rule, then test it.

Reach for the higher levels when the criterion is genuinely about plumbing: the middleware
chain (`401` on an inactive account), the error shape, the unique-index `409`, a screen's
rendered states.

## Rules

- Test the **requirement**: every test cites `US-### / AC-##` in its title; tests assert
  observable behavior, not implementation internals
- Per story: positive cases from AC, then negative, then boundary — all three classes or a
  written justification
- Deterministic only: no sleeps, no real network, no wall-clock dependency. `domain/` takes
  the date as an argument; services take a clock from `infra/clock`; fixed seeds everywhere
- Test names read as specs:
  `describe('isDateBookable') → it('refuses a Saturday inside the window (US-005/AC-04)')`
- **Never assert the mock.** A test that proves the Supabase client was called with certain
  arguments proves nothing about the rule. Assert the decision or the observable effect
- A red test is a finding: never deleted, skipped, or loosened to pass. Fix the code, or
  (with BA/human approval) fix the requirement
- Coverage: every AC has at least one test before a story is _done_
- **The AC citation is a label, not the proof.** `aidlc-check` can only confirm an active test
  named `US-###/AC-##` exists and passes. An empty body would satisfy it. The proof is the
  assertion, so write the test first and watch it fail; a reviewer who can't see which
  assertion maps to the AC treats that as a finding

## Concurrency has to be tested where it is decided

The booking insert is arbitrated by a partial unique index, not by application code
(architecture §4.1). A unit test with a mocked database cannot prove BR-001.1 or V-04 — it can
only prove what the mock was told to do. Those criteria need a test against a real Postgres
(a Supabase local instance or a disposable project), issuing two concurrent inserts and
asserting exactly one wins with the right `409` code. Say so in the plan; don't quietly prove
it at the wrong level.

## End-to-end

E2E is the **last** level, not the default one: it is the slowest and flakiest proof of any
criterion, so it earns its place only for behaviour that genuinely spans the browser and the
stack. A criterion provable at domain or API level is proven there, and the plan says where.

- **Placement is a decision, not a convention.** `<e2e-root>` is chosen when the layer is
  installed (`node tools/aidlc-scaffold.mjs --profile e2e --root <dir>`, default `e2e/`) and
  recorded thereafter by `playwright.config.ts`'s `testDir`. Nothing else records it, so
  nothing else can drift from it.
- **A plan precedes the tests.** `<e2e-root>/plans/US-###.md` from `ai/templates/test-plan.md`,
  reviewed before generation.
- **Same repo (default):** the spec path goes in the story's `tests[]` and rides the story PR.
  The criterion is proven exactly as for any other test — the AC citation in the test title,
  verified by `aidlc-check`.
- **Separate QA repo:** evidence travels as `knowledge/traceability/e2e-coverage.json`, opened
  as a PR against the product repo and validated there when present. It **cannot block** a
  story PR, because the product repo cannot see the test, so a team that needs e2e to block
  uses the same repo.
- Deterministic still applies, and is harder here: seeded data through a setup project and
  `storageState`, never a sleep, and never a shared mutable environment two runs can race on.

## Bug reports

Reproducible or it doesn't exist: steps, expected (AC ref), actual, environment, severity.
Filed to DEV; a regression test citing the issue (`(#12)`) is added on fix.
