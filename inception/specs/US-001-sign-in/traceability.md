# US-001 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                    |
| ----------- | -------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-001-sign-in.md`  |
| **Updated** | 2026-09-17                                         |

**A `—` in the File column means the code does not exist yet**, and that is deliberate: a table
citing a file that is not there is a claim rather than a record, and `aidlc-check` check 16
rejects it, correctly. Each row gains its file, symbol and proving test in the same commit as
the code itself. The **intended** destination of a `not started` row is in
[`implementation-plan.md`](implementation-plan.md), step by step, where it belongs while it is
still a plan.

FR-04 and FR-05 were `written, unapplied` until 2026-09-18, when the migration was applied to
the project and a real sign-in succeeded end to end — which cannot happen unless `user_profiles`
exists and `requireSession` can read it. RLS being deny-all has not been separately asserted;
it is visible in the migration and in the dashboard, not in a test.

## Requirement to code

| Req    | File | Symbol / location            | Proven by | Status      |
| ------ | ---- | ---------------------------- | --------- | ----------- |
| FR-01  | `libs/contracts/src/auth.ts`, `libs/contracts/src/error.ts` | the sign-in and error schemas | `libs/contracts/src/auth.spec.ts`, `libs/contracts/src/error.spec.ts` | implemented |
| FR-02  | `libs/contracts/src/index.ts` | package exports | `npm run typecheck` over both workspaces | implemented |
| FR-03  | `libs/contracts/src/error.ts` | `errorBodySchema` | `libs/contracts/src/error.spec.ts` | implemented |
| FR-04  | `supabase/migrations/0001_user_profiles.sql` | `user_profiles`, `user_role` | applied 2026-09-18; proven by a successful end-to-end sign-in | implemented |
| FR-05  | `supabase/migrations/0001_user_profiles.sql` | `enable row level security` | applied 2026-09-18 with the table | implemented |
| FR-06  | `apps/api/src/modules/auth/auth.router.ts` | `POST /sign-in` handler | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-07  | `apps/api/src/modules/auth/auth.service.ts` | email normalisation in `attemptSignIn` | `apps/api/src/modules/auth/auth.service.spec.ts` | implemented |
| FR-08  | `apps/api/src/infra/supabase/index.ts` | `supabaseAuthClient` | `apps/api/src/modules/auth/auth.service.spec.ts` | implemented |
| FR-09  | `apps/api/src/modules/auth/auth.router.ts` | sign-in response builder | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-10  | `apps/api/src/modules/auth/auth.service.ts` | `SignInOutcome` convergence | `apps/api/src/modules/auth/auth.service.spec.ts` | implemented |
| FR-11  | `apps/api/src/domain/sign-in-failure-delay.ts` | `remainingDelayMs` | `apps/api/src/domain/sign-in-failure-delay.spec.ts` | implemented |
| FR-12  | `apps/api/src/modules/auth/auth.router.ts` | over-floor warning | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-13  | `apps/api/src/modules/auth/auth.adapter.ts` | `revokeSession` | `apps/api/src/modules/auth/auth.service.spec.ts` | implemented |
| FR-14  | `apps/api/src/modules/auth/auth.adapter.ts` | `isTransportFailure` | `apps/api/src/modules/auth/auth.adapter.spec.ts` | implemented |
| FR-15  | `apps/api/src/modules/auth/auth.router.ts` | generic 400 body | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-16  | `apps/api/src/modules/auth/auth.router.ts` | `GET /session` handler | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-17  | `apps/api/src/http/middleware/require-session.ts` | `requireSession` | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-18  | — | requireSession's per-request stamp + 30-day comparison | — | closed by US-003 |
| FR-19  | `apps/api/src/http/middleware/require-session.ts` | US-004 seam (steps 4 and 5) | — (seam only; US-004 proves it) | seam only |
| FR-20  | `apps/api/src/http/app.ts` | the `/api/admin` mount | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-21  | `apps/api/src/http/middleware/require-admin.ts` | `requireAdmin` | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-22  | `apps/api/src/http/middleware/require-https.ts` | `requireHttps` | `apps/api/src/http/middleware/require-https.spec.ts` | implemented |
| FR-23  | `apps/ui/src/screens/sign-in/SignIn.tsx` | `SignIn` ST-01 | `apps/ui/src/screens/sign-in/SignIn.spec.tsx` | implemented |
| FR-24  | `apps/ui/src/screens/sign-in/SignIn.tsx` | `attempt` validation, ST-02 | `apps/ui/src/screens/sign-in/SignIn.spec.tsx` | implemented |
| FR-25  | `apps/ui/src/screens/sign-in/SignIn.tsx` | in-flight guard, ST-03 | `apps/ui/src/screens/sign-in/SignIn.spec.tsx` | implemented |
| FR-26  | `apps/ui/src/screens/sign-in/SignIn.tsx` | rejection handling, ST-04 | `apps/ui/src/screens/sign-in/SignIn.spec.tsx` | implemented |
| FR-27  | `apps/ui/src/screens/sign-in/SignIn.tsx` | unavailable handling, ST-05 | `apps/ui/src/screens/sign-in/SignIn.spec.tsx` | implemented |
| FR-28  | `apps/ui/src/lib/auth/auth-context.tsx` | `AuthProvider`, post-success routing, `defaultOnSession` | `apps/ui/src/screens/sign-in/SignIn.spec.tsx`, `apps/ui/src/lib/auth/auth-context.spec.tsx` | implemented (session-persistence gap fixed 2026-09-18 — see `change-log.md`) |
| FR-29  | `apps/ui/src/components/app-shell/AppShell.tsx` | `AppShell` — hi-fi rail per Figma node `51:359` (product lockup, `NavIcon`, active bar) | `apps/ui/src/components/app-shell/AppShell.spec.tsx` | implemented |
| FR-30  | `apps/ui/src/lib/auth/require-role.tsx` | `RequireRole` | `apps/ui/src/components/app-shell/AppShell.spec.tsx` | implemented |
| FR-31  | `apps/ui/src/lib/api-client.ts` | `createApiClient` | `apps/ui/src/lib/api-client.spec.ts` | implemented |
| FR-32  | `apps/ui/src/components/` | all seven: `text-field`, `password-field`, `button`, `alert`, `spinner`, `card`, `login-backdrop` | one `.spec.tsx` each | implemented |
| NFR-01 | `apps/api/src/domain/sign-in-failure-delay.ts` | `SIGN_IN_MIN_FAILURE_MS` | `apps/api/src/domain/sign-in-failure-delay.spec.ts` | implemented |
| NFR-02 | `apps/ui/src/lib/api-client.ts` | request timeout | `apps/ui/src/lib/api-client.spec.ts` | implemented |
| NFR-03 | `apps/api/src/http/middleware/require-https.ts` | `requireHttps` | `apps/api/src/http/middleware/require-https.spec.ts` | code half done; deployment half is Gate 3 |
| NFR-04 | `apps/api/src/infra/logger/index.ts` | `__redactForTesting` | `apps/api/src/infra/logger/index.spec.ts` | implemented |
| NFR-05 | `apps/ui/src/screens/sign-in/sign-in.css` | breakpoints at 768 and 1024 per `ia.md` | — (US-033 verifies all ten screens) | built to the 360/768/1280 frames |

## Key symbols

Names a reviewer will grep for once the code lands. Locations are filled in as each is written.

| Symbol                     | Location |
| -------------------------- | -------- |
| `signInRequestSchema`      | `libs/contracts/src/auth.ts` |
| `errorBodySchema`          | `libs/contracts/src/error.ts` |
| `SIGN_IN_MIN_FAILURE_MS`   | `apps/api/src/domain/sign-in-failure-delay.ts` |
| `remainingDelayMs`         | `apps/api/src/domain/sign-in-failure-delay.ts` |
| `attemptSignIn`            | `apps/api/src/modules/auth/auth.service.ts` |
| `SignInOutcome`            | `apps/api/src/modules/auth/auth.service.ts` |
| `supabaseAuthClient`       | `apps/api/src/infra/supabase/index.ts` |
| `requireSession`           | `apps/api/src/http/middleware/require-session.ts` |
| `requireAdmin`             | `apps/api/src/http/middleware/require-admin.ts` |
| `requireHttps`             | `apps/api/src/http/middleware/require-https.ts` |
| `apiClient`                | `apps/ui/src/lib/api-client.ts` |
| `RequireRole`              | `apps/ui/src/lib/auth/require-role.tsx` |
