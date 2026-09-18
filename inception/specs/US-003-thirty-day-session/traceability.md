# US-003 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                              |
| ----------- | ------------------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-003-thirty-day-session.md` |
| **Updated** | 2026-09-18                                                   |

## Requirement to code

| Req    | File | Symbol / location | Proven by | Status      |
| ------ | ---- | ------------------ | --------- | ----------- |
| FR-01  | `apps/api/src/domain/session-lifetime.ts` | `isSessionExpired` | `apps/api/src/domain/session-lifetime.spec.ts` | implemented |
| FR-02  | `apps/api/src/domain/session-lifetime.ts` | `shouldStampLastSeen` | `apps/api/src/domain/session-lifetime.spec.ts` | implemented |
| FR-03  | `apps/api/src/domain/session-lifetime.ts` | (both — pure, no clock read, no `config/` import) | `apps/api/src/domain/session-lifetime.spec.ts` | implemented |
| FR-04  | `apps/api/src/modules/auth/auth.repository.ts` | `UserProfileRow.last_seen_at`, `COLUMNS` | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-05  | `apps/api/src/modules/auth/auth.repository.ts` | `ProfileRepository.stampLastSeen(id, at)` | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-06  | `apps/api/src/modules/auth/auth.service.ts` | `AuthService.loadSession` | `apps/api/src/modules/auth/auth.service.spec.ts` | implemented |
| FR-07  | `apps/api/src/modules/auth/auth.service.ts` | `AuthService.markSeen` | `apps/api/src/modules/auth/auth.service.spec.ts` | implemented |
| FR-08  | `apps/api/src/http/middleware/require-session.ts` | step 4 — expiry branch | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-09  | `apps/api/src/http/middleware/require-session.ts` | step 4 — renewal branch | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-10  | `apps/api/src/http/middleware/require-session.ts` | `RequireSessionDeps` | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-11  | `libs/contracts/src/error.ts` | `errorCodeSchema` — `session_expired` | `libs/contracts/src/error.spec.ts` | implemented |
| FR-12  | `apps/api/src/config/index.ts` | `SESSION_LIFETIME_DAYS`, `SESSION_LAST_SEEN_THROTTLE_MINUTES` | `apps/api/src/config/index.spec.ts` | implemented |
| FR-13  | `apps/api/src/config/index.ts` | `.superRefine` cross-field check | `apps/api/src/config/index.spec.ts` | implemented |
| FR-14  | `apps/api/src/composition.ts` | `buildApp` — ms conversion + overrides | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-15  | `apps/ui/src/lib/auth/auth-context.tsx` | `AuthProvider` boot `useEffect` | `apps/ui/src/lib/auth/auth-context.spec.tsx` | implemented |
| FR-16  | `apps/ui/src/lib/auth/auth-context.tsx` | same — `200` branch | `apps/ui/src/lib/auth/auth-context.spec.tsx` | implemented |
| FR-17  | `apps/ui/src/lib/auth/auth-context.tsx` | same — `error` (401) branch | `apps/ui/src/lib/auth/auth-context.spec.tsx` | implemented |
| FR-18  | `apps/ui/src/lib/auth/auth-context.tsx` | same — `unavailable` branch | `apps/ui/src/lib/auth/auth-context.spec.tsx` | implemented |
| FR-19  | `apps/ui/src/lib/auth/auth-context.tsx` | `AuthContextValue.status` | `apps/ui/src/lib/auth/auth-context.spec.tsx` | implemented |
| FR-20  | `apps/ui/src/lib/auth/require-session.tsx` | `RequireSession` — booting hold | `apps/ui/src/lib/auth/require-session.spec.tsx` | implemented |
| FR-21  | `apps/api/src/http/middleware/require-session.ts` | step 4 (proven at the API-test level, no dedicated symbol) | `apps/api/src/modules/auth/auth.routes.spec.ts` | implemented |
| FR-22  | `apps/ui/src/screens/sign-in/SignIn.tsx` | (absence — proven at the screen-test level, no dedicated symbol) | `apps/ui/src/screens/sign-in/SignIn.spec.tsx` | implemented |

## Key symbols

Names a reviewer will grep for.

| Symbol                | Location |
| ---------------------- | -------- |
| `isSessionExpired`     | `apps/api/src/domain/session-lifetime.ts` |
| `shouldStampLastSeen`  | `apps/api/src/domain/session-lifetime.ts` |
| `loadSession`          | `apps/api/src/modules/auth/auth.service.ts` |
| `markSeen`             | `apps/api/src/modules/auth/auth.service.ts` |
| `stampLastSeen`        | `apps/api/src/modules/auth/auth.repository.ts` |
| `requireSession` step 4 | `apps/api/src/http/middleware/require-session.ts` |
| `SESSION_LIFETIME_DAYS` (config) | `apps/api/src/config/index.ts` |
| `AuthContextValue.status` | `apps/ui/src/lib/auth/auth-context.tsx` |
| `RequireSession` (boot hold) | `apps/ui/src/lib/auth/require-session.tsx` |

## Correction to US-001's own traceability

US-001's `traceability.md` FR-18 previously read `implemented`, disagreeing with US-001's own
`spec.md` (`not started`) — the Architect's design note §1 found `last_seen_at` was in fact never
re-stamped on the request path, only at sign-in. That row now reads `closed by US-003`, and this
package is where it closes.
