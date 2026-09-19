# US-013 — See every booking in the office

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-013-see-every-booking.md`                       |
| **Traces to**     | REQ-011, REQ-028, BR-001.5, NFR-001, V-07                                          |
| **Screen**        | SCR-005 — ST-01, ST-02, ST-03, ST-05. ST-04/ST-06/ST-12 (filters) are US-014's; ST-07–ST-11 (cancellation) are US-015's. None touched |
| **Covering ADRs** | ADR-001, ADR-002, ADR-004, ADR-007 (all applied, none amended). **No new ADR** — the one real trade-off (pagination shape) is settled as a standards edit instead (`design-note.md` §8, confirmed with the human) |
| **Tier**          | Complex                                                                            |
| **Status**        | in progress                                                                        |
| **Updated**       | 2026-09-19                                                                         |

## Problem

`GET /api/admin/bookings` does not exist. `/api/admin` is mounted (US-001) behind `requireSession` +
`requireAdmin` but holds no routes — `adminRouter` is a bare, empty `Router()`. `AllBookings.tsx`
(SCR-005's screen) is a stub carrying only US-004/AC-07's password-saved toast. REQ-011 needs an
administrator to see every booking across every employee, from today onward by default, paged at 50
with an explicit control, with no archive cut-off ever.

The Architect design note (`design-note.md`, this folder) settles the question the story text
explicitly hands over (story line 112): *"Shape is `/architect`'s to settle — no OpenAPI contract
exists in this repository yet."* This spec restates that settlement as testable `FR-##`s; it does not
re-argue it — the design note is the argument, this is the checklist.

## Functional requirements

| ID    | Requirement                                                                                                                                                                   | Priority | Serves      | Status      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------- | ----------- |
| FR-01 | `GET /api/admin/bookings` (new route) mounts on the existing `/api/admin` mount point, inheriting `requireSession` + `requireAdmin` — no new trust surface (design-note §0, §5) | Must | AC-10 | planned |
| FR-02 | `libs/contracts/src/bookings.ts` gains `allBookingsQuerySchema` (`.strict()`, `page` optional via `z.coerce.number().int().min(1).max(MAX_PAGE)`), `allBookingsListItemSchema` (`id`, `date`, `deskNumber`, `employeeName`, `status: bookingDisplayStatusSchema` — four fields, no employee id, no desk id), and `allBookingsResponseSchema` (`today`, `total`, `items[]`, `nextPage`) (design-note §2.2, §2.3) | Must | AC-03, AC-04, AC-07 | planned |
| FR-03 | A new `AdminBookingsRepository` (separate object, not a method on `AvailabilityRepository`) in `apps/api/src/modules/bookings/admin-bookings.repository.ts`: one method reading `bookings` where `booking_date >= from`, **no status predicate**, ordered `booking_date asc, created_at asc, id asc` (a total order — the third key is load-bearing for offset paging), `range(offset, offset+49)`, `{ count: 'exact' }`, embedding `desks(desk_number)` and `user_profiles!user_id(full_name)` (disambiguated by column, not by the Postgres-generated FK constraint name) (design-note §3.1–§4.2) | Must | AC-02, AC-03, AC-05 | planned |
| FR-04 | A new `createAdminBookingsService` in `admin-bookings.service.ts`: derives `today` once via the existing `officeToday(nowMs(), officeTimezone)` seam, passes it to both the repository predicate and `bookingDisplayStatus` (ADR-007, reused verbatim — never re-derived), fixes the page size at 50 server-side (never a client parameter), and computes `nextPage` from `total`/offset — one source for both `total` and `nextPage` (design-note §2.3, §4.2) | Must | AC-02, AC-04, AC-06, AC-07 | planned |
| FR-05 | `admin.router.ts` becomes a factory, `createAdminRouter({ bookings })`, adding `GET /bookings`: validates the query at the edge (`400 invalid_request` on failure), sets `Cache-Control: private, no-store`, and never swallows a repository failure into an empty page — it propagates to `next(error)`, which is what keeps AC-08's real-empty-system distinguishable from a load failure (design-note §5) | Must | AC-04, AC-08, AC-09 | planned |
| FR-06 | `composition.ts` wires `adminBookingsRepository` → `createAdminBookingsService` → `createAdminRouter`, with an `adminBookings?` test seam matching the existing `availability?` pattern (design-note §5) | Must | (all server FRs) | planned |
| FR-07 | `AllBookings.tsx` replaces its stub body: a header stating the office timezone once (NFR-001), a live-region count line reading `"{total} booking(s) · from {today label} · all statuses"` (AC-07), skeleton rows at real row height while loading (ST-02), an inline `Alert tone="danger"` with **Try again** replacing the table on failure while the shell stays usable (ST-05), and the two existing US-004/AC-07 / navigation-state toasts preserved unchanged | Must | AC-07, AC-09 | planned |
| FR-08 | A real `<table>` (Date · Desk · Employee · Status columns, `<th>`s, real column headers) renders at ≥1024px; a card layout (one line at 768px, stacked at 360px) renders below 1024px carrying the same four fields in the same order. Both trees render in the DOM; CSS shows exactly one via `display: none/block` at the 1024px boundary — the only mechanism in this codebase that is both CSS-only (matching its zero-`matchMedia` precedent) and provable in `jsdom` (design-note §6.5) | Must | AC-03, AC-11 | planned |
| FR-09 | `AdminBookingRow` (screen-private to `all-bookings/`, not extracted from or merged into `BookingRow.tsx`) renders exactly four fields — date, desk number, employee name, status chip (`StatusChip kind="booking"`, reused as-is) — and **no action/cancel column**, deferred in full to US-015 (design-note §6.1) | Must | AC-03 | planned |
| FR-10 | ST-03 (empty system) renders `EmptyState` with title **"Nobody has booked a desk yet."** only — no conditional "Add desks" body/action, since no desk-inventory endpoint exists yet (design-note §6.2, deferred as open item 4) | Must | AC-08 | planned |
| FR-11 | `use-all-bookings.ts`: `loading` → `ready`/`error` state machine; `ready` accumulates pages via `loadMore()` (appends, never replaces); `retry()` resets to page 1; mirrors `use-my-bookings.ts`'s shape where the two screens share a need (loading/ready/error, `retry`) and diverges where paging by page-number rather than date-cursor differs | Must | AC-04, AC-09 | planned |
| FR-12 | `fetch-all-bookings.ts`: `GET /api/admin/bookings` (`?page=` when `page > 1`) via the shared `api-client`, parsed against `allBookingsResponseSchema` | Must | (supports FR-11) | planned |
| FR-13 | `landing.spec.ts` gains one assertion citing `US-013/AC-01` — an admin with the password mark clear lands on `/admin/bookings`. No new routing code: `landing.ts` and `routes.tsx`'s `RequireRole role="admin"` already do this (US-001/US-004) | Must | AC-01 | planned |
| FR-14 | `AllBookings.spec.tsx` is rebuilt around `AuthProvider` + `MemoryRouter` (mirroring `MyBookings.spec.tsx`'s `SignedIn`/`Primer` pattern), since the real screen calls `useAuth()`. Both existing US-004/AC-07 toast tests keep passing, unmodified in intent | Must | (test infra for FR-07–FR-11) | planned |

## Non-functional requirements

| ID     | Requirement                                                                                      | Serves  |
| ------ | --------------------------------------------------------------------------------------------------- | ------- |
| NFR-01 | Office timezone stated once in the page header, reusing the `OFFICE_TIME`-style copy pattern `MyBookings.tsx` already established | NFR-001 |
| NFR-02 | Non-colour status signalling comes entirely from the existing `StatusChip kind="booking"` (icon + word); no new chip variant | NFR-008 |
| NFR-03 | `AdminBookingsRepository`'s recording-fake test extends the existing fake pattern (`bookings.repository.spec.ts`) with `.range()` and `count` support, rather than introducing a mocking library (design-note §4.3) | testing-standards.md |
| NFR-04 | Two runtime-only assumptions (the FK-disambiguation hint; PostgREST's behaviour on a page past the last row) are verified against a real Postgres project via the existing `RUN_BOOKINGS_CONCURRENCY_TEST=1` harness, output pasted in the PR — neither is provable by the recording fake (design-note §3.1, §3.4, open item 2) | testing-standards.md |

## Technical constraints

- **No migration.** `bookings_booking_date_status_idx` already exists and its own comment names `REQ-011-013` (`supabase/migrations/0003_bookings.sql:78`). A migration in this PR is a review finding (design-note §3.3).
- **`AdminBookingsRepository` is a new, separate object — never a method on `AvailabilityRepository`.** Every existing method on that object is desk-scoped or filtered to `user_id`; adding the first cross-employee read there would destroy a cheap, checkable invariant this codebase leans on repeatedly (design-note §4.2).
- **The page size (50) is fixed server-side and is never a client-supplied parameter** — a deliberate departure from `api-standards.md`'s literal `?page&limit` wording, on the same security reasoning US-010 already established for its own list (design-note §2.4).
- **`SkeletonRow` (shared, `components/skeleton-row/`) is not widened.** A screen-private `AdminSkeletonRow` is built instead, on the same column grid as the real row (design-note §6.3).
- **`BookingRow.tsx` is not modified, and is not extracted into a shared component.** SCR-005's row is a real `<table>` row at ≥1024px (accessibility-load-bearing); SCR-002's is a flex `<div>`. There is no shared DOM to extract (design-note §6.1).
- **`total` (AC-07's count line) is the full count matching the view, not the number of rows currently loaded** — confirmed with the human; it stays true after `Show more` (design-note §2.5).
- **Pagination shape is `?page=`, not the `?before=<date>` cursor US-010 uses** — a criterion, not an inconsistency: a page defined by a fixed row count needs a total order and tolerates an offset; a page defined by a date window cannot fix a row count without a composite cursor (design-note §2.4). Recorded as a standards edit in `ai/standards/api-standards.md`, not an ADR (confirmed with the human).

## Out of scope

- Filters (date range, status, desk) and ST-04/ST-06/ST-12 — US-014.
- Cancellation-on-behalf, the action/cancel column in any layout, and ST-07–ST-11 — US-015.
- The desk-inventory-aware branch of ST-03 ("Add desks so people can book" + a link to SCR-006) — deferred to whichever story builds desk administration (design-note open item 4).
- Extracting a shared row/table component between SCR-002 and SCR-005 — design-note §6.1.
