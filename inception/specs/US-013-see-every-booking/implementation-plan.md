# US-013 — implementation plan

> **The Gate D1 artifact.** The human reads this file, `spec.md`, and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                                |
| --------- | ------------------------------------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-013-see-every-booking.md`                  |
| **Spec**  | `spec.md`                                                                       |
| **Tier**  | Complex — a new route (`ai/standards/task-surfaces.md:39`) and a new `libs/contracts` slice, independently (see `impact-analysis.md`) |

## Approval — Gate D1

| Field                | Value                                                                        |
| -------------------- | ----------------------------------------------------------------------------- |
| Status               | **approved**                                                                   |
| Approved by          | Joy Joshua <joy_j@trigent.com>                                                 |
| Approved on          | 2026-09-19                                                                     |
| Plan commit approved | *uncommitted at approval* — base `86c2ffa7d99efdeefdc5abdf0b742390870628fe`    |

`Approved by` is the human's name and email from `git config user.name` / `user.email`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**, the commit before this stamp. The name is self-asserted, so it is attribution, not authentication.

## Steps

Ordered. Each step names the files it touches, the `FR-##` it advances (`spec.md`), and how it is verified. Test-first per acceptance criterion: the failing test named `... (US-013/AC-##)` comes before the code that turns it green.

### Step 1 — `libs/contracts/src/bookings.ts`: the new wire shapes

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-02                                                                                                        |
| Files    | `libs/contracts/src/bookings.ts` (modify — add `allBookingsQuerySchema`, `allBookingsListItemSchema`, `allBookingsResponseSchema`, `MAX_PAGE`), `libs/contracts/src/bookings.spec.ts` (modify) |
| Verify   | `npm run build:contracts && npm test -w libs/contracts` — expected: `allBookingsQuerySchema` accepts no `page` and `page=2`, rejects `page=0`, `page="abc"`, `page` beyond `MAX_PAGE`, and any unknown field; `allBookingsListItemSchema` requires all four fields; `allBookingsResponseSchema` round-trips a full envelope and defaults `nextPage` to `null` |

### Step 2 — `admin-bookings.repository.ts`: the cross-employee read

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-03                                                                                                        |
| Files    | `apps/api/src/modules/bookings/admin-bookings.repository.ts` (create), `apps/api/src/modules/bookings/admin-bookings.repository.spec.ts` (create — extends `bookings.repository.spec.ts`'s recording-fake pattern with `.range()` and `count`) |
| Verify   | `npm test -w apps/api -- admin-bookings.repository.spec.ts` — expected, one case per: the query carries `gte('booking_date', from)` and **no** `.eq('status', …)` (US-013/AC-02); the select string carries the disambiguated embed `user_profiles!user_id(full_name)` alongside `desks(desk_number)` (US-013/AC-03); the order is `booking_date asc, created_at asc, id asc` (US-013/AC-04's stability); `range(offset, offset+49)` and `{ count: 'exact' }` are passed for a given page; `from` = 500 days before an arbitrary anchor still returns a seeded old row from the fake — no floor logic in the query itself (US-013/AC-05) |

### Step 3 — `admin-bookings.service.ts`: derive `today` once, map status, compute `nextPage`

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-04                                                                                                        |
| Files    | `apps/api/src/modules/bookings/admin-bookings.service.ts` (create), `apps/api/src/modules/bookings/admin-bookings.service.spec.ts` (create) |
| Verify   | `npm test -w apps/api -- admin-bookings.service.spec.ts` — expected: a stored `confirmed` row dated before `today` maps to `completed` (US-013/AC-06); a `cancelled` row stays `cancelled` regardless of date; `today` is derived exactly once (one `nowMs()` call) and threaded to both the repository call and `bookingDisplayStatus`; `total === 50` on page 1 → `nextPage: null`; `total === 51` → `nextPage: 2` (US-013/AC-04's boundary); page 2 of 51 → `nextPage: null` |

### Step 4 — `admin.router.ts`: bare `Router` → factory, `GET /bookings`

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-05                                                                                                 |
| Files    | `apps/api/src/modules/admin/admin.router.ts` (rewrite as `createAdminRouter({ bookings })`; update its docblock — it is no longer empty, but the guard-precedes-routing property it documents still holds), `apps/api/src/composition.ts` (modify — wire the new service/router, add `adminBookings?` seam) |
| Verify   | Covered by Step 5's route tests (a router with no route tests of its own — `admin.routes.spec.ts` exercises it through the real `buildApp`, matching every other router in this codebase) |

### Step 5 — `admin.routes.spec.ts`: the route, end to end, over stubs

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-05, FR-06                                                                                          |
| Files    | `apps/api/src/modules/admin/admin.routes.spec.ts` (create — supertest against the real `createApp`, matching `bookings.routes.spec.ts`'s and `auth.routes.spec.ts`'s own reasoning: AC-10 in particular is only proven by a real request through the real mount) |
| Verify   | `npm test -w apps/api -- admin.routes.spec.ts` — expected, one case per: **AC-10** — an Employee session gets `403 admin_only` with no booking data in the body; no token gets `401`; an Admin session gets `200`; **AC-02** — a booking dated tomorrow with status `cancelled` is present in the default page (no status filter); **AC-04** — exactly 50 matching stub rows → `nextPage: null`; 51 → 50 items + `nextPage: 2`; `?page=2` → the 51st; a non-numeric or zero `page` → `400 invalid_request`; **AC-07** — with 137 matching stub rows, page 1 carries `total: 137`; **AC-08** — an empty stub gives `total: 0, items: [], nextPage: null`; a thrown repository error propagates as `500`, never a swallowed empty page |

### Step 6 — Real-Postgres verification (gated, run once before merge)

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | (verifies FR-03's two runtime-only assumptions — design-note §3.1, §3.4, open item 2)                       |
| Files    | `apps/api/src/modules/bookings/bookings.repository.concurrency.spec.ts` (modify — add a describe block for the admin read, gated the same way, `RUN_BOOKINGS_CONCURRENCY_TEST=1`) |
| Verify   | Against a disposable Supabase project (credentials from the human — see the note below): `RUN_BOOKINGS_CONCURRENCY_TEST=1 npm test --workspace @desk-booking/api -- concurrency` — expected: (a) seed two profiles, a desk, and a booking whose `user_id` and `cancelled_by` differ (a cancelled booking cancelled by someone else) — `employeeName` in the real result is the **holder's** name, never the canceller's; (b) requesting a page past the last row returns an empty `200` (`items: [], nextPage: null`), not a `416`/thrown error — if PostgREST answers `416`, `admin-bookings.repository.ts` gains an explicit catch mapping it to an empty page before this step is considered done. Real output pasted into the PR verbatim |

**Before this step:** the human provides `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` for a disposable project (never a shared dev or production one) as local environment variables — not pasted into chat. DEV runs the command above against them, or walks the human through running it themselves.

### Step 7 — `all-bookings.css`, `AdminSkeletonRow`, `AdminBookingRow`: the visual primitives

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-08, FR-09                                                                                                 |
| Files    | `apps/ui/src/screens/all-bookings/AdminSkeletonRow.tsx` (create), `apps/ui/src/screens/all-bookings/AdminBookingRow.tsx` (create), `apps/ui/src/screens/all-bookings/AdminBookingRow.spec.tsx` (create), `apps/ui/src/screens/all-bookings/all-bookings.css` (create) |
| Verify   | `npm test -w apps/ui -- AdminBookingRow.spec.tsx` — expected: the table tree renders `<th>`s in order Date · Desk · Employee · Status and one `<tr>` per item with all four fields, no action cell (US-013/AC-03, AC-11); the card tree (rendered in the same component, shown/hidden by CSS) carries the same four fields in the same order at both card densities; neither tree renders a Cancel control or an em dash (US-013's scope boundary, `decisions.md` D-06); a passed-date `confirmed` row and a `cancelled` row each render the correct `StatusChip` variant (US-013/AC-06) |

### Step 8 — `fetch-all-bookings.ts` + `use-all-bookings.ts`: the data layer

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-11, FR-12                                                                                                 |
| Files    | `apps/ui/src/screens/all-bookings/fetch-all-bookings.ts` (create), `apps/ui/src/screens/all-bookings/use-all-bookings.ts` (create), `apps/ui/src/screens/all-bookings/use-all-bookings.spec.ts` (create) |
| Verify   | `npm test -w apps/ui -- use-all-bookings.spec.ts` — expected: initial state is `loading`; a successful fetch transitions to `ready` with `items`/`total`/`nextPage`; `loadMore()` appends the next page's items rather than replacing (US-013/AC-04); `loadMore()` is a no-op when `nextPage` is `null` or a previous call is in flight; `retry()` re-fetches page 1 and drops any accumulated later pages; a rejecting fetcher is treated as `error`, never thrown (same discipline as `useMyBookings`) |

### Step 9 — Copy, then `AllBookings.tsx` itself

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-07, FR-10                                                                                                 |
| Files    | `apps/ui/src/screens/all-bookings/copy.ts` (create), `apps/ui/src/screens/all-bookings/copy.spec.ts` (create), `apps/ui/src/screens/all-bookings/AllBookings.tsx` (rewrite), `apps/ui/src/screens/all-bookings/AllBookings.spec.tsx` (rewrite around `AuthProvider`+`MemoryRouter`, mirroring `MyBookings.spec.tsx`) |
| Verify   | `npm test -w apps/ui -- AllBookings.spec.tsx` — expected, one case per: both existing US-004/AC-07 toast tests still pass unmodified in intent (FR-14); skeleton rows render while loading, real row height, `aria-hidden` (ST-02, US-013/AC-09); the count line reads `"{total} booking(s) · from {today label} · all statuses"` and is a live region (US-013/AC-07); the table renders at the component level with the 4-field row content (US-013/AC-03); **Show more** is present iff `nextPage !== null`, and a press appends rather than replaces (US-013/AC-04); an empty system (`total: 0`) renders **only** "Nobody has booked a desk yet." — no "Add desks" action (US-013/AC-08, `decisions.md` D-07); a failed fetch renders `Alert tone="danger"` with **Try again**, replacing the table, shell intact (ST-05, US-013/AC-09) |

### Step 10 — AC-01, and the boundary test QA flagged

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-13                                                                                                        |
| Files    | `apps/ui/src/lib/auth/landing.spec.ts` (modify — one added assertion) |
| Verify   | `npm test -w apps/ui -- landing.spec.ts` — expected: an admin with `mustChangePassword: false` lands on `/admin/bookings`, cited `US-013/AC-01` (no new production code — `landing.ts` already returns this) |

### Step 11 — Traceability, manifest, spec-index, standards edit

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | (documentation of the above, plus `decisions.md` D-02's standards edit)                                      |
| Files    | `traceability.md` (modify — flip each row to `implemented` with real `file:line`), `knowledge/traceability/manifest.json` (modify — `US-013.tests[]`, `US-013.decisions` → `ADR-004`, `ADR-007`), `inception/specs/index.md` (modify — add the US-013 row), `ai/standards/api-standards.md` (modify — §Pagination criterion, per `decisions.md` D-02), `apps/api/src/modules/bookings/README.md` (modify — now reads `user_profiles` too, per ADR-004) |
| Verify   | `node tools/aidlc-check.mjs` — expected: all checks pass, including check 4 (manifest `tests[]` parses) and check 16 (spec package completeness) |

### Step 12 — Full verification pass

| Field    | Value                                    |
| -------- | ----------------------------------------- |
| Advances | (all)                                      |
| Files    | none (verification only)                   |
| Verify   | `npm run lint`, `npm run typecheck`, `npm test` — expected: all green, pasted into the PR description verbatim. Manual UI check in a real browser at 1280/768/360px, per "start the dev server and use the feature before reporting done" |

## Rollback

Revert the PR. No migration to reverse. `admin.router.ts` reverts to its prior bare `Router()`; `composition.ts`'s new seam and wiring are additive and revert cleanly; no existing route's behaviour depends on anything added here.

## Open questions

None blocking. Three of the design note's open items were resolved in chat before this plan (`decisions.md` D-01–D-03); two more were resolved by re-reading the Figma frames already pulled (D-04, D-05, D-06 — confirmed rather than escalated). Two remain, both non-blocking for Gate D1 and tracked to their actual owners:

- **Design-note open item 2** — the real-Postgres verification (Step 6) needs the human's disposable Supabase credentials, supplied out of chat when Step 6 is reached, not before.
- **Design-note open item 4** — ST-03's desk-inventory-aware branch, deferred to whichever story builds desk administration. Not this story's to solve.
