# US-022 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                              |
| ----------- | -------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-022-suggest-an-initial-password.md` |
| **Updated** | 2026-09-20                                                      |

## Requirement to code

| Req    | File                                                             | Symbol / location                          | Proven by                                                                 | Status      |
| ------ | ------------------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------- | ----------- |
| FR-01  | `apps/ui/src/lib/generate-password.ts`, `apps/ui/src/screens/people/UserFormDialog.tsx` | `generatePassword`, `handleSuggest`           | `apps/ui/src/lib/generate-password.spec.ts` (US-022/AC-01), `apps/ui/src/screens/people/UserFormDialog.spec.tsx` (US-022/AC-01) | implemented |
| FR-02  | `apps/ui/src/lib/generate-password.ts`                             | `UPPER`/`LOWER`/`DIGIT` alphabets excluding `1`/`l`/`I`/`0`/`O` | `apps/ui/src/lib/generate-password.spec.ts` (US-022/AC-02)                    | implemented |
| FR-03  | `apps/ui/src/screens/people/UserFormDialog.tsx`, `apps/ui/src/components/password-field/PasswordField.tsx` | `handleSuggest` (`setPasswordVisible(true)`), `PasswordField` controlled `visible` | `apps/ui/src/screens/people/UserFormDialog.spec.tsx` (US-022/AC-03), `apps/ui/src/components/password-field/PasswordField.spec.tsx` (US-022/AC-03) | implemented |
| FR-04  | `apps/ui/src/lib/generate-password.ts`                             | `generatePassword` (crypto-sourced per call)  | `apps/ui/src/lib/generate-password.spec.ts` (US-022/AC-04), `apps/ui/src/screens/people/UserFormDialog.spec.tsx` (US-022/AC-04) | implemented |
| FR-05  | `apps/ui/src/screens/people/UserFormDialog.tsx`                    | `PasswordField` `onChange={(event) => setPassword(...)}`, fully controlled, no lock | `apps/ui/src/screens/people/UserFormDialog.spec.tsx` (US-022/AC-05)          | implemented |
| FR-06  | `apps/ui/src/screens/people/UserFormDialog.tsx`                    | `handleSubmit` (`onSubmit({ ..., password })` — one field, no origin marker) | `apps/ui/src/screens/people/UserFormDialog.spec.tsx` (US-022/AC-06)          | implemented |

## Key symbols

| Symbol             | Location                                                  |
| ------------------- | ------------------------------------------------------------ |
| `generatePassword`  | `apps/ui/src/lib/generate-password.ts`                        |
| `handleSuggest`     | `apps/ui/src/screens/people/UserFormDialog.tsx`               |
| `PasswordField`     | `apps/ui/src/components/password-field/PasswordField.tsx`     |
