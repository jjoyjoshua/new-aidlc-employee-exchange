# PR: test(users): trace suggest-a-password to its own story [US-022]

## Linked artifacts

- Story: `inception/stories/user-stories/US-022-suggest-an-initial-password.md`
- Plan: `inception/specs/US-022-suggest-an-initial-password/implementation-plan.md` (Gate D1 approved by Joy Joshua, 2026-09-20)
- ADR: none
- Fixes: none (not a bug fix)

## Background

The **Suggest a password** feature (generator, exclusion set, reveal-on-generate) was already built and working — delivered ahead of schedule while implementing US-021, whose own AC-04 text reads "whether typed or generated (**US-022**)". `knowledge/traceability/manifest.json`'s `US-022` entry already listed all six ACs with `tests: []`, waiting for this pass. No production behavior changes in this PR; it adds the `US-022/AC-0#` citations the existing tests were missing, plus four new assertions for behavior that was true but never separately proven (checklist-all-met specifically after clicking Suggest, re-suggest differing in the UI, post-suggest editability, and submission-payload equivalence).

## AC → evidence

| AC    | Implemented in                                                    | Proven by (test name)                                                                                       |
| ----- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| AC-01 | `apps/ui/src/lib/generate-password.ts`, `UserFormDialog.tsx`          | `generate-password.spec.ts`: `'generates a value satisfying every V-12 rule, across 200 samples (US-022/AC-01)'`; `UserFormDialog.spec.tsx`: `'Suggest a password fills a compliant, REVEALED value, checklist all met (... US-022/AC-01, AC-03 ...)'` |
| AC-02 | `apps/ui/src/lib/generate-password.ts`                                | `generate-password.spec.ts`: `'never contains an ambiguous glyph, across 200 samples (US-022/AC-02, ...)'`  |
| AC-03 | `UserFormDialog.tsx`, `PasswordField.tsx`                             | `UserFormDialog.spec.tsx` (above); `PasswordField.spec.tsx`: `'renders revealed when a caller passes visible={true} (US-021/AC-04, D-07, US-022/AC-03 — ...)'` |
| AC-04 | `apps/ui/src/lib/generate-password.ts`                                | `generate-password.spec.ts`: `'is not the same value twice in a row (US-022/AC-04)'`; `UserFormDialog.spec.tsx`: `'Suggest a password produces a different value on a second use (US-022/AC-04)'` |
| AC-05 | `UserFormDialog.tsx` (`PasswordField` `onChange`, fully controlled)    | `UserFormDialog.spec.tsx`: `'a generated password is still editable — typing over it is accepted or refused by the ordinary rules (US-022/AC-05)'` |
| AC-06 | `UserFormDialog.tsx` (`handleSubmit`, one `password` field, no marker) | `UserFormDialog.spec.tsx`: `'a generated password submits exactly like a typed one — same shape, no marker (US-022/AC-06)'` |

## Command output (pasted, not summarized)

```
$ npm run lint
> employee-desk-booking@0.1.0 lint
> eslint .
(clean — no output, exit 0)

$ npm run typecheck
> employee-desk-booking@0.1.0 typecheck
> npm run build:contracts && npm run typecheck --workspaces --if-present
> @desk-booking/contracts@0.1.0 build / tsc -p tsconfig.json
> @desk-booking/api@0.1.0 typecheck / tsc -p tsconfig.json --noEmit
> @desk-booking/ui@0.1.0 typecheck / tsc -p tsconfig.json --noEmit
> @desk-booking/contracts@0.1.0 typecheck / tsc -p tsconfig.json --noEmit
(clean — no errors, exit 0)

$ npm test
> @desk-booking/api@0.1.0 test / vitest run
 Test Files  24 passed | 2 skipped (26)
      Tests  509 passed | 11 skipped (520)

> @desk-booking/ui@0.1.0 test / vitest run
 Test Files  73 passed (73)
      Tests  791 passed (791)

> @desk-booking/contracts@0.1.0 test / vitest run
 Test Files  8 passed (8)
      Tests  243 passed (243)

$ node tools/aidlc-check.mjs
aidlc-check: OK (framework 0.5.0, 522 IDs, 36 warnings)
(all 36 warnings pre-existing — missing Jira keys and pre-delivery stories US-023–US-034; none introduced by this PR)
```

## QA evidence

- AC-01/AC-02/AC-04 are proven at the generator level across 200 samples each (pre-existing, now correctly cited) — a single-sample assertion proves nothing about a random generator, per the story's own QA notes.
- AC-04's UI-level test is intentionally a weak-but-useful guard against a fixed/seeded value shipping by accident (story's own QA notes), backed by the strong 200-sample generator test for the real guarantee.
- AC-05's test exercises both the negative case (typing a too-short replacement over a generated value, checklist reacts) and the positive case (typing a fully compliant replacement, all rules read met) — proving the field is a normal controlled input, not locked.
- AC-06 is proven by asserting the exact `onSubmit` payload shape after a Suggest-then-submit flow matches the existing typed-password submission contract (same four keys, `password` equal to the field's live value) — no fifth key, no separate code path.
- No screenshots — no visual change; the button and reveal behavior already shipped and are unchanged pixel-for-pixel.

## Checklist

- [x] Self-reviewed against `ai/quality/review-checklist.md`
- [x] `knowledge/traceability/manifest.json` updated; `node tools/aidlc-check.mjs` green locally
- [ ] Regression test citing the issue (fix PRs only) — n/a, not a bug fix
- [x] No unrelated changes; docs updated where behavior/commands changed (`generate-password.ts` docblock)
