# US-015 — implementation plan

> **The Gate D1 artifact.** The human reads this file, `spec.md`, and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                                |
| --------- | ------------------------------------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-015-cancel-a-booking-on-behalf.md`          |
| **Spec**  | `spec.md`                                                                       |
| **Tier**  | Complex — a new write route, `POST /api/admin/bookings/:id/cancel` (`ai/standards/task-surfaces.md:39`); see `impact-analysis.md` |

## Approval — Gate D1

| Field                | Value                                                                     |
| -------------------- | -------------------------------------------------------------------------- |
| Status               | **approved**                                                                |
| Approved by          | Joy Joshua <joy_j@trigent.com>                                             |
| Approved on          | 2026-09-19                                                                  |
| Plan commit approved | *uncommitted at approval* — base `f57aecd357a8eb585be4ebf444e08db98487a024` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**, the commit before this stamp. The name is self-asserted, so it is attribution, not authentication.

## Steps

Ordered. Each step names the files it touches, the `FR-##` it advances (`spec.md`), and how it is verified. Test-first per acceptance criterion: the failing test named `... (US-015/AC-##)` comes before the code that turns it green.

### Step 1 — `admin-bookings.repository.ts`: the write and its disambiguating read

| Field    | Value |
| -------- | ----- |
| Advances | FR-02, FR-03, NFR-02 |
| Files    | `apps/api/src/modules/bookings/admin-bookings.repository.ts` (modify — add `cancelAnyBooking`, `findBookingState`; amend the docblock's "one cross-employee read" claim), `apps/api/src/modules/bookings/admin-bookings.repository.spec.ts` (modify — recording fake gains `update`/`maybeSingle`) |
| Verify   | `npm test -w apps/api -- admin-bookings.repository.spec.ts` — expected: `cancelAnyBooking`'s recorded call carries `eq('id', bookingId)`, `eq('status','confirmed')`, `gte('booking_date', today)`, and an update payload of exactly `{status:'cancelled', cancelled_at, cancelled_by:adminId, cancellation_source:'admin'}` (US-015/AC-02, AC-05, AC-06) — with **no** `eq('user_id', …)` anywhere in the call; `findBookingState`'s recorded `.select()` is `status, booking_date` and nothing wider |

### Step 2 — `admin-bookings.service.ts`: write first, classify second

| Field    | Value |
| -------- | ----- |
| Advances | FR-04 |
| Files    | `apps/api/src/modules/bookings/admin-bookings.service.ts` (modify — add `cancelAnyBooking`, `CancelAnyBookingOutcome`), `apps/api/src/modules/bookings/admin-bookings.service.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- admin-bookings.service.spec.ts` — expected: a successful write returns `{kind:'ok'}` after **exactly one** repository write and **zero** calls to `findBookingState` (US-015/AC-04, AC-07); a write returning `undefined` followed by `findBookingState` returning `status:'cancelled'` yields `{kind:'already_cancelled'}` (US-015/AC-09) — the classification read is asserted to run **only after** the write misses, never before |

### Step 3 — `admin.router.ts`: the route

| Field    | Value |
| -------- | ----- |
| Advances | FR-01, FR-05 |
| Files    | `apps/api/src/modules/admin/admin.router.ts` (modify — add `POST /bookings/:id/cancel`; amend the "no `requireUser`" docblock claim to distinguish attribution from authorization), `apps/api/src/modules/admin/admin.routes.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- admin.routes.spec.ts` — expected, one case per: a Confirmed today-or-future booking → `200` empty body, and the stored row now has `status:'cancelled'`, `cancellation_source:'admin'`, `cancelled_by` = the acting admin's session id, not any request-supplied value (US-015/AC-02, AC-04, AC-05, AC-06); a past-dated Confirmed booking's id → **`404 booking_not_found`** (US-015/AC-02); an already-cancelled booking's id → **`409 booking_already_cancelled`** (US-015/AC-09); a malformed id → `400 invalid_request`; an Employee session → `403 admin_only`; no token → `401` |

### Step 4 — Gated real-Postgres harness: the two races no unit test can prove

| Field    | Value |
| -------- | ----- |
| Advances | NFR-01 |
| Files    | `apps/api/src/modules/bookings/bookings.repository.concurrency.spec.ts` (modify — two new gated cases) |
| Verify   | `RUN_BOOKINGS_CONCURRENCY_TEST=1 npm test -w apps/api -- bookings.repository.concurrency.spec.ts` — expected: (a) `cancelOwnedBooking(owner,…)` and `cancelAnyBooking(bookingId, admin,…)` run concurrently on the same seeded row via `Promise.all` — exactly one returns a row, the other `undefined`, and the stored `cancellation_source` matches the winner; (b) two concurrent `cancelAnyBooking` calls on the same row — exactly one row updated, one `cancelled_at`, a database-side count of `1`. **Paste the real run's output in the PR** — this test is skipped, not failed, without the flag, so a green default suite does not prove this step |

### Step 5 — Documentation this story's own reasoning requires

| Field    | Value |
| -------- | ----- |
| Advances | (design-note §7's three consequential edits) |
| Files    | `ai/standards/api-standards.md` §Errors (modify — the disclosure rule, per `decisions.md` D-09), `apps/api/src/modules/bookings/README.md` (modify — now writes `bookings` from a second object; the missing `user_id` predicate is REQ-014, not an oversight; the three forward constraints for US-029/US-032; fix the stale `listBookingsFromDate` name) |
| Verify   | Read review only — no test exercises documentation. `node tools/aidlc-check.mjs` still passes (no check parses these files' prose) |

### Step 6 — `copy.ts`: the ST-07–ST-11 strings

| Field    | Value |
| -------- | ----- |
| Advances | FR-12 |
| Files    | `apps/ui/src/screens/all-bookings/copy.ts` (modify), `apps/ui/src/screens/all-bookings/copy.spec.ts` (modify) |
| Verify   | `npm test -w apps/ui -- copy.spec.ts` — expected: dialog title/body/toast build from a full employee name and the desk/date, matching the approved Figma copy exactly ("Cancel this booking", "Keep it", "Try again", "Close", the two failure/already-cancelled messages) (US-015/AC-03, AC-05, AC-06, AC-08, AC-09) |

### Step 7 — `lib/cancel-booking.ts`: the admin fetcher

| Field    | Value |
| -------- | ----- |
| Advances | FR-08 |
| Files    | `apps/ui/src/lib/cancel-booking.ts` (modify — add `createAdminCancelBooking`, extract `mapCancelResult`; `createCancelBooking`'s signature unchanged), `apps/ui/src/lib/cancel-booking.spec.ts` (modify) |
| Verify   | `npm test -w apps/ui -- cancel-booking.spec.ts` — expected: `createAdminCancelBooking` posts to `/api/admin/bookings/:id/cancel`; both fetchers map `booking_already_cancelled`/`booking_not_found`/a transport failure to the same outcome shape via the shared mapping function; `createCancelBooking`'s existing test cases are unaffected |

### Step 8 — `use-admin-cancel-dialog.ts`: the client-side single-flight guard

| Field    | Value |
| -------- | ----- |
| Advances | FR-07 |
| Files    | `apps/ui/src/screens/all-bookings/use-admin-cancel-dialog.ts` (create), `apps/ui/src/screens/all-bookings/use-admin-cancel-dialog.spec.ts` (create) |
| Verify   | `npm test -w apps/ui -- use-admin-cancel-dialog.spec.ts` — expected: two `confirm()` calls issued in the same tick result in **exactly one** fetch, the second refused before any state read (US-015/AC-07); a `failed` outcome leaves `busy:false`, `outcome:'retryable'`, and calls neither `onCancelled` nor `onAlreadyCancelled` (US-015/AC-08); an `already_cancelled` outcome calls `onAlreadyCancelled`, never a refresh/refetch callback (US-015/AC-09) |

### Step 9 — `use-all-bookings.ts`: update in place, never refetch

| Field    | Value |
| -------- | ----- |
| Advances | FR-06 |
| Files    | `apps/ui/src/screens/all-bookings/use-all-bookings.ts` (modify — add `markCancelled`), `apps/ui/src/screens/all-bookings/use-all-bookings.spec.ts` (modify) |
| Verify   | `npm test -w apps/ui -- use-all-bookings.spec.ts` — expected: `markCancelled(id)` flips exactly one item's `status` to `'cancelled'`, leaves `total` and every other item untouched, and does not call the fetcher again (US-015/AC-04, AC-09) |

### Step 10 — `AdminBookingRow.tsx` / `AdminSkeletonRow.tsx`: the fifth field

| Field    | Value |
| -------- | ----- |
| Advances | FR-09, FR-10, FR-13 |
| Files    | `apps/ui/src/screens/all-bookings/AdminBookingRow.tsx` (modify — Cancel button when `confirmed`, em dash + reason otherwise, in both layouts; `AdminBookingsTableHead` gains a fifth `<th>`), `apps/ui/src/screens/all-bookings/AdminBookingRow.spec.tsx` (modify), `apps/ui/src/screens/all-bookings/AdminSkeletonRow.tsx` (modify — `colSpan` 4→5; 360px height 160→188), `apps/ui/src/screens/all-bookings/all-bookings.css` (modify — action column, `.all-bookings__visually-hidden`, the height change) |
| Verify   | `npm test -w apps/ui -- AdminBookingRow.spec.tsx` — expected: a `confirmed` item renders a **Cancel** `Button variant="secondary"` in both the table and card layouts (US-015/AC-01); a `completed` item renders an em dash and the reason "Past bookings can't be cancelled"; a `cancelled` item renders an em dash and "Already cancelled" (US-015/AC-02); cancellability never reads a date field, only `item.status` |

### Step 11 — `AllBookings.tsx`: wiring it all together

| Field    | Value |
| -------- | ----- |
| Advances | FR-11, FR-14, FR-15 |
| Files    | `apps/ui/src/screens/all-bookings/AllBookings.tsx` (modify — mount the dialog via `useAdminCancelDialog`, the cancelled toast, the `justCancelledId` focus-return), `apps/ui/src/screens/all-bookings/AllBookings.spec.tsx` (modify — extend, never replace, the existing `US-013/AC-11` header-order assertion) |
| Verify   | `npm test -w apps/ui -- AllBookings.spec.tsx` — expected, one case per: opening the dialog on a row shows a title/body naming **that row's** employee, desk and date (US-015/AC-03); a successful cancel **with `status=confirmed` active in filter state** leaves the row present and reading Cancelled — no refetch, no page loss (US-015/AC-04); the busy state disables both dialog actions and shows a spinner (US-015/AC-07); a failure keeps the dialog open with an `Alert tone="danger"` and a **Try again** label, and the row still reads Confirmed (US-015/AC-08); an `already_cancelled` response shows the single-action **Close** dialog and updates the row without a second fetch (US-015/AC-09); after a successful cancel, focus lands on the row, not `<body>` (design-note §5.6); `queryAllByRole('checkbox')` is empty and the number of Cancel controls equals the number of cancellable rows, in both layouts (US-015/AC-10) |

### Step 12 — Traceability, manifest, spec-index

| Field    | Value |
| -------- | ----- |
| Advances | (documentation of the above) |
| Files    | `traceability.md` (modify — flip each row to `implemented` with real `file:line`), `knowledge/traceability/manifest.json` (modify — `US-015.tests[]`, `US-015.decisions` → `ADR-004`, `ADR-007`), `inception/specs/index.md` (modify — add the US-015 row) |
| Verify   | `node tools/aidlc-check.mjs` — expected: all checks pass, including check 4 (manifest `tests[]` parses) and check 16 (spec package completeness) |

### Step 13 — Full verification pass

| Field    | Value |
| -------- | ----- |
| Advances | (all) |
| Files    | none (verification only) |
| Verify   | `npm run lint`, `npm run typecheck`, `npm test` — expected: all green, pasted into the PR description verbatim. Manual check of ST-07–ST-11 in a real browser (or the Claude browser pane) at 1280/768/360px against the Figma frames |

## Rollback

Revert the PR. No migration to reverse — every column this story writes already existed. The new route (`POST /api/admin/bookings/:id/cancel`) and the two new repository/service methods are additive; no existing route, method, or component signature changes, so reverting removes exactly what this story added and nothing else. The one operational note: any booking cancelled via this endpoint before a revert stays cancelled — a revert is a code rollback, not a data rollback, exactly as US-011's own rollback note states for the employee side.

## Open questions

None blocking Gate D1. All seven of the design note's open items were either resolved directly with the human (items 1, 2, 6 — `decisions.md` D-07, D-08, D-09) or adopted as DEV defaults per the Architect's stated recommendation, cheap to revise after merge (items 3, 4, 7 — `decisions.md` D-04, D-05, D-06). Item 5 (the three forward constraints for US-029/US-032) is recorded, not decided — it binds those future stories, not this one.
