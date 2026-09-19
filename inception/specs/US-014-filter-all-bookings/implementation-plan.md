# US-014 — implementation plan

> **The Gate D1 artifact.** The human reads this file, `spec.md`, and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                                |
| --------- | ------------------------------------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-014-filter-all-bookings.md`                 |
| **Spec**  | `spec.md`                                                                       |
| **Tier**  | Complex — `libs/contracts` (protected path, `ai/standards/task-surfaces.md:25-27`) and a new route, `GET /api/admin/desks` (`task-surfaces.md:39`), independently (see `impact-analysis.md`) |

## Approval — Gate D1

| Field                | Value                                                                     |
| -------------------- | -------------------------------------------------------------------------- |
| Status               | **approved**                                                                |
| Approved by          | Joy Joshua <joy_j@trigent.com>                                             |
| Approved on          | 2026-09-19                                                                  |
| Plan commit approved | *uncommitted at approval* — base `7d5310b88caccd3f6a8f72a3aec8288040f4a866` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**, the commit before this stamp. The name is self-asserted, so it is attribution, not authentication.

## Steps

Ordered. Each step names the files it touches, the `FR-##` it advances (`spec.md`), and how it is verified. Test-first per acceptance criterion: the failing test named `... (US-014/AC-##)` comes before the code that turns it green.

### Step 1 — `libs/contracts`: the four new query fields, and the new desks resource

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-02, FR-03, FR-04                                                                                   |
| Files    | `libs/contracts/src/bookings.ts` (modify — add `from`/`to`/`status`/`deskId` to `allBookingsQuerySchema`, add the `.refine()`, edit `bookingDisplayStatusSchema`'s docblock), `libs/contracts/src/bookings.spec.ts` (modify), `libs/contracts/src/desks.ts` (create — `adminDeskSchema`, `adminDesksResponseSchema`), `libs/contracts/src/desks.spec.ts` (create), `libs/contracts/src/index.ts` (modify — export `./desks.js`) |
| Verify   | `npm run build:contracts && npm test -w libs/contracts` — expected: `allBookingsQuerySchema` accepts each filter alone and combined, rejects `to` before `from` and an unknown status word, still rejects any unknown field; `allBookingsResponseSchema` is byte-for-byte unchanged (a snapshot/shape test citing US-014/AC-07 asserting no new field exists); `adminDesksResponseSchema` round-trips a mixed active/inactive list |

### Step 2 — `booking-history.ts`: the inverse rule, and the property test that pins it

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-05, FR-06                                                                                                 |
| Files    | `apps/api/src/domain/booking-history.ts` (modify — add `displayStatusPredicate`; `bookingDisplayStatus` untouched), `apps/api/src/domain/booking-history.spec.ts` (modify — add the round-trip property test) |
| Verify   | `npm test -w apps/api -- booking-history.spec.ts` — expected: `displayStatusPredicate('confirmed', today)` yields `{ stored: 'confirmed', from: today }`; `('completed', today)` yields `{ stored: 'confirmed', before: today }`; `('cancelled', today)` yields `{ stored: 'cancelled' }` with no date bound; the 18-case round-trip property test (US-014/AC-02) passes; a diff to `bookingDisplayStatus` itself fails review, not this test |

### Step 3 — `admin-bookings.repository.ts`: `listBookingsFromDate` → `listBookings(filter, …)`

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-07                                                                                                        |
| Files    | `apps/api/src/modules/bookings/admin-bookings.repository.ts` (modify — rename method, accept `{ from, to?, before?, status?, deskId? }`, apply `.gte`/`.lte`/`.lt`/`.eq` independently), `apps/api/src/modules/bookings/admin-bookings.repository.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- admin-bookings.repository.spec.ts` — expected, one case per: `to` adds `.lte('booking_date', to)` (US-014/AC-01); `status` adds `.eq('status', stored)` and `before` adds `.lt('booking_date', before)` (US-014/AC-02); `deskId` adds `.eq('desk_id', deskId)` (US-014/AC-03); all four together produce all four predicates on one call (US-014/AC-04); the `.select()` string, three-key ordering, `range()` and `{ count: 'exact' }` are byte-identical to US-013's — a diff there fails this test's snapshot |

### Step 4 — `admin-bookings.service.ts`: resolve the filter, one clock read

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-08                                                                                                        |
| Files    | `apps/api/src/modules/bookings/admin-bookings.service.ts` (modify — accept the four query fields, call `displayStatusPredicate`, raise `from` to the status floor via lexicographic `max`) |
| Verify   | `npm test -w apps/api -- admin-bookings.service.spec.ts` — expected: **a stored `confirmed` row dated yesterday is returned when `status=completed` and NOT returned when `status=confirmed`** (US-014/AC-02, the QA note's exact assertion); an absent `from` resolves to the single `today` reading, not a second clock call (US-014's AC-05/default-view interaction); `from`+`status=completed` where the query's `from` is later than today raises correctly (max, not overwrite) |

### Step 5 — `modules/desks`: the read-only repository and service

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-09, FR-10                                                                                                 |
| Files    | `apps/api/src/modules/desks/desks.repository.ts` (create), `apps/api/src/modules/desks/desks.repository.spec.ts` (create), `apps/api/src/modules/desks/desks.service.ts` (create), `apps/api/src/modules/desks/desks.service.spec.ts` (create) |
| Verify   | `npm test -w apps/api -- desks.repository.spec.ts desks.service.spec.ts` — expected: the recorded query is `select('id, desk_number, is_active').order('desk_number')` with **no** `.eq('is_active', …)` anywhere in the call (US-014 edge case — inactive desks stay findable); the service maps a mixed active/inactive fixture to `adminDeskSchema` rows in the same order |

### Step 6 — Wiring: `GET /api/admin/desks`, the extended `GET /bookings`, `composition.ts`

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-11, FR-12                                                                                                 |
| Files    | `apps/api/src/modules/admin/admin.router.ts` (modify — add `GET /desks`; parse the four new fields on `GET /bookings`), `apps/api/src/composition.ts` (modify — wire `desksRepository` → `createDesksService`, thread into `createAdminRouter`, add a `desks?` test seam matching `adminBookings?`) |
| Verify   | Covered by Step 7's route tests, matching every other router in this codebase (no route-level unit test of the bare router) |

### Step 7 — `admin.routes.spec.ts`: every AC, over stubs, through the real mount

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-07, FR-08, FR-09, FR-11                                                                            |
| Files    | `apps/api/src/modules/admin/admin.routes.spec.ts` (modify — extend US-013's suite) |
| Verify   | `npm test -w apps/api -- admin.routes.spec.ts` — expected, one case per: **AC-01** a booking outside `[from,to]` is absent; **AC-02** a past-dated Confirmed booking appears under `?status=completed` and not under `?status=confirmed`; a Cancelled booking appears under `?status=cancelled` regardless of date; **AC-03** only the matching desk's rows are returned; **AC-04** — **date+status, date+desk, status+desk, and all three together**, each against a seed where a single-filter implementation would over-return; **edge case** `?to=<before from>` → `400 invalid_request`; an unknown `?status=` word → `400`; **desks** — `GET /api/admin/desks` returns an inactive desk; an Employee session gets `403 admin_only` on it; no token gets `401` |

### Step 8 — `filters.ts`: the pure functions AC-05, AC-06 and AC-08 rest on

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-13                                                                                                        |
| Files    | `apps/ui/src/screens/all-bookings/filters.ts` (create), `apps/ui/src/screens/all-bookings/filters.spec.ts` (create) |
| Verify   | `npm test -w apps/ui -- filters.spec.ts` — expected: `isFiltered(NO_FILTERS) === false`, `isFiltered` is `true` for each individual field set (US-014/AC-05, AC-06); `parseFilters` round-trips `toQueryString`'s own output; `parseFilters` on a malformed query string (bad date, non-uuid `deskId`, unknown `status` word) returns `NO_FILTERS`, never throws (US-014/AC-08); `parseFilters('?deskId=<uuid>&status=confirmed')` returns exactly those two fields, matching the URL `design-note.md` §2.3 specifies for US-019 |

### Step 9 — Data layer: filters threaded through `use-all-bookings.ts` and `fetch-all-bookings.ts`; the new desks fetch

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-14, FR-15, FR-18                                                                                          |
| Files    | `apps/ui/src/screens/all-bookings/fetch-all-bookings.ts` (modify — `(filters, page, signal)`), `apps/ui/src/screens/all-bookings/use-all-bookings.ts` (modify — `filters` in the effect's dependency array), `apps/ui/src/screens/all-bookings/use-all-bookings.spec.ts` (modify), `apps/ui/src/screens/all-bookings/fetch-desks.ts` (create), `apps/ui/src/screens/all-bookings/use-desks.ts` (create), `apps/ui/src/screens/all-bookings/use-desks.spec.ts` (create) |
| Verify   | `npm test -w apps/ui -- use-all-bookings.spec.ts use-desks.spec.ts` — expected: a filter change resets to page 1 and supersedes an in-flight request for the old filters (US-014/AC-09); a filter change made mid-`loadMore` drops the superseded page (US-014 edge case); the desks hook fetches once on mount and does not re-fetch on a bookings filter change |

### Step 10 — `Select`, `DateField`, `FilterBar`: the controls

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-16, FR-17                                                                                                 |
| Files    | `apps/ui/src/screens/all-bookings/Select.tsx` (create, + `.spec.tsx`), `apps/ui/src/screens/all-bookings/DateField.tsx` (create, + `.spec.tsx` — native `<input type="date">`, no `DatePicker` import), `apps/ui/src/screens/all-bookings/FilterBar.tsx` (create, + `.spec.tsx`), `apps/ui/src/screens/all-bookings/all-bookings.css` (modify — filter-bar densities) |
| Verify   | `npm test -w apps/ui -- FilterBar.spec.tsx` — expected: all four controls render and each change calls back with the updated filter state; **Clear** resets to `NO_FILTERS` (US-014/AC-05); the **Filters** toggle's `aria-expanded` flips on click and the panel's collapsed class tracks it (US-014/AC-10); a CSS assertion on the stylesheet for the collapse boundary; `grep -r DatePicker apps/ui/src/screens/all-bookings/` returns nothing |

### Step 11 — `copy.ts` and `AllBookings.tsx`: wiring it all together

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-19, FR-20                                                                                                 |
| Files    | `apps/ui/src/screens/all-bookings/copy.ts` (modify — filter-aware count line, ST-04 copy), `apps/ui/src/screens/all-bookings/copy.spec.ts` (modify), `apps/ui/src/screens/all-bookings/AllBookings.tsx` (modify — mount `FilterBar`, `parseFilters(location.search)` on mount, ST-04-vs-ST-03 branch on `isFiltered`), `apps/ui/src/screens/all-bookings/AllBookings.spec.tsx` (modify) |
| Verify   | `npm test -w apps/ui -- AllBookings.spec.tsx copy.spec.ts` — expected, one case per: an unfiltered empty result renders US-013's unchanged ST-03 copy (US-014/AC-06); a filtered empty result renders distinct ST-04 copy naming the filter, with a **Clear filters** action (US-014/AC-06); the count line restates every active filter clause (US-014/AC-07); rendered under `MemoryRouter initialEntries={['/admin/bookings?deskId=<uuid>&status=confirmed']}`, the fetcher receives exactly those two filters and the count line reflects them (US-014/AC-08); both existing US-013 tests (ST-02 skeleton, ST-05 error) keep passing unmodified in intent |

### Step 12 — Traceability, manifest, spec-index, README edits

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | (documentation of the above)                                                                                 |
| Files    | `traceability.md` (modify — flip each row to `implemented` with real `file:line`), `knowledge/traceability/manifest.json` (modify — `US-014.tests[]`, `US-014.decisions` → `ADR-004`, `ADR-007`), `inception/specs/index.md` (modify — add the US-014 row), `apps/api/src/modules/desks/README.md` (modify — now holds a read-only repository, per ADR-004), `apps/api/src/modules/bookings/README.md` (modify — the filter paragraph, per `design-note.md` §8) |
| Verify   | `node tools/aidlc-check.mjs` — expected: all checks pass, including check 4 (manifest `tests[]` parses) and check 16 (spec package completeness) |

### Step 13 — Full verification pass

| Field    | Value                                     |
| -------- | ------------------------------------------ |
| Advances | (all)                                       |
| Files    | none (verification only)                    |
| Verify   | `npm run lint`, `npm run typecheck`, `npm test` — expected: all green, pasted into the PR description verbatim. Manual UI check in a real browser at 1280/768/360px |

## Rollback

Revert the PR. No migration to reverse. `admin.router.ts`'s `GET /desks` and its extended `GET /bookings` query parsing are additive; `composition.ts`'s new seam is additive; `listBookingsFromDate` → `listBookings` is a rename with a widened signature, not a breaking one for any other caller (grep confirms `admin-bookings.service.ts` is the method's only caller). No existing route's behaviour depends on anything added here.

## Open questions

None blocking Gate D1. Six of the design note's open items are UX/product calls that do not gate the plan — they set copy, a control choice, and one pixel boundary, all changeable after merge without touching the shape above:

- **Design-note open items 1, 5, 6, 7** — the date control's exact rendering, the 360/768 collapse boundary's pixel value, `Select`'s file placement, and the count line's `to`-clause wording. Steps 10–11 proceed with the Architect's stated recommendation as the default; a UX correction before merge is a copy/CSS change, not a re-plan.
- **Design-note open item 2** — ST-03's copy technically over-claims once filters exist ("Nobody has booked a desk yet" when really "…from today"). Kept unchanged per the design note's own interim recommendation, so this story introduces no behaviour change to US-013's copy.
- **Design-note open item 4** — the desk `Select`'s brief non-interactive window on first load, and its failure copy. Step 10 ships a disabled-with-message state as the default; refinable after merge.
- **Design-note open item 3** — the exact URL US-019 must construct (`?deskId=<id>&status=confirmed`, no `from`) is recorded in `spec.md`'s Out of scope and `filters.spec.ts`'s Step 8 test; it is a note for US-019's future author, not a question for this story.
- **Design-note open item 8** — offset-vs-keyset as a possible future ADR — still the human's, still not this story's.
