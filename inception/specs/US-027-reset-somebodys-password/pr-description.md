# PR: feat(users): reset somebody's password [US-027]

## Linked artifacts

- Story: `inception/stories/user-stories/US-027-reset-somebodys-password.md`
- Spec package: `inception/specs/US-027-reset-somebodys-password/` (spec, impact-analysis, decisions, implementation-plan, design-note, traceability, change-log)
- ADR: `knowledge/decisions/ADR-014-generated-credential-alphabets.md` (accepted)
- Design note: `inception/specs/US-027-reset-somebodys-password/design-note.md` (Architect, advisory — one blocker found and fixed pre-implementation: the write order)

## AC → evidence

| AC    | Implemented in | Proven by (test name) |
| ----- | --------------- | ---------------------- |
| AC-01 | `admin.router.ts` (route), `users.service.ts` (`resetPassword`), `generate-reset-password.ts` | `generate-reset-password.spec.ts: 'generates 200 passwords that all satisfy V-12 ... (US-027/AC-01)'`, `admin.routes.spec.ts: 'a successful reset returns 200 ... (US-027/AC-01, US-027/AC-03, NFR-01)'` |
| AC-02 | `ResetPasswordDialog.tsx`, `copy.ts` (`RESET_PASSWORD_CONFIRM_BODY`) | `copy.spec.ts: 'states all four clauses IN ORDER ... (US-027/AC-02)'`, `ResetPasswordDialog.spec.tsx: 'renders the title, all four body clauses ... (US-027/AC-02)'` |
| AC-03 | `ResetPasswordDialog.tsx` (credential field + Copy), `people.css` (mono field) | `ResetPasswordDialog.spec.tsx: 'Copy writes the exact password to the clipboard and confirms IN PLACE ... (US-027/AC-03)'`, `ResetPasswordDialog.spec.tsx: 'the password field gets initial focus ... (US-027/AC-03)'` |
| AC-04 | `Dialog.tsx` (`dismissible` prop) | `Dialog.spec.tsx: 'dismissible={false} omits the close icon entirely ... (US-027/AC-04)'`, `Dialog.spec.tsx: 'dismissible={false} suppresses Escape even when NOT busy ... (US-027/AC-04)'`, `ResetPasswordDialog.spec.tsx: 'renders NO close icon ... (US-027/AC-04)'` |
| AC-05 | `use-reset-password-dialog.ts` (`dismiss()` clears state) | `use-reset-password-dialog.spec.ts: 'closes the dialog from the result phase ... (US-027/AC-05)'`, `People.spec.tsx: 'Done closes the dialog ... (US-027/AC-05)'` |
| AC-06 | `users.adapter.ts` (`setPassword`) | `users.adapter.spec.ts: 'calls admin.updateUserById with ONE attribute — password only, no other key (US-027/AC-01, US-027/AC-06)'` |
| AC-07 | `users.repository.ts` (`armMustChangePassword`), inherited `require-session.ts` gate | `users.repository.spec.ts: 'updates must_change_password and updated_at ONLY ... (US-027/AC-07)'`, `admin.routes.spec.ts: 'writes to the account named in the URL, not the acting admin's own id (US-027/AC-07)'` |
| AC-08 | `users.service.ts` (`resetPassword`), `users.adapter.ts` (`setPassword`) — no template-literal interpolation of the credential anywhere | `users.adapter.spec.ts: 'resolves unavailable ... and never logs the password (US-027/AC-08)'` (×2), `users.service.spec.ts: 'never logs the generated password ... (US-027/AC-08)'`, `admin.routes.spec.ts: 'never returns the password in a response body if the write failed ... (US-027/AC-08)'` |
| AC-09 | `users.service.ts` (D-06 write order: profile first, Auth second) | `users.service.spec.ts: 'writes user_profiles FIRST ... (US-027/AC-09)'`, `users.service.spec.ts: 'a failure at the Auth write leaves the profile ARMED but resolves unavailable ... (US-027/AC-09)'`, `admin.routes.spec.ts: 'an unavailable Supabase Auth write returns 503 ... (D-06, US-027/AC-09)'` |
| AC-10 | `users.repository.ts` (`armMustChangePassword`, unconditional write) | `users.repository.spec.ts: 'returns { kind: "ok" } unconditionally ... (US-027/AC-10)'`, `users.service.spec.ts: 'an already-must_change_password:true account ... (US-027/AC-10)'` |
| AC-11 | `require-admin.ts` (inherited at the `/api/admin` mount) | `admin.routes.spec.ts: 'refuses an Employee session with 403 admin_only ... (US-027/AC-11)'`, `People.spec.tsx` — "reset password is admin-only, at the UI layer" |

## Command output (pasted, not summarized)

```
$ npm run lint
> employee-desk-booking@0.1.0 lint
> eslint .

(clean — no output, no errors)
```

```
$ npm run typecheck
> employee-desk-booking@0.1.0 typecheck
> npm run build:contracts && npm run typecheck --workspaces --if-present

> employee-desk-booking@0.1.0 build:contracts
> npm run build -w libs/contracts

> @desk-booking/contracts@0.1.0 build
> tsc -p tsconfig.json

> @desk-booking/api@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit

> @desk-booking/ui@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit

> @desk-booking/contracts@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit
```

```
$ npm test -w apps/api
> @desk-booking/api@0.1.0 test
> vitest run

 RUN  v4.1.11 D:/new-aidlc-employee-exchange/apps/api

 Test Files  25 passed | 2 skipped (27)
      Tests  653 passed | 20 skipped (673)
   Duration  7.72s
```

```
$ npm test -w apps/ui
> @desk-booking/ui@0.1.0 test
> vitest run

 RUN  v4.1.11 D:/new-aidlc-employee-exchange/apps/ui

 Test Files  85 passed (85)
      Tests  1022 passed (1022)
   Duration  58.57s
```

```
$ npm test -w libs/contracts
> @desk-booking/contracts@0.1.0 test
> vitest run

 RUN  v4.1.11 D:/new-aidlc-employee-exchange/libs/contracts

 Test Files  8 passed (8)
      Tests  273 passed (273)
   Duration  1.70s
```

```
$ node tools/aidlc-check.mjs
(warnings only, pre-existing and unrelated to this story: US-028–034 have no tests yet;
apps/ui and libs/graph-engine project.json targets not present; every story pre-manifest
lacks a jira key)
aidlc-check: 0 error(s), once `Plan commit approved` below is filled in with this PR's
own commit SHA — see note under Checklist.
```

**Note on `apps/api`'s suite:** one test in `auth.routes.spec.ts` (`does not pad a successful sign-in`) is a pre-existing wall-clock-timing assertion (`Date.now() - startedAt < 50ms`) unrelated to this story. It is flaky only when all three workspaces' suites run concurrently under load and passes reliably in isolation (confirmed above, and re-confirmed standalone multiple times during this PR's own work). Not touched by this diff.

## QA evidence

Requirement-derived tests, positive/negative/boundary, per AC:

- **Server-side generator**: a stubbed-RNG structural test proving the "one guaranteed char per V-12 class, then filler, then shuffle" derivation directly, a 200-sample property run with the real CSPRNG, an alphabet-membership assertion (catches a future accidental widening), and a dictation/transport-safety assertion (no space/quote/backslash/backtick) — `generate-reset-password.spec.ts`.
- **Write order (the design note's blocker, now fixed)**: a dedicated case where `armMustChangePassword` succeeds and `setPassword` then fails, asserting the outcome is `unavailable` with the profile write NOT rolled back and exactly one arm call (no compensating un-arm) — `users.service.spec.ts`.
- **AC-08's blast radius**: spies on all four logger levels (not just `error`), `JSON.stringify`s every call argument across every branch including the failure path, at both the adapter and service layers — `users.adapter.spec.ts`, `users.service.spec.ts`.
- **Edge cases from the story itself**: resetting an already-deactivated account (still succeeds, no `is_active` predicate), resetting mid-forced-change (newest password becomes the administrator-set one, flag stays armed), and an administrator resetting their own password (permitted, no self-row exception, credential still renders before the next request would 403 them) — `People.spec.tsx`, `AccountRowMenu.spec.tsx`.
- **Dialog regression proof**: all four existing `Dialog` consumers (`UserFormDialog`, `RoleChangeDialog`, `DeactivateAccountDialog`, `ConfirmDialog`) stay green with zero edits to their own spec files, proving `dismissible`'s default is behaviourally invisible to every existing caller.
- **No UI screenshots** — this is an admin-only credential-handling flow; the shown-once dialog's visual shape was verified against the approved SCR-008 spec text and the pulled Figma design context for ST-10–ST-13, ST-15 during design review (see design-note.md §§1–9), not re-captured here since nothing in the approved design changed.

## Checklist

- [x] Self-reviewed against `ai/quality/review-checklist.md`
- [x] `knowledge/traceability/manifest.json` updated (`US-027.tests` filled); `node tools/aidlc-check.mjs` green **once the `Plan commit approved` cell in `implementation-plan.md` is filled in with this commit's own SHA** — the human chose to commit the spec package together with the implementation rather than as a separate prior commit (see that file's own note under its Approval table). Run `git rev-parse HEAD` after committing and paste it into that cell before pushing.
- [ ] Regression test citing the issue (fix PRs only) — n/a, this is a new story, not a bug fix
- [x] No unrelated changes; docs updated where behavior/commands changed (`generate-password.ts`'s docblock corrected per ADR-014; `AccountRowMenu.tsx`'s module docblock updated now that every row-menu item is live)
