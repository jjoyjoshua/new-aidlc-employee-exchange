# US-007 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                    |
| --------- | ---------------------------------------------------------------------- |
| **Story** | `inception/stories/user-stories/US-007-book-an-available-desk.md` |
| **Spec**  | `spec.md`                                                            |
| **Tier**  | Complex                                                              |

## Approval — Gate D1

| Field                | Value                                       |
| -------------------- | -------------------------------------------- |
| Status               | **approved**                                 |
| Approved by          | Joy Joshua <joy_j@trigent.com>               |
| Approved on          | 2026-09-18                                   |
| Plan commit approved | *uncommitted at approval* — base `e4503514366683ecf1d80862bf02574c3465ffa9` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`; if either is
unset, ask them rather than writing `unknown`. `Plan commit approved` is the SHA of the commit holding
this plan **as they read it**, the commit before this stamp. That SHA is what makes the approval
verifiable: a reviewer at D2 runs `git diff <sha> -- <this file>` and sees whether the plan changed
after approval. The name is self-asserted, so it is attribution, not authentication.

**Architect design note: done — `design-note.md` in this folder.** Verdict: proceed, no blockers, no
new ADR. It endorsed D-01 through D-07 on their merits (not merely deferring to this D1 approval) and
raised five `major` findings (F-1–F-5) that are folded into the steps below — a stricter
constraint-violation mapping (Step 2), a real-Postgres test that asserts the raw error, not just the
mapped outcome (Step 3), a fix for a sequencing gap in FR-14/Step 8 where the AC-05 race variant had
no data to render with, a `Cache-Control` header on the now caller-specific availability response
(Step 5), and a required negative test proving one employee's booking never leaks to another (Step 4).
Three `minor`/`nit` findings (F-6, F-8–F-10) are also folded in below. F-11 is a process note, not a
code change: the working tree carries an **unrelated, uncommitted** revision to
`inception/design/screens/SCR-003-book-a-desk.md` (a zone-tabs/desk-tile layout, not part of this
story) that must not ride into this story's PR — leave it out, or commit it separately with its own
message.

## Steps

Ordered. Each step names the files it touches, the `FR-##` it advances, and how it is verified.
Test-first per acceptance criterion: the failing test named `... (US-007/AC-##)` comes before the code
that turns it green.

### Step 1 — Contracts: error codes, booking shapes, `myBooking` (D-02)

| Field    | Value                                                                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-04, FR-05, FR-06                                                                                                                                                                                                                       |
| Files    | `libs/contracts/src/error.ts` (modify — add `desk_already_booked`, `already_booked_that_date`, `desk_not_found`, `desk_inactive`, `booking_not_found`), `libs/contracts/src/error.spec.ts` (modify), `libs/contracts/src/bookings.ts` (create — `bookingCreateSchema` `{date, deskId}.strict()`, `bookingSchema` (response, `confirmationEmail`'s comment states plainly it is the address the confirmation *will* go to, not evidence a mail was sent — US-028 is what dispatches it, design note F-9), `cancelBookingParamsSchema`), `libs/contracts/src/bookings.spec.ts` (create), `libs/contracts/src/availability.ts` (modify — `myBooking: z.object({id, deskId, deskNumber}).nullable()` added to `availabilityResponseSchema`), `libs/contracts/src/availability.spec.ts` (modify), `libs/contracts/src/index.ts` (modify — export `./bookings.js`) |
| Verify   | `npm test --workspace @desk-booking/contracts` — expected: `errorCodeSchema` accepts all five new codes; `bookingCreateSchema` rejects a missing/malformed `date`, a non-uuid `deskId`, and an unknown field, accepts a valid pair; `availabilityResponseSchema` parses a fixture with `myBooking: null` and one with a populated `myBooking`, and an **old** fixture with no `myBooking` key still parses (additive) |

### Step 2 — Repository: the two new reads and the two new writes (D-01, D-04, D-05, ADR-004)

| Field    | Value                                                                                                                                                                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-02, FR-04, FR-05, FR-06                                                                                                                                                                                                                                                        |
| Files    | `apps/api/src/modules/bookings/bookings.repository.ts` (modify — add `getDeskById(id)`, `findMyConfirmedBooking(userId, date)`, `insertConfirmedBooking(userId, deskId, date)` returning a discriminated outcome (`ok` / `desk_conflict` / `user_conflict`) by, **in order**: checking `error.code === '23505'` first, then matching the bare index name (`bookings_one_confirmed_per_desk_per_day` / `bookings_one_confirmed_per_user_per_day`) inside `error.message` via `.includes()` — never the full "duplicate key…" sentence, which is locale-dependent — and **throwing** on any other `error.code` or an unrecognised `23505` message rather than defaulting to a conflict outcome (Architect design note §1.2 — a wrong guess here is worse than a 500), `cancelOwnedBooking(userId, bookingId)` doing `UPDATE ... WHERE id = ? AND user_id = ? AND status = 'confirmed' RETURNING *`), `apps/api/src/modules/bookings/bookings.repository.spec.ts` (modify — recording-fake-client tests for the four new methods, including a case where the fixture error is a non-`23505` code and a case where it's an unrecognised `23505` message, both asserted to throw), `apps/api/src/modules/bookings/bookings.fixtures.ts` (modify — add a Postgres-shaped unique-violation error fixture for each index, one non-`23505` error fixture, one unrecognised-`23505` fixture, an inactive-desk fixture reused from US-006) |
| Verify   | `npm test --workspace @desk-booking/api` — expected: `getDeskById` returns `undefined` for a missing id and the row (including `is_active`) for a real one; `findMyConfirmedBooking` selects only `status = 'confirmed'` rows for the given user/date; `insertConfirmedBooking`'s outcome is `'desk_conflict'` when the fixture error's `code` is `23505` and its message names `bookings_one_confirmed_per_desk_per_day`, `'user_conflict'` for the per-user index, and it **throws** for a non-`23505` error and for a `23505` naming neither index; `cancelOwnedBooking` returns `undefined` (no row) when the id/user/status predicate matches nothing |

### Step 3 — Repository: real-Postgres concurrency proof (D-01, D-04 — testing-standards.md)

| Field    | Value                                                                                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-02                                                                                                                                                                                                                        |
| Files    | `apps/api/src/modules/bookings/bookings.repository.concurrency.spec.ts` (create — runs only against a real Postgres, per the project's existing convention for tests that need one; skipped/gated the same way any prior real-DB test in this repo is gated — confirmed against the codebase, no such test exists yet, so this step also establishes that gate: an env var naming a disposable Supabase/Postgres connection, documented at the top of the file, absent = skipped, not failed) |
| Verify   | Against the gated database: two concurrent `insertConfirmedBooking` calls for the same desk+date, different users — exactly one returns `'ok'`, the other `'desk_conflict'`. Two concurrent calls for the same user+date, different desks — exactly one `'ok'`, the other `'user_conflict'` (also named `... (US-007/AC-09)` — this index, not the UI's busy state, is what actually guarantees "exactly one booking exists," per Architect design note §8 F-7). **Each case also asserts the raw rejected error directly** — `error.code === '23505'` and `error.message` contains the expected index name — not only the mapped outcome, so a future supabase-js/Postgres change that alters the error shape fails here with a clear cause instead of "expected ok, got desk_conflict" (design note §1.3, F-2) |

### Step 4 — Service: `createBooking`, `cancelBooking`, `getAvailability`'s `myBooking` (D-02, D-05, NFR-02)

| Field    | Value                                                                                                                                                                                                                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-03, FR-04, FR-05, FR-06                                                                                                                                                                                                                                                                                                       |
| Files    | `apps/api/src/modules/bookings/bookings.service.ts` (modify — `getAvailability(date, userId)` also calls `findMyConfirmedBooking` and projects `myBooking`; new `createBooking(userId, {date, deskId})`: `refusalFor` guard (FR-03) → `getDeskById` exists/active guard (FR-04) → `insertConfirmedBooking`, mapping its outcome to a typed result (`ok` / `date_refused` / `desk_not_found` / `desk_inactive` / `desk_conflict` / `user_conflict`); new `cancelBooking(userId, bookingId)` → `cancelOwnedBooking`, mapping `undefined` to `not_found`), `apps/api/src/modules/bookings/bookings.service.spec.ts` (modify) |
| Verify   | `npm test --workspace @desk-booking/api` — expected, named `... (US-007/AC-11)`: a weekend/out-of-window date short-circuits to `date_refused` without calling the repository's desk or insert methods. Named `... (US-007/AC-12)`: a missing desk yields `desk_not_found`, an inactive desk yields `desk_inactive`, neither calls `insertConfirmedBooking`. Named `... (US-007/AC-06)`: `getAvailability` returns the caller's own confirmed booking as `myBooking` and `null` when they have none, **and — a required negative case, Architect design note §2.2/F-5 — a confirmed booking belonging to a *different* user on the same date yields `myBooking: null` for the caller, with that desk still projected as `taken` in `desks[]` and no occupant field anywhere in the response** (re-asserting US-006/AC-06's non-disclosure guarantee in the same file this story loosens it) |

### Step 5 — Router: `POST /`, `POST /:id/cancel`, `GET /availability` threads `req.user.id` (design pattern: `auth.router.ts`'s `set-password`)

| Field    | Value                                                                                                                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01–FR-06                                                                                                                                                                                                                                                                                                        |
| Files    | `apps/api/src/modules/bookings/bookings.router.ts` (modify — `GET /availability` reads `req.user` with the guarded-access shape `require-admin.ts:22-29` already uses, refusing rather than asserting `req.user!.id` (design note F-10), passes the id to the service, and sets `Cache-Control: private, no-store` on the response with a comment naming `myBooking` as the reason the body is now caller-specific (design note §2.3, F-4); add `router.post('/', ...)` validating `bookingCreateSchema`, delegating to `createBooking`, mapping `date_refused→422 date_not_bookable`, `desk_not_found→404`, `desk_inactive→422`, `desk_conflict→409 desk_already_booked`, `user_conflict→409 already_booked_that_date`, `ok→201`; add `router.post('/:id/cancel', ...)` validating `cancelBookingParamsSchema`, mapping `not_found→404 booking_not_found`, `ok→200`), `apps/api/src/modules/bookings/bookings.routes.spec.ts` (modify — supertest over the real `createApp`, plus a case asserting the availability response's `Cache-Control` header, and a **non-gated** case: two sequential `POST /` for the same user/date — `201` then `409 already_booked_that_date` — named `... (US-007/AC-09)` alongside Step 3's real-Postgres case, design note F-7) |
| Verify   | `npm test --workspace @desk-booking/api` — expected, named per-AC: `... (US-007/AC-03)` a valid request returns `201` with the booking and `confirmationEmail` equal to the authenticated user's email; `... (US-007/AC-11)` a weekend/past/beyond-window date returns `422 date_not_bookable` even when posted directly, bypassing any client control; `... (US-007/AC-12)` an inactive desk id returns `422 desk_inactive`; `... (US-007/AC-07)` cancelling the caller's own confirmed booking returns `200` and a second cancel of the same id returns `404 booking_not_found`; `401`/`403` cases matching the existing `requireSession` conventions |

### Step 6 — UI: selection and the confirm action (`desk-row`, `confirm-booking-bar`)

| Field    | Value                                                                                                                                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-07, FR-08, FR-09, FR-15                                                                                                                                                                                                                                                            |
| Files    | `apps/ui/src/components/desk-row/DeskRow.tsx` (modify — `selected?: boolean`, `onSelect?: () => void`, only for `status: 'available'` rows; **purely presentational — the single-selection invariant itself lives in `BookADesk.tsx`/`use-book-desk.ts`, not here**, so a later swap to a different desk-list component doesn't strand the rule (design note §7, F-8)), `apps/ui/src/components/desk-row/DeskRow.spec.tsx` (modify), `apps/ui/src/components/confirm-booking-bar/` (create — `ConfirmBookingBar.tsx`, `.spec.tsx`, `confirm-booking-bar.css`; bottom-anchored above the bottom bar below 768px per the story's UI commitments, `busy` prop keeps the label and disables interaction) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-007/AC-01)`: selecting a desk row marks it `Selected` (icon + word) and the confirm action's accessible label reads `"Book A-02 for Wed 9 Sep"` from fixture desk/date values. Named `... (US-007/AC-02)`: selecting a second desk deselects the first; only one row is ever `Selected`. Named `... (US-007/AC-09)`: `busy` keeps the label, disables the button, and a second click while `busy` fires no additional `onConfirm` call |

### Step 7 — UI: a shared confirm dialog, and the existing-booking state that uses it (D-06)

| Field    | Value                                                                                                                                                                                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-11, FR-12                                                                                                                                                                                                                                                                     |
| Files    | `apps/ui/src/components/confirm-dialog/` (create — `ConfirmDialog.tsx`, `.spec.tsx`, `confirm-dialog.css`; generic title/body/confirm/cancel props, Escape-to-dismiss, the solid danger fill added 2026-09-08 for the confirm action, per SCR-002 ST-07's design commitments — no `bookings`-specific text lives here, so US-011 can reuse it unchanged), `apps/ui/src/components/existing-booking-state/` (create — `ExistingBookingState.tsx`, `.spec.tsx`; renders the desk/date already held, opens `ConfirmDialog` naming that desk and date) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-007/AC-06)`: given `myBooking` non-null, the desk list never renders and no confirm action is present. Named `... (US-007/AC-07)`: confirming `ConfirmDialog` calls the cancel endpoint for that booking id, and **both on success and on a `404 booking_not_found` response** (already-cancelled — e.g. a second confirm) the caller's availability-refetch callback fires and no failure is shown (design note §3.4, F-6 — a 404 here means the booking is already gone, which is what was asked for); Escape dismisses without cancelling |

### Step 8 — `BookADesk` integration: wiring, the two 409 branches, the generic-failure branch, focus management

| Field    | Value                                                                                                                                                                                                                                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-09, FR-10, FR-13, FR-14, FR-16, NFR-03                                                                                                                                                                                                                                                                                                                        |
| Files    | `apps/ui/src/screens/book-a-desk/BookADesk.tsx` (modify — selection state, wires `ConfirmBookingBar`/`ExistingBookingState`, handles `POST /api/bookings` outcomes per FR-13/FR-14/FR-16, navigates to My bookings on success (FR-10), clears selection on date change (FR-09)), `apps/ui/src/screens/book-a-desk/BookADesk.spec.tsx` (modify), `apps/ui/src/screens/book-a-desk/use-book-desk.ts` (create — the request hook analogous to `use-availability.ts`, owns the in-flight/busy state for FR-15's de-dup at the data layer, not just the button's disabled prop), `apps/ui/src/screens/book-a-desk/use-book-desk.spec.ts` (create) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-007/AC-08)`: a `409 desk_already_booked` response shows the taken-desk alert, triggers an availability refetch, clears the selection, disables confirm, and moves focus to the alert. Named `... (US-007/AC-05)`: a `409 already_booked_that_date` response on confirm **triggers an availability refetch for the same date** (the 409 body carries no desk/booking data, per `api-standards.md`'s error shape — design note §4, F-3), then renders the existing-booking state from the refetched `myBooking`, with focus moved to the explanation only after that refetch resolves; if the refetch's `myBooking` is `null` (the conflicting booking was itself cancelled meanwhile), falls back to the ordinary desk list instead of an empty existing-booking state. Named `... (US-007/AC-10)`: any other failure shows the generic failure state with **Check my bookings** primary and **Try again** secondary, keeps the selection, and the region announces assertively. Named `... (US-007/AC-03)`/`(AC-04)`: success navigates to My bookings and the destination's message names the desk, the date, and `confirmationEmail` verbatim from the response — no client-side reconstruction of the email address. **Also named `... (US-007/AC-01)`/`(AC-02)` at this screen level** (design note §7, F-8): selecting a desk enables the confirm action with the correct label, and selecting a second desk moves the selection — kept here in addition to `DeskRow.spec.tsx`'s component-level cases so the assertion survives if the desk-list component is later replaced |

### Step 9 — My bookings: render the carried confirmation message

| Field    | Value                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-10                                                                                                                                                                          |
| Files    | `apps/ui/src/screens/my-bookings/MyBookings.tsx` (modify — reads a navigation-state/transient message and renders it as a dismiss-free banner, not a modal), `apps/ui/src/screens/my-bookings/MyBookings.spec.tsx` (modify) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-007/AC-03)`: the new booking appears in the Upcoming group. Named `... (US-007/AC-04)`: the banner text matches `"{deskNumber} booked for {date}. Confirmation emailed to {email}."` and requires no dismiss action to disappear on its own re-render (i.e., it is not blocking) |

### Step 10 — Evidence, docs and manifest

| Field    | Value                                                                                                                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | (documentation and evidence — no FR of its own)                                                                                                                                                                      |
| Files    | Screenshots of ST-07/ST-08/ST-09/ST-10/ST-11/ST-12 at 360/768/1280 pasted into the PR, `apps/api/src/modules/bookings/README.md` (modify — states US-007 exercised the write side and both indexes, names the cancel endpoint's deliberately narrow scope per D-03), `inception/specs/index.md` (modify — US-007 row → `implemented`), `knowledge/traceability/manifest.json` (modify — US-007 `tests[]`), `traceability.md` in this package (modify — fill in as each step lands) |
| Verify   | `node tools/aidlc-check.mjs` — no new findings for US-007                                                                                                                                                             |

### Step 11 — Full suite

| Field    | Value                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | (all of the above)                                                                                                                                |
| Files    | none                                                                                                                                              |
| Verify   | `npm run lint && npm run typecheck && npm test && node tools/aidlc-check.mjs` — all green, and the check reports US-007 with every AC cited by a test. Step 3's concurrency spec run separately against a real database and pasted into the PR, since it is expected to be skipped in the default CI run without that database configured |

## Rollback

No migration lands in this story — `0002_desks.sql`/`0003_bookings.sql` already exist from US-006.
Reverting the PR removes the two new routes, the repository's write methods, and the additive
`myBooking` field; any `bookings` rows created in production before a revert remain, which is correct
— a booking that genuinely happened should not vanish because the feature that created it was rolled
back. The five new error codes are purely additive to `errorCodeSchema`'s loosely-parsed enum (ADR-002)
and safe to leave defined even if unreachable after a revert.

## Open questions

| Question | Owner | Blocks |
| -------- | ----- | ------ |

None. The AC-07 scope question (minimal cancel endpoint vs. full US-011 semantics vs. deferral) was
asked and answered before this plan was written (D-03). The confirm-dialog component question (build
new vs. reuse an existing one) is answered by D-06: no dialog primitive exists in the codebase yet
(verified — `apps/ui/src/components/` has no `dialog`/`modal` directory), so this story builds the
shared one.
