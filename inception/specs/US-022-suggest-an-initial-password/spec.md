# US-022 — Suggest an initial password

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                              |
| ----------------- | -------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-022-suggest-an-initial-password.md` |
| **Traces to**     | REQ-033                                                         |
| **Screen**        | SCR-009                                                         |
| **Covering ADRs** | none                                                            |
| **Tier**          | Medium                                                          |
| **Status**        | implemented                                                     |
| **Updated**       | 2026-09-20                                                      |

## Problem

The create-person form already generates and reveals a compliant password (built ahead of schedule under US-021, whose own AC-04 anticipates "whether typed or generated (US-022)"). The behavior exists and is correct; this package's job is to make each of US-022's own six acceptance criteria separately provable and traced, adding the small number of assertions that were never separately written (checklist-all-met specifically after Suggest, re-suggest differing in the UI, post-suggest editability, and submission-payload equivalence).

## Functional requirements

| ID    | Requirement                                                                  | Priority | Serves | Status      |
| ----- | ------------------------------------------------------------------------------ | -------- | ------ | ----------- |
| FR-01 | Suggest a password fills the field with a value satisfying every V-12 rule, and the checklist shows every rule met | Should   | AC-01  | implemented |
| FR-02 | A generated value never contains `1`, `l`, `I`, `0`, or `O`                     | Should   | AC-02  | implemented |
| FR-03 | A generated value is revealed on screen, not masked                           | Should   | AC-03  | implemented |
| FR-04 | Using Suggest a password again replaces the value with a different one         | Should   | AC-04  | implemented |
| FR-05 | The field remains a normal, editable control after generating — no lock       | Should   | AC-05  | implemented |
| FR-06 | A generated password is submitted identically to a typed one, with no origin marker | Should   | AC-06  | implemented |

## Non-functional requirements

None beyond V-12/V-18, already covered by `evaluatePasswordPolicy` (`libs/contracts/src/password.ts`) and `generatePassword`'s self-verification.

## Technical constraints

- Generation is client-side (`apps/ui/src/lib/generate-password.ts`), consistent with the story's own "may be server-side or client-side" note — no server change needed since `evaluatePasswordPolicy` already gates both the checklist and `newPasswordSchema` at the server edge (ADR-002).
- The generated value is never logged — `generatePassword` returns it directly to the caller; no logging exists on this path.

## Out of scope

- The **reset** path (US-027) — BR-001.12 already has the system generate that password itself; this story's control is the create form only, per the story's own edge cases.
- Any change to `apps/api` — AC-06 holds because the server treats every initial password identically regardless of origin (`createAccountRequestSchema` takes one `password` field; no "generated" flag exists anywhere in `apps/api/src/modules/users`), which needed no new code to be true.
