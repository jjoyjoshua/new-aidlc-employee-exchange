# US-020 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                  |
| ----------- | ------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-020-find-an-account.md` |
| **Tier**    | Complex                                          |
| **Updated** | 2026-09-19                                       |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                    |
| ------------------------ | -------- | ------------------------------------------------ |
| Contract                 | yes      | A new endpoint, `GET /api/admin/users` (`libs/contracts/src/users.ts`, new file); a new client route, `/admin/people` (`apps/ui/src/routes.tsx`); `StatusChip`'s shared props gain a fourth `kind` member |
| Persistence              | no       | No migration — `user_profiles` and `user_profiles_is_active_role_idx` (`supabase/migrations/0001_user_profiles.sql`) already exist and already anticipate this read |
| Trust                    | yes (inherited, not built) | `/admin/people` sits behind the existing `RequireRole role="admin"` client guard and the existing `/api/admin` server mount (`requireSession` + `requireAdmin`) — no new guard code, but this is the **first** endpoint in the system that returns more than one account's name and email in one response, so a guard mistake here has a materially larger blast radius than any prior admin route |
| Dependency & integration | no       | No new package. `.ilike()`/`.or()` are new **usage** of the existing `@supabase/supabase-js` client, not a new dependency |
| Operational              | no       | No job, env value, or middleware changes |

## Files and callers

| File              | Symbol         | Change    | Callers found (`file:line`)   |
| ----------------- | -------------- | --------- | ------------------------------ |
| `libs/contracts/src/users.ts` | `adminUserSchema`, `adminUsersResponseSchema`, `adminUsersQuerySchema` | create | `apps/api/src/modules/users/users.service.ts` (new), `apps/api/src/modules/admin/admin.router.ts` (new route), `apps/ui/src/lib/fetch-users.ts` (new) |
| `libs/contracts/src/index.ts` | barrel | add `export * from './users.js'` | every consumer of `@desk-booking/contracts` (additive; no existing export removed or renamed) |
| `apps/api/src/modules/users/` | — | new module folder (`users.repository.ts`, `users.service.ts`) | `apps/api/src/composition.ts` (new `createUsersService(...)` call site), `apps/api/src/modules/admin/admin.router.ts` (new `users` dep) |
| `apps/api/src/modules/admin/admin.router.ts` | `createAdminRouter` | add `GET /users` route and a `users` dependency to `AdminRouterDeps` | `apps/api/src/composition.ts` (only caller of `createAdminRouter`) |
| `apps/api/src/composition.ts` | `buildApp` | pass a new `users` dependency to `createAdminRouter({...})` | test harnesses that call `buildApp` with an `adminRouter` seam (`apps/api/src/modules/admin/admin.routes.spec.ts`) |
| `apps/ui/src/components/status-chip/StatusChip.tsx` | `StatusChipProps` | add `{ kind: 'account'; status: 'active' \| 'inactive' }` member; export `ACCOUNT_LABEL` | `apps/ui/src/screens/all-bookings/AdminBookingRow.tsx`, `apps/ui/src/components/desk-row/DeskRow.tsx`, `apps/ui/src/screens/desks/DeskInventoryRow.tsx` (all unaffected — different `kind`); new `apps/ui/src/screens/people/AccountRow.tsx` (new consumer) |
| `apps/ui/src/routes.tsx` | `AppRoutes` | add `/admin/people` route under `RequireRole role="admin"` | none (route table has no callers beyond the router itself) |
| `apps/ui/src/components/app-shell/AppShell.tsx` | `ADMIN_NAV` | none — `/admin/people` is already listed (`AppShell.tsx:34`) | n/a |
| `knowledge/traceability/manifest.json` | — | add US-020's `requirements[]`/`acs[]`/`tests[]` entries | `tools/aidlc-check.mjs` (parses this file) |

## Regression risk

| Area                | Risk              | Why                                          | Covered by             |
| ------------------- | ----------------- | --------------------------------------------- | ----------------------- |
| `StatusChip` existing `kind: 'desk'` / `'booking'` / `'inventory'` call sites | none expected | New member is additive to a discriminated union; existing call sites are unaffected by construction (TypeScript narrows on the existing `kind` values) | `StatusChip.spec.tsx` (existing cases untouched, new cases added) |
| `admin.router.ts`'s existing `/bookings` and `/desks` routes | none expected | This story only adds a new route and a new dependency to `AdminRouterDeps`; no existing handler is edited | `admin.routes.spec.ts` (existing cases untouched) |
| `libs/contracts/src/index.ts` consumers | low | Purely additive barrel export | typecheck across `apps/api` and `apps/ui` |
| First multi-account PII response in the system | medium | A guard mistake or an accidental extra column (e.g. `must_change_password`, `deactivated_at`) would leak more than any prior admin route | `admin.routes.spec.ts` AC-13 case asserting the exact response shape and a 403 for an Employee token; `adminUserSchema`'s explicit column list |
| `apps/api/src/composition.ts`'s existing `createAdminRouter({...})` call site | low | Adding a required `users` dependency makes the existing call site fail to typecheck until extended | Fixed mechanically in the same PR; `apps/api/src/composition.spec.ts` if one exists, else `admin.routes.spec.ts`'s harness |

## Deliberately not touched

- `apps/api/src/modules/auth/auth.repository.ts` — `profileRepository.findById` is read, never edited; this story's repository is a new, separate reader of `user_profiles` for a different shape (a list, not a single row).
- `supabase/migrations/**` — no schema change; `user_profiles` and its index already serve this read.
- `eslint.config.mjs` — `MAY_IMPORT.users` already lists `['notifications']`; no boundary change needed since this story adds no `notifications` call.
- SCR-009 (the user form) and any deactivate/role-change/reset-password dialog (ST-05–ST-14) — those are US-023 through US-027's screens, not this one.
- `apps/ui/src/lib/data-refresh.ts` — this screen does not subscribe to the focus-refresh layer.
- `apps/ui/src/components/dialog/Dialog.tsx` — read for comparison (`decisions.md` D-05) but not modified; the new row menu is a separate component.
