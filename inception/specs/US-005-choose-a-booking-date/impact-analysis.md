# US-005 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                                    |
| ----------- | ------------------------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-005-choose-a-booking-date.md`  |
| **Tier**    | Complex                                                            |
| **Updated** | 2026-09-18                                                         |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                                                                    |
| ------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract                 | yes      | `signInResponseSchema` and `sessionResponseSchema` gain a nested `office` field (additive, non-`.strict()`) |
| Persistence              | no       | Nothing is read from or written to `bookings`, `desks`, or any table in this story                                                                              |
| Trust                    | no       | No auth/authz/session/credential path changes; `require-session.ts` is untouched                                                                                |
| Dependency & integration | no       | No new package; `Intl` and `Date.UTC` are platform, not a dependency                                                                                             |
| Operational              | no       | `OFFICE_TIMEZONE` already exists, already required — no new config key, no new middleware, no new job                                                            |

## Files and callers

| File                                              | Symbol                                        | Change                                    | Callers found (`file:line`)                                                                                                     |
| -------------------------------------------------- | ---------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `libs/contracts/src/auth.ts`                      | `signInResponseSchema`                        | additive field (`office`)                 | `apps/api/src/modules/auth/auth.router.ts:91`, `apps/ui/src/lib/auth/auth-context.tsx:195`                                        |
| `libs/contracts/src/auth.ts`                      | `sessionResponseSchema`                       | additive field (`office`)                 | `apps/api/src/modules/auth/auth.router.ts:198`, `apps/ui/src/lib/auth/auth-context.tsx:154`                                       |
| `libs/contracts/src/index.ts`                     | module docblock                               | wording correction (§`design-note.md` §2.1) | none — comment only                                                                                                              |
| `eslint.config.mjs`                               | Boundary 5 `no-restricted-imports` message    | wording correction, same reason           | none — lint message only                                                                                                          |
| `apps/api/src/modules/auth/auth.router.ts`        | `createAuthRouter`                            | new dep (`officeTimezone`); both handlers build `office` | `apps/api/src/composition.ts:80`                                                                                                  |
| `apps/api/src/composition.ts`                     | `BuildAppOptions`, `buildApp`                  | new optional override `officeTimezone`, threaded to `createAuthRouter` | `apps/api/src/index.ts`, every `*.routes.spec.ts` that calls `buildApp(...)`                                                      |
| `apps/ui/src/lib/auth/auth-context.tsx`           | `AuthContextValue`, `signIn`, checkSession effect | carries `office` alongside `user` from both responses | `apps/ui/src/routes.tsx`, every screen consuming `useAuth()` (none read `office` yet outside this story)                          |
| `apps/ui/src/routes.tsx`                          | `AppRoutes`                                   | mounts `/book` → `BookADesk` (reserved, unbuilt until now) | none — a route addition, not a signature change                                                                                   |

## Regression risk

| Area                                    | Risk   | Why                                                                                                                                                    | Covered by                                    |
| ------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Existing sign-in / session-check flow      | low    | `office` is additive and responses stay non-`.strict()`; a tab open across the deploy still parses the old shape it already received                     | `auth.routes.spec.ts`, `auth-context.spec.tsx` (existing suites re-run) |
| `BookADesk` page-header layout at 360/768/1280 | medium | The Figma `Page header` component places the timezone differently per width (desktop: same line, right-aligned; mobile: stacked under the title) — a naive addition could clip or wrap | `BookADesk.spec.tsx` (new assertions), manual check against the three Figma frames pulled for ST-01 |
| Civil-date formatting across timezones     | high   | `new Date('YYYY-MM-DD').toLocaleDateString()` renders the wrong calendar day for any viewer west of Greenwich — the design note's named "single most likely defect" | `booking-window.spec.ts` AC-07 case (Kolkata instant vs. UTC), `BookADesk.spec.tsx` with runner `TZ` set west of UTC |
| Latest-wins race on rapid date changes     | medium | A naive "disable while loading" implementation would pass a careless test while removing the exact behaviour AC-08 protects                             | `use-availability.spec.ts` — resolves the earlier request after the later one, asserts the earlier payload never renders |

## Deliberately not touched

- `apps/api/src/config/index.ts` — `OFFICE_TIMEZONE` already exists, already required, already validated. No diff expected here.
- `supabase/migrations/**` — nothing in this story reads or writes `bookings` or any other table.
- `apps/api/src/http/app.ts` and `apps/api/src/http/middleware/**` — no new route mount at the app level (bookings still has no router) and the auth chain is unchanged.
- `libs/contracts/src/error.ts` — this story introduces no new refusal that crosses the wire; `DateRefusal` is a domain code rendered client-side, not an HTTP error code.
- `apps/ui/src/components/app-shell`'s nav labels and responsive collapse — a real mismatch against the approved `Sidebar` component, but tracked as its own change per the human's direction, not folded into this PR.
