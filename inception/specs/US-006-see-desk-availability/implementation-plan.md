# US-006 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                  |
| --------- | ------------------------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-006-see-desk-availability.md` |
| **Spec**  | `spec.md`                                                          |
| **Tier**  | Complex                                                            |

## Approval — Gate D1

| Field                | Value                                       |
| -------------------- | -------------------------------------------- |
| Status               | **approved**                                 |
| Approved by          | Joy Joshua <joy_j@trigent.com>               |
| Approved on          | 2026-09-18                                   |
| Plan commit approved | *uncommitted at approval* — base `411198d`   |

`Approved by` is the human's name and email from `git config user.name` / `user.email`; if either is unset, ask them rather than writing `unknown`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**, the commit before this stamp. That SHA is what makes the approval verifiable: a reviewer at D2 runs `git diff <sha> -- <this file>` and sees whether the plan changed after approval. The name is self-asserted, so it is attribution, not authentication.

## Steps

Ordered. Each step names the files it touches, the `FR-##` it advances, and how it is verified. Test-first per acceptance criterion: the failing test named `... (US-006/AC-##)` comes before the code that turns it green.

### Step 1 — Schema: `desks` and `bookings`, whole (D-03, design note §1)

| Field    | Value                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Advances | FR-01, FR-02, FR-03                                                                                                                                                             |
| Files    | `supabase/migrations/0002_desks.sql` (create), `supabase/migrations/0003_bookings.sql` (create), `supabase/migrations/README.md` (modify — the two new files, and the corrected index-comment mapping per design note §1.5) |
| Verify   | `supabase db push` against the linked dev project applies both migrations cleanly; manually confirm in the SQL editor: `insert into desks (desk_number) values ('A-01')` succeeds, `values ('a-01')` and `values ('A-1')` are rejected by `desks_desk_number_format`; `insert into bookings (...)` for a Saturday date is rejected by `bookings_weekday_only` |

### Step 2 — Dev seed (D-07, design note §5)

| Field    | Value                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| Advances | (enables local development and manual verification of every later step — no FR of its own)                       |
| Files    | `supabase/seed/desks.dev.sql` (create) — 40 active desks over zones A/B/C, one inactive desk (`C-14`), per the QA dataset in the story's QA notes |
| Verify   | Run by hand against the linked dev project (SQL editor or `psql`); confirm `select count(*) from desks where is_active` returns 40, and `C-14` reads `is_active = false`. Re-run once more to confirm the `on conflict do nothing` makes it idempotent |

### Step 3 — Close the `officeDateSchema` hole (D-02, design note §2.2)

| Field    | Value                                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-05                                                                                                                                                                   |
| Files    | `libs/contracts/src/booking-window.ts` (modify — `officeDateSchema` gains `isRealCalendarDate`/`.refine`), `libs/contracts/src/booking-window.spec.ts` (modify)         |
| Verify   | `npm test --workspace @desk-booking/contracts` — expected: `officeDateSchema` rejects `2026-02-30`, `2026-13-01`, `2026-00-10`, `2026-02-00`, and accepts `2026-02-28` and `2028-02-29` (leap year); `auth.spec.ts`'s existing fixtures for `officeSchema.today` still parse unchanged |

### Step 4 — The availability contract (`libs/contracts`)

| Field    | Value                                                                                                                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01                                                                                                                                                                                                     |
| Files    | `libs/contracts/src/availability.ts` (create — `availabilityQuerySchema`, `deskAvailabilityStatusSchema`, `deskAvailabilitySchema`, `availabilityResponseSchema`), `libs/contracts/src/availability.spec.ts` (create), `libs/contracts/src/error.ts` (modify — add `'date_not_bookable'` to `errorCodeSchema`), `libs/contracts/src/error.spec.ts` (modify), `libs/contracts/src/index.ts` (modify — export `./availability.js`) |
| Verify   | `npm test --workspace @desk-booking/contracts` — expected: `availabilityQuerySchema` rejects a missing/repeated/unknown-field query and accepts one valid `date`; `availabilityResponseSchema` parses a fixture with `available`/`taken` desks and rejects a third `status` value; `errorCodeSchema` accepts `'date_not_bookable'` |

### Step 5 — Repository: two reads, no rule (D-04, ADR-004, design note §2.8, §6 option B)

| Field    | Value                                                                                                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-02, FR-03, FR-04                                                                                                                                                                                                 |
| Files    | `apps/api/src/modules/bookings/bookings.repository.ts` (create — `listActiveDesks()`, `listConfirmedDeskIds(date)`), `apps/api/src/modules/bookings/bookings.repository.spec.ts` (create — over a recording fake client), `apps/api/src/modules/bookings/bookings.fixtures.ts` (create — 40-desk / one-inactive / partial-day / empty-office fixtures shared with US-007/US-009) |
| Verify   | `npm test --workspace @desk-booking/api` — expected, named `... (US-006/AC-04)`: the recorded `desks` query chain carries `.eq('is_active', true)` and `.order('desk_number')`, and its select list is exactly `id, desk_number`. Named `... (US-006/AC-06)`: the recorded `bookings` query's select list is exactly `desk_id` — no `user_id`, no `*` — and carries `.eq('booking_date', <date>)` and `.eq('status', 'confirmed')` |

### Step 6 — Service: the projection and the date guard (design note §2.6, §3.1)

| Field    | Value                                                                                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-02, FR-05                                                                                                                                                                                                                    |
| Files    | `apps/api/src/modules/bookings/bookings.service.ts` (create — `createBookingsService({ availability, nowMs, officeTimezone })`, re-uses `refusalFor`/`officeToday`), `apps/api/src/modules/bookings/bookings.service.spec.ts` (create) |
| Verify   | `npm test --workspace @desk-booking/api` — expected, named `... (US-006/AC-03)`: given active desks and a set of taken ids, the response marks exactly those ids `taken` and every other active desk `available`, omitting none. Named `... (defence)`: a weekend or out-of-window date yields the `date_not_bookable` refusal reason from `refusalFor` — reusing US-005's boundary literals, not re-deriving them |

### Step 7 — Router and wiring (design note §2.1, §2.7)

| Field    | Value                                                                                                                                                                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-05                                                                                                                                                                                                                                                |
| Files    | `apps/api/src/modules/bookings/bookings.router.ts` (create — validates the query, delegates to the service, maps `date_not_bookable` to `422` and everything else per the error table), `apps/api/src/http/app.ts` (modify — `AppDeps` gains `bookingsRouter`, mounted at `/api/bookings` behind `requireSession` on the line-79 placeholder), `apps/api/src/composition.ts` (modify — `BuildAppOptions` gains `availability?: AvailabilityRepository`, wires `createBookingsService`/`createBookingsRouter`), `apps/api/src/modules/bookings/bookings.routes.spec.ts` (create — supertest over the real `createApp`) |
| Verify   | `npm test --workspace @desk-booking/api` — expected, named `... (US-006/AC-03)`: a date with one confirmed booking returns that desk `taken`, array length unchanged from the free-day case. Named `... (US-006/AC-06)`: `Object.keys(desk)` for a taken desk is exactly `['id','deskNumber','status']`, and the serialized body contains no occupant name/id/email anywhere. Named `... (US-006/AC-04)` **(marked as a pass-through check, not AC-04's proof — design note §6)**: a stubbed inactive desk is absent from the body. Named `... (defence)`: `400` for missing/malformed/repeated `date` and an unknown query param; `422 date_not_bookable` for a weekend, `today-1`, `today+31`; `401` with no bearer; `403` with `must_change_password` set |

### Step 8 — `use-availability.ts`: the third state and the request-id guard (design note §4.1 — the story's most likely defect)

| Field    | Value                                                                                                                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-11, FR-12                                                                                                                                                                                                                                |
| Files    | `apps/ui/src/screens/book-a-desk/use-availability.ts` (modify — `AvailabilityFetcher` returns `AvailabilityOutcome`, `AvailabilityState` gains `error`, adds a `retry()` attempt counter), `apps/ui/src/screens/book-a-desk/use-availability.spec.ts` (modify), `apps/ui/src/screens/book-a-desk/fetch-availability.ts` (create — the `ApiResult<AvailabilityResponse>` → `AvailabilityOutcome` adapter, `.spec.ts` alongside) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-006/AC-08)`: a failed outcome for the *current* request yields `status:'error'`; issuing a request for date A, changing to date B, then resolving **A's failure last** leaves `status:'ready'` with B's data and never enters `error` — the AC-08 race with the arms swapped from US-005. Also: `retry()` re-issues a request for the same date |

### Step 9 — Zones and copy (design note §4.2, §4.5)

| Field    | Value                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-06, FR-10                                                                                                                                       |
| Files    | `apps/ui/src/screens/book-a-desk/zones.ts` (create — `groupByZone`), `apps/ui/src/screens/book-a-desk/zones.spec.ts` (create), `apps/ui/src/screens/book-a-desk/copy.ts` (create — `NO_DESKS_EXIST`, `AVAILABILITY_LOAD_FAILED`), `apps/ui/src/screens/book-a-desk/copy.spec.ts` (create) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-006/AC-05)`: a **shuffled** array across zones A/B/C groups and orders correctly, including `A-02` before `A-10` written as literal expected output (never computed by calling the function under test). Named `... (US-006/AC-09)`: `NO_DESKS_EXIST`'s text does not contain the word "taken" |

### Step 10 — `formatOfficeDateLong` (design note §4.3)

| Field    | Value                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| Advances | FR-13                                                                                                          |
| Files    | `apps/ui/src/lib/format-office-date.ts` (modify — add `formatOfficeDateLong`), `apps/ui/src/lib/format-office-date.spec.ts` (modify) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected: `formatOfficeDateLong('2026-09-09')` renders "Wednesday 9 September", `timeZone: 'UTC'` as every other formatter in the file, immune to the test runner's local `TZ` (same trap US-005's D-03 closed) |

### Step 11 — Presentational components: `skeleton-row`, `status-chip`, `desk-row` (design note §4.3, §4.4)

| Field    | Value                                                                                                                                                                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-08, FR-09                                                                                                                                                                                                                                            |
| Files    | `apps/ui/src/components/status-chip/` (`StatusChip.tsx`, `.spec.tsx`, `status-chip.css` — create), `apps/ui/src/components/desk-row/` (`DeskRow.tsx`, `.spec.tsx`, `desk-row.css` — create, **presentational only**, cites the `HF / SCR-003` frame's node id), `apps/ui/src/components/skeleton-row/` (`SkeletonRow.tsx`, `.spec.tsx`, `skeleton-row.css` — create, shares `--desk-row-height` with `desk-row`) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-006/AC-02)`: `status-chip` renders the **text** "Available"/"Taken" plus an icon element (asserted as text/element presence, not a class or colour — NFR-008); `desk-row` renders the desk number. Assert both `desk-row` and `skeleton-row` read the same `--desk-row-height` custom property |

### Step 12 — `zone-group`, `availability-count`, `empty-state` (design note §4.3, §4.4)

| Field    | Value                                                                                                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-06, FR-07, FR-09, FR-10, FR-13                                                                                                                                                                                                                              |
| Files    | `apps/ui/src/components/zone-group/` (create), `apps/ui/src/components/availability-count/` (create — the persistent `role="status"` live region, visually-hidden long-form text per `PolicyChecklist`'s precedent), `apps/ui/src/components/empty-state/` (create — ST-05 only, props mirroring `Alert`'s, no `actions`) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-006/AC-01)`: `availability-count` renders exactly "12 of 40 desks free · Wed 9 Sep" from a 40-desk/12-available fixture. Named `... (US-006/AC-10)`: one `role="status"` element present in both loading and ready states (same node), loading text is a single sentence, skeleton rows are `aria-hidden`, announced text is the long form. Named `... (US-006/AC-05)`: `zone-group` heading reads "Zone A" |

### Step 13 — `BookADesk` integration: the list, the states, retry (design note §2.6, §4.1, §4.6)

| Field    | Value                                                                                                                                                                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-06, FR-07, FR-09, FR-10, FR-11, FR-12                                                                                                                                                                                                                                              |
| Files    | `apps/ui/src/screens/book-a-desk/BookADesk.tsx` (modify — renders `availability-count` + `zone-group`s below the date controls; wires the real `fetchAvailability` via `fetch-availability.ts`; the `desks.length === 0` branch checked **first**, before any later fully-booked branch), `apps/ui/src/screens/book-a-desk/book-a-desk.css` (modify — defines `--desk-row-height`), `apps/ui/src/screens/book-a-desk/BookADesk.spec.tsx` (modify) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-006/AC-01)`: the count line precedes the first zone heading in DOM order. Named `... (US-006/AC-07)`: during loading, N skeleton rows render and no desk row does. Named `... (US-006/AC-08)`: the alert replaces only the list region, names the selected date, the date strip stays interactive throughout, and **Try again** issues a second request for the same date. Named `... (US-006/AC-09)`: `desks: []` renders `NO_DESKS_EXIST` verbatim, offers no alternative dates and no admin link |

### Step 14 — Evidence, docs and manifest

| Field    | Value                                                                                                                                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | (documentation and evidence — no FR of its own)                                                                                                                                                                                                    |
| Files    | Screenshots of ST-01/ST-02/ST-05/ST-06 at 360/768/1280 pasted into the PR (AC-07's visual evidence — jsdom cannot prove "no layout shift"), `apps/api/src/modules/bookings/README.md` (modify — states ownership: `bookings` owns writes to `bookings`, reads `desks` per ADR-004, `domain/` gained nothing), `apps/api/src/modules/desks/README.md` (modify — one line: `desks` is written only by US-015/US-017), `inception/specs/index.md` (modify — US-006 row → `implemented`), `knowledge/traceability/manifest.json` (modify — US-006 `tests[]`), `traceability.md` in this package (modify — fill in as each step lands) |
| Verify   | `node tools/aidlc-check.mjs` — no new findings for US-006                                                                                                                                                                                          |

### Step 15 — Full suite

| Field    | Value                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | (all of the above)                                                                                                                          |
| Files    | none                                                                                                                                        |
| Verify   | `npm run lint && npm run typecheck && npm test && node tools/aidlc-check.mjs` — all green, and the check reports US-006 with every AC cited by a test |

## Rollback

Reverting the PR is **not** sufficient by itself, because this story is the first to add a migration.
`0002_desks.sql` and `0003_bookings.sql` create structure with no destructive step, so a revert of the
application code leaves two unused tables behind rather than breaking anything — safe to leave in
place until the next deploy, or drop them by hand (`drop table bookings; drop table desks; drop type
booking_status; drop type cancellation_source;`) if the environment must be returned to its exact
pre-US-006 shape. `supabase/seed/desks.dev.sql` is dev-only and reverting it (or leaving stray desk
rows in a dev project) has no production consequence. The `officeDateSchema` tightening (Step 3) and
the new `date_not_bookable` error code (Step 4) are both purely additive/restricting for a client
that has never produced an invalid date, so no existing tab breaks on revert either direction.

## Open questions

| Question                                         | Owner         | Blocks |
| ------------------------------------------------ | ------------- | ------ |

None. The three items the design note raised for the human — AC-04's proof method, the
`officeDateSchema` hole, and ADR-004 — are answered (D-01, D-02, D-03/ADR-004) and reflected in
`decisions.md` and `knowledge/decisions/ADR-004-table-ownership.md`. The design note's remaining
open items (§10, items 4–9) are forward notes for later stories (US-007, US-009, US-015/US-017, the
`/book?date=` deep link, and a research question), not blockers on this plan.
