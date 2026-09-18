# US-004 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                                                |
| ----------- | -------------------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-004-replace-administrator-set-password.md`   |
| **Tier**    | Complex                                                                          |
| **Updated** | 2026-09-18                                                                       |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                                                                                 |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contract                 | **yes**  | New write endpoint (`POST /api/auth/set-password`); two new request/response schemas and two new error codes in `libs/contracts`; a new shared-component contract (`policy-checklist`, `toast`); `AuthContextValue` gains `setPassword` |
| Persistence               | no       | `must_change_password` already exists (`0001_user_profiles.sql`, US-001). This story reads and clears it; no migration                                                       |
| Trust                     | **yes**  | The auth-chain gate itself (`requireSession` step 5) — a protected path. Also the V-15 credential-comparison probe and the `auth.admin.updateUserById` password write         |
| Dependency & integration  | no       | No new dependency. Reuses the existing `AuthAdapter` seam and Supabase admin client                                                                                          |
| Operational               | no       | No new env/config value, no new scheduled job. `apps/api/src/http/app.ts` is unmodified — composition hands each mount the chain instance it needs (design note §4.4)         |

**Two of the five framework surfaces are crossed, plus one `§Escalate` item** (`ai/standards/task-surfaces.md`):
a plaintext password on three new paths — the request body, the V-15 probe, and the Supabase
admin write. Confirmed with the human at Gate D1 under five named constraints (see
`decisions.md` D-06).

## Files and callers

| File                                                        | Symbol                                    | Change                                                                 | Callers found (`file:line`)                                                                             |
| ------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/api/src/http/middleware/require-session.ts`            | `requireSession`                          | factory gains required `passwordChangeGate: 'enforced' \| 'exempt'`      | `apps/api/src/composition.ts` (both call sites — one per instance)                                       |
| `apps/api/src/composition.ts`                                | `buildApp`                                | builds two chain instances; `createAuthRouter` gets the exempt one       | `apps/api/src/http/app.ts` (unchanged — receives whichever instance composition hands it)                |
| `apps/api/src/modules/auth/auth.router.ts`                   | `createAuthRouter`                        | + `POST /set-password`; `GET /session` now mounted behind the exempt instance | `apps/api/src/composition.ts`                                                                            |
| `apps/api/src/modules/auth/auth.service.ts`                  | `createAuthService`                       | + `setPassword(userId, newPassword)`; `AuthAdapter` interface gains `setPassword` | new route handler; `apps/api/src/modules/auth/auth.adapter.ts` implements the new adapter method          |
| `apps/api/src/modules/auth/auth.adapter.ts`                  | `supabaseAuthAdapter`                     | + `setPassword` via `auth.admin.updateUserById`                          | `apps/api/src/modules/auth/auth.service.ts`                                                              |
| `apps/api/src/modules/auth/auth.repository.ts`               | `profileRepository`                       | + `clearMustChangePassword(id)`                                          | `apps/api/src/modules/auth/auth.service.ts`                                                              |
| `libs/contracts/src/auth.ts`                                 | (schemas)                                 | + `setPasswordRequestSchema`, `setPasswordResponseSchema`                | `apps/api/src/modules/auth/auth.router.ts`, `apps/ui/src/lib/auth/auth-context.tsx`                       |
| `libs/contracts/src/error.ts`                                | `errorCodeSchema`                         | + `password_same_as_current`, `password_change_not_required`            | `apps/api/src/http/errors.ts` (re-exports `ERROR_CODES`), `apps/ui/src/lib/auth/auth-context.tsx`         |
| `apps/ui/src/lib/auth/auth-context.tsx`                      | `AuthProvider`, `AuthContextValue`        | + `setPassword()`                                                        | new screen `SetPassword.tsx`                                                                             |
| `apps/ui/src/lib/auth/require-session.tsx`                   | `RequireSession`                          | + redirect to `/set-password` when the mark is set                      | `apps/ui/src/routes.tsx` (shell route element, unchanged call site)                                       |
| `apps/ui/src/routes.tsx`                                     | `AppRoutes`                               | + `/set-password` route, outside the shell                              | none — new route                                                                                          |
| `apps/ui/src/screens/sign-in/SignIn.tsx`                     | sign-in success handler                   | `navigate(landingPathFor(user))` replaces the inline role ternary        | none — internal to the component                                                                          |
| `apps/ui/src/screens/my-bookings/MyBookings.tsx`, `all-bookings/AllBookings.tsx` | screen body            | render the ST-05 toast from navigation state                            | none — additive                                                                                           |
| `apps/ui/src/components/text-field/TextField.tsx`            | `TextFieldProps`                          | + `invalid?: boolean`, additive (`decisions.md` D-11)                    | every existing caller (`SignIn.tsx`, `PasswordField`) — unaffected, none passes `invalid`                  |

**The one caller that needs care:** `apps/api/src/modules/auth/auth.router.ts`'s `GET /session`
handler moves from the enforced chain instance to the exempt one. No behaviour changes for a
user whose mark is clear; a user whose mark **is** set can now reach it, which is the fix this
story makes (design note §4.3) rather than a regression.

## Regression risk

| Area                                                       | Risk     | Why                                                                                                                                                   | Covered by                                                                                     |
| ------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| AC-07 resting on unverified Supabase behaviour                | **high** | Whether the caller's existing access token still verifies after `auth.admin.updateUserById` is not observed anywhere in this project (design note §6.4) | A manual check, output pasted in the PR; fallback design specified in §6.4 if the token is revoked |
| `GET /session` moved to the exempt chain instance             | **high** | If this is missed, a user who abandons the flow (AC-08) is signed out instead of returned to SCR-010 on their next visit — silent, and easy to not notice in a click-through test | `auth.routes.spec.ts` — a mark-set account's `GET /session` still returns `200` (design note §4.3) |
| V-15 probe leaving a live session behind                       | **high** | A successful probe mints a real refresh token; failing to revoke it leaves a credential-shaped artifact lying around | `auth.service.spec.ts` — assert the probe's token no longer verifies after the call                |
| Write-order reversed (mark cleared before credential written) | **high** | Silently and permanently defeats REQ-029 for that account with no further prompt (design note §6.2) | `auth.routes.spec.ts` — the AC-06 sequence (sign in old → set-password → old rejected → new accepted) |
| `RequireSession`/`RequirePasswordChange` disagreeing           | medium   | If both or neither guard renders for some `(user, status)` combination, a user is either trapped or gets through without changing the password — client-side only, so it degrades AC-02/AC-03's UX but not their security guarantee | `require-session.spec.tsx`, `require-password-change.spec.tsx` — the complement invariant over all four combinations |
| `password_change_required` vs `password_change_not_required` confused in a switch | medium | One character apart; a typo silently swaps AC-02's and AC-03's behaviour | Both codes asserted by name in `auth.routes.spec.ts`, not by string literal in the switch body |
| Toast lost on navigation                                       | low      | A `setTimeout` or extra `await` between the state update and `navigate()` lets `RequirePasswordChange` redirect first and drop the `state` payload (design note §7.6) | `SetPassword.spec.tsx` asserts the toast state on the resulting navigation                        |
| V-12 drift between browser and server                          | low      | Two independent regex sets could disagree, showing a green checklist then a `400` | `evaluatePasswordPolicy` is the one function both sides call — no second implementation to drift  |

## Deliberately not touched

- **`supabase/migrations/**`** — the column exists, defaulting `true`, written by US-001 for this story.
- **`apps/api/src/http/app.ts`** — composition hands it the enforcing chain; the mount is already correct.
- **`apps/api/src/http/errors.ts`** — `forbidden()`, `unprocessable()` and `PASSWORD_CHANGE_REQUIRED` already exist.
- **`eslint.config.mjs`, `apps/api/src/config/**`, `apps/api/src/infra/**`, `tokens.css`** — no new env value, dependency, or token.
- **The SCR-004 "change my password" surface** — no voluntary change in this release (BRD-001 §10).
- **Other live sessions on a successful change** — confirmed with the human as out of scope (`decisions.md` D-05).
