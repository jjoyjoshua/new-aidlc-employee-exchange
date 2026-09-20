# US-022 — implementation plan

> **The Gate D1 artifact.** The human reads this file, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                              |
| --------- | ------------------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-022-suggest-an-initial-password.md` |
| **Spec**  | `spec.md`                                                      |
| **Tier**  | Medium                                                        |

## Approval — Gate D1

| Field                | Value           |
| -------------------- | --------------- |
| Status               | **approved**    |
| Approved by          | Joy Joshua <joy_j@trigent.com> |
| Approved on          | 2026-09-20      |
| Plan commit approved | *uncommitted at approval* — base `3eb6a8f15d9d6166e5f9554c021586a742d2340b` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`; if either is unset, ask them rather than writing `unknown`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**, the commit before this stamp. That SHA is what makes the approval verifiable: a reviewer at D2 runs `git diff <sha> -- <this file>` and sees whether the plan changed after approval. The name is self-asserted, so it is attribution, not authentication.

## Why this plan is nearly all tests, no new production code

While delivering US-021 ("Create a user account"), its own AC-04 already read "a password satisfying all five rules, **whether typed or generated (US-022)**" — so the developer built the whole generator ahead of this story to make US-021's own checklist state provable (`decisions.md` D-04, D-07 in `US-021-create-a-user-account/`). The result:

- `apps/ui/src/lib/generate-password.ts` — `generatePassword()`. Excludes `1`/`l`/`I`/`0`/`O`, self-verifies against `evaluatePasswordPolicy` before returning, length 14 (margin over the 8-char minimum).
- `apps/ui/src/screens/people/UserFormDialog.tsx:91-94, 207-209` — the **Suggest a password** button, calling `generatePassword()` and forcing the field revealed (`setPasswordVisible(true)`).
- `apps/ui/src/components/password-field/PasswordField.tsx` — gained the controlled `visible`/`onVisibleChange` pair (D-07) so the button can force-reveal a value it did not type.

All six of US-022's ACs are true of the code **today**. What is missing is the traceability this framework requires: every test proving one of these behaviors currently cites `US-021/AC-04` only (the story that commissioned the work), not `US-022/AC-0#` (the story that actually specifies the behavior in detail — exclusion set, re-suggest, editability, post-creation equivalence). `knowledge/traceability/manifest.json`'s `US-022` entry already lists all six ACs with `"tests": []` — a placeholder waiting for this pass.

This plan adds AC citations (several tests already prove the AC and just need the citation added) and a small number of new assertions for behavior that exists but was never separately asserted (checklist-all-met specifically after clicking Suggest, re-suggest producing a different value at the component level, post-suggest editability, and submission-payload equivalence). No `apps/api` change, no schema change, no new dependency.

## Steps

### Step 1 — `generatePassword` — cite AC-01, AC-02, AC-04

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-01, FR-02, FR-04 |
| Files    | `apps/ui/src/lib/generate-password.spec.ts` (modify — add `US-022/AC-01` to the "satisfies every V-12 rule, across 200 samples" test; add `US-022/AC-02` to the "never contains an ambiguous glyph" test; add `US-022/AC-04` to the "is not the same value twice in a row" test; the `describe` block's own title gains the three IDs alongside the existing `US-021/AC-04`), `apps/ui/src/lib/generate-password.ts` (modify — docblock's `US-021/D-04` citation gains a second line naming `US-022` as the story these rules belong to) |
| Verify   | `npm test -w apps/ui -- generate-password` — existing 3 tests still pass, now citing `US-022` |

### Step 2 — `UserFormDialog` — cite AC-01, AC-03 fully; add AC-04, AC-05, AC-06

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-01, FR-03, FR-04, FR-05, FR-06 |
| Files    | `apps/ui/src/screens/people/UserFormDialog.spec.tsx` (modify — the existing "Suggest a password fills a compliant, REVEALED value" test (ST-09) gains an assertion that every `PolicyChecklist` row reads `met` after the click, and cites `US-022/AC-01, AC-03` alongside its existing `US-021/AC-04, D-07`; **new** test: clicking **Suggest a password** twice yields two different field values (`US-022/AC-04`); **new** test: after a suggested value fills the field, typing over it changes the value and the checklist reacts to the new entry — some replacement values pass, a short one fails — proving the field is not locked (`US-022/AC-05`); **new** test: filling the form via **Suggest a password** then submitting calls `onSubmit` with `{ fullName, email, role, password }` where `password` is exactly the field's current value — the identical shape the existing typed-password submission test asserts, with no extra key marking the password as generated (`US-022/AC-06`)) |
| Verify   | `npm test -w apps/ui -- UserFormDialog` — 3 new tests pass, 1 existing test's assertions extended |

### Step 3 — `PasswordField` — cite AC-03

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-03 |
| Files    | `apps/ui/src/components/password-field/PasswordField.spec.tsx` (modify — the "renders revealed when a caller passes `visible={true}`" test gains `US-022/AC-03` alongside its existing `US-021/AC-04, D-07`) |
| Verify   | `npm test -w apps/ui -- PasswordField` — existing test still passes, now citing `US-022` |

### Step 4 — Traceability closeout

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | (all — required by `aidlc-check`)                           |
| Files    | `knowledge/traceability/manifest.json` (modify — `US-022.tests[]` gains `apps/ui/src/lib/generate-password.spec.ts`, `apps/ui/src/screens/people/UserFormDialog.spec.tsx`, `apps/ui/src/components/password-field/PasswordField.spec.tsx`), `inception/specs/index.md` (modify — add the `US-022` row, Status `implemented`), `inception/specs/US-022-suggest-an-initial-password/traceability.md` (this package — fill with real file/test paths, Status `implemented`) |
| Verify   | `npm run check` — `aidlc-check` passes; `npm run lint && npm run typecheck && npm test` — full suite green |

## Rollback

Revert the PR. Every change is either a test-title citation or a new test assertion; no production behavior changes, so a revert has no residual state to clean up.

## Open questions

| Question                                                                 | Owner | Blocks |
| ------------------------------------------------------------------------- | ----- | ------ |
| AC-06 says a generated password "behaves exactly like a typed one" at sign-in. That path (US-004's forced-change flow) is already proven story-agnostic — it reads whatever password was stored, with no record of its origin. Confirm no additional US-004-side test is wanted here, since this story's scope is the create form, not the sign-in flow. | Joy Joshua | none — Step 2's submission-equivalence test is treated as sufficient for this PR; escalate if not |

None of these block Steps 1–4.
