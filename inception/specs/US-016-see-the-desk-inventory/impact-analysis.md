# US-016 — impact analysis

> What this change touches, written **before** it touches anything. Read at Gate D1 next to the plan. Required at Complex tier.

|             |                                                  |
| ----------- | ------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-016-see-the-desk-inventory.md` |
| **Tier**    | Complex                                          |
| **Updated** | 2026-09-19                                       |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                    |
| ------------------------ | -------- | ------------------------------------------------ |
| Contract                 | yes      | `GET /api/admin/desks`'s 200 body gains a required field, `bookedAhead` (`libs/contracts/src/desks.ts`); a new client route `/admin/desks` (`apps/ui/src/routes.tsx`); `StatusChip`'s shared props gain a third `kind` member |
| Persistence              | no       | No migration — `bookings_desk_id_booking_date_idx` and `bookings_booking_date_status_idx` already serve the new query |
| Trust                    | yes (inherited, not built) | `/admin/desks` sits behind the existing `RequireRole role="admin"` client guard and the existing `/api/admin` server mount (`requireSession` + `requireAdmin`) — no new guard code, but this is the story's first AC-10 test against this endpoint |
| Dependency & integration | no       | Two new local SVG assets (`icon-block.svg`, `icon-plus.svg`), not a package |
| Operational              | no       | No job, env value, or middleware changes |

## Files and callers

| File              | Symbol         | Change    | Callers found (`file:line`)   |
| ----------------- | -------------- | --------- | ----------------------------- |
| `libs/contracts/src/desks.ts` | `adminDeskSchema` / `AdminDesk` | add required field `bookedAhead` | `apps/api/src/modules/desks/desks.service.ts:4,14-17`, `apps/ui/src/screens/all-bookings/AllBookings.tsx:58,123,126`, `apps/ui/src/screens/all-bookings/use-desks.ts`, `apps/api/src/modules/admin/admin.router.ts:19,86-90` |
| `apps/api/src/modules/desks/desks.repository.ts` | `DesksRepository` | add method `listUpcomingConfirmedDeskIds` | `apps/api/src/modules/desks/desks.service.ts:11` (only consumer) |
| `apps/api/src/modules/desks/desks.service.ts` | `createDesksService` / `DesksServiceDeps` | add `nowMs`, `officeTimezone`; `listAllDesks` return shape gains `bookedAhead` | `apps/api/src/composition.ts:108` |
| `apps/api/src/composition.ts` | `buildApp` (the `createDesksService({...})` call at `:108`) | pass `nowMs`, `officeTimezone` | test harnesses that call `buildApp` with a `desks` seam (`apps/api/src/modules/admin/admin.routes.spec.ts`) |
| `apps/ui/src/components/status-chip/StatusChip.tsx` | `StatusChipProps` | add `{ kind: 'inventory'; status: 'active' \| 'inactive' }` member; export `INVENTORY_LABEL` | `apps/ui/src/screens/all-bookings/AdminBookingRow.tsx:22,76,96` (unaffected — different `kind`), `apps/ui/src/components/desk-row/DeskRow.tsx:17` (unaffected — different `kind`), new `apps/ui/src/screens/desks/DeskInventoryRow.tsx` (new consumer) |
| `apps/ui/src/screens/all-bookings/fetch-desks.ts`, `use-desks.ts`, `use-desks.spec.ts` | — | move to `apps/ui/src/lib/` (D-01) | `apps/ui/src/screens/all-bookings/AllBookings.tsx:32-33` (import path only, behaviour unchanged); new `apps/ui/src/screens/desks/Desks.tsx` (new consumer) |
| `apps/ui/src/routes.tsx` | `AppRoutes` | add `/admin/desks` route under `RequireRole role="admin"` | none (route table has no callers beyond the router itself) |
| `knowledge/traceability/manifest.json` | US-014's `tests[]` entry | one path string updated (`use-desks.spec.ts`'s new location) | `tools/aidlc-check.mjs` (parses this file; re-run after edit) |

## Regression risk

| Area                | Risk              | Why                                          | Covered by             |
| ------------------- | ----------------- | --------------------------------------------- | ----------------------- |
| `GET /api/admin/desks` existing consumers (US-014's filter dropdown) | low | Additive field only; `admin.routes.spec.ts:480-483`'s exact-object assertion will fail to compile/pass until extended — deliberate, not a silent break | `admin.routes.spec.ts` (extended in Step, not deleted) |
| `admin.routes.spec.ts`'s four `DesksRepository` stub literals | medium | Adding a second interface method makes existing partial-object stubs fail to typecheck until each is extended | Fixed mechanically in the same PR; `desks.repository.spec.ts` |
| US-014's own manifest entry (`use-desks.spec.ts` path) | low | File is moved, not deleted; citations (`US-014/AC-03`) travel with it unchanged | `tools/aidlc-check.mjs` run before PR |
| `StatusChip` existing `kind: 'desk'` / `kind: 'booking'` call sites | none expected | New member is additive to a discriminated union; existing call sites are unaffected by construction (TypeScript narrows on the existing `kind` values) | `StatusChip.spec.tsx` (existing cases untouched, new cases added) |
| Employee-facing `apps/ui/src/components/desk-row/DeskRow.tsx` | none | Different file, different folder, unaffected by the new screen-private `DeskInventoryRow.tsx` (D-05 renames to avoid a name collision on the two, not a code collision) | n/a — no shared code path |

## Deliberately not touched

- `apps/api/src/domain/booking-history.ts` — `bookingDisplayStatus` and `displayStatusPredicate` are read, never edited; the count borrows the existing predicate rather than adding a rule.
- `apps/api/src/modules/bookings/**` — the bookings module gains no method; `modules/desks` reads the `bookings` table directly per ADR-004, a different module's read of the same table.
- `inception/design/tokens.css` — both chip roles (`--c-state-available-*`, `--c-state-inactive-*`) already exist in both themes.
- `apps/ui/src/components/app-shell/AppShell.tsx` — `ADMIN_NAV` already lists `/admin/desks`; this story makes the existing link resolve by adding the route, not by touching the shell.
- `apps/ui/src/components/button/Button.tsx`, `empty-state/EmptyState.tsx`, `alert/Alert.tsx` — composed as-is, no new props.
- `apps/ui/src/lib/data-refresh.ts` — this screen does not subscribe to the focus-refresh layer (story's own edge case).
- `supabase/migrations/**` and `eslint.config.mjs` — no schema change; `MAY_IMPORT.desks` stays `[]`.
