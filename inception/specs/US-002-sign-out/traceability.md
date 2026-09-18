# US-002 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                    |
| ----------- | -------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-002-sign-out.md` |
| **Updated** | 2026-09-18                                         |

**A `—` in the File column means the code does not exist yet**, and that is deliberate: a table
citing a file that is not there is a claim rather than a record, and `aidlc-check` check 16
rejects it, correctly. Each row gains its file, symbol and proving test in the same commit as
the code itself. The **intended** destination of a `not started` row is in
[`implementation-plan.md`](implementation-plan.md), step by step, where it belongs while it is
still a plan.

## Requirement to code

| Req    | File | Symbol / location | Proven by | Status      |
| ------ | ---- | ------------------ | --------- | ----------- |
| FR-01  | `apps/api/src/modules/auth/auth.router.ts` | `POST /sign-out` handler | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-02  | `apps/api/src/modules/auth/auth.router.ts` | same handler — no schema parse | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-03  | `apps/api/src/modules/auth/auth.router.ts` | same handler — always `204` | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-04  | `apps/api/src/modules/auth/auth.service.ts` | `signOut(accessToken)` | `apps/api/src/modules/auth/auth.service.spec.ts` | implemented |
| FR-05  | `apps/api/src/modules/auth/auth.adapter.ts` | `revokeSession(token, scope)` | `apps/api/src/modules/auth/auth.service.spec.ts`, `apps/api/src/modules/auth/auth.adapter.spec.ts` | implemented |
| FR-06  | `apps/api/src/modules/auth/auth.service.ts` | `signOut` — no-token branch, warns | `apps/api/src/modules/auth/auth.service.spec.ts` | implemented |
| FR-07  | `apps/api/src/modules/auth/auth.router.ts` | `POST /sign-out` bypassing `requireSession` | `apps/api/src/modules/auth/auth.routes.spec.ts` — AC-04 structural test | implemented |
| FR-08  | `apps/api/src/modules/auth/auth.router.ts` | same | `apps/api/src/modules/auth/auth.routes.spec.ts` — AC-04 credential test | implemented |
| FR-09  | `apps/ui/src/components/app-shell/AccountMenu.tsx` | `AccountMenu` — static footer, `D-06` superseding the original disclosure | `apps/ui/src/components/app-shell/AccountMenu.spec.tsx` | implemented |
| FR-10  | `apps/ui/src/components/app-shell/AccountMenu.tsx` | same | `apps/ui/src/components/app-shell/AccountMenu.spec.tsx` | implemented |
| FR-11  | `apps/ui/src/lib/auth/auth-context.tsx` | `AuthProvider`'s `accessTokenRef` | `apps/ui/src/lib/auth/auth-context.spec.tsx` | implemented |
| FR-12  | `apps/ui/src/lib/auth/auth-context.tsx` | `signOut()` | `apps/ui/src/lib/auth/auth-context.spec.tsx` | implemented |
| FR-13  | `apps/ui/src/lib/auth/auth-context.tsx` | same — proceeds regardless of the server's answer | `apps/ui/src/lib/auth/auth-context.spec.tsx` | implemented |
| FR-14  | `apps/ui/src/lib/api-client.ts` | `requestNoContent` | `apps/ui/src/lib/api-client.spec.ts` | implemented |
| FR-15  | `apps/ui/src/lib/auth/require-session.tsx` | `RequireSession` | `apps/ui/src/lib/auth/require-session.spec.tsx` | implemented |

## Key symbols

Names a reviewer will grep for once the code lands. Locations are filled in as each is written.

| Symbol           | Location |
| ----------------- | -------- |
| `signOut` (service) | `apps/api/src/modules/auth/auth.service.ts` |
| `POST /sign-out`   | `apps/api/src/modules/auth/auth.router.ts` |
| `revokeSession`    | `apps/api/src/modules/auth/auth.adapter.ts` |
| `requestNoContent` | `apps/ui/src/lib/api-client.ts` |
| `AccountMenu`      | `apps/ui/src/components/app-shell/AccountMenu.tsx` |
| `RequireSession`   | `apps/ui/src/lib/auth/require-session.tsx` |
| `signOut` (context) | `apps/ui/src/lib/auth/auth-context.tsx` |
