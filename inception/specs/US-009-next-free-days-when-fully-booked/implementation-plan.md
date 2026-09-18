# US-009 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                    |
| --------- | ---------------------------------------------------------------------- |
| **Story** | `inception/stories/user-stories/US-009-next-free-days-when-fully-booked.md` |
| **Spec**  | `spec.md`                                                            |
| **Tier**  | Complex                                                              |

## Approval — Gate D1

| Field                | Value                                       |
| -------------------- | -------------------------------------------- |
| Status               | **approved**                                 |
| Approved by          | Joy Joshua <joy_j@trigent.com>               |
| Approved on          | 2026-09-18                                   |
| Plan commit approved | *uncommitted at approval* — base `84506d76ca85226f1de1d22893597d0f6d224c60` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`; if either is
unset, ask them rather than writing `unknown`. `Plan commit approved` is the SHA of the commit holding
this plan **as they read it**, the commit before this stamp. That SHA is what makes the approval
verifiable: a reviewer at D2 runs `git diff <sha> -- <this file>` and sees whether the plan changed
after approval. The name is self-asserted, so it is attribution, not authentication.

**Architect design note: done — `design-note.md` in this folder.** Verdict: build the lookahead, no
blockers, no new ADR. Four open items from that note and from opening the real Figma frames (which
the note itself did not do) were resolved with the human before this plan was written —
`decisions.md` D-01 through D-04.

## Steps

Ordered. Each step names the files it touches, the `FR-##` it advances, and how it is verified.
Test-first per acceptance criterion: the failing test named `... (US-009/AC-##)` comes before the
code that turns it green.

### Step 1 — Contract: `nextFreeDays`

| Field    | Value                                                                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01                                                                                                                                                                                                                                             |
| Files    | `libs/contracts/src/availability.ts` (modify — add `nextFreeDays: z.array(officeDateSchema).max(2).default([])` to `availabilityResponseSchema`, after `usualDeskId`), `libs/contracts/src/availability.spec.ts` (modify) |
| Verify   | `npm test --workspace @desk-booking/contracts` — expected: an old fixture with no `nextFreeDays` key parses to `[]`; a fixture with two dates parses; a fixture with three is rejected by `.max(2)` |

### Step 2 — Domain: `pickNextFreeDays` (AC-02, AC-05, AC-06)

| Field    | Value                                                                                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-03                                                                                                                                                                                                                        |
| Files    | `apps/api/src/domain/next-free-days.ts` (create — `pickNextFreeDays({ after, today, limit, hasFreeDesk, alreadyBooked })`, reusing `refusalFor`/`addDays`/`lastBookableDate` from `@desk-booking/contracts`; loop guard is **`candidate <= end && out.length < limit`**, both conditions, never just the count), `apps/api/src/domain/next-free-days.spec.ts` (create) |
| Verify   | `npm test --workspace @desk-booking/api` — expected, named per-AC: `... (US-009/AC-02)` two free days after a full one, ascending, as **literal expected dates**, never computed by calling the function under test. `... (US-009/AC-05)` — **the termination test**: a window with one free day returns exactly one; a window with none returns `[]` and the call *returns* (a regression here would hang the test, not just fail an assertion). `... (US-009/AC-06)` weekends skipped; a candidate at `today + 30` included and `today + 31` excluded; a date the caller has booked skipped even when it is free; nothing at or before the selected date |

### Step 3 — Repository: the two range reads (AC-06, ADR-004 unchanged)

| Field    | Value                                                                                                                                                                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-04                                                                                                                                                                                                                                                                            |
| Files    | `apps/api/src/modules/bookings/bookings.repository.ts` (modify — add `listConfirmedDeskIdsInRange(from, to): Promise<Array<{booking_date, desk_id}>>` — select list `booking_date, desk_id` only, `.gte('booking_date', from).lte('booking_date', to).eq('status', 'confirmed')`; add `listMyConfirmedDatesInRange(userId, from, to): Promise<OfficeDate[]>` — select `booking_date` only, filtered to `user_id` and the same range/status), `apps/api/src/modules/bookings/bookings.repository.spec.ts` (modify), `apps/api/src/modules/bookings/bookings.fixtures.ts` (modify — a fully-booked dataset with controlled free/full days after it) |
| Verify   | `npm test --workspace @desk-booking/api` — expected: `listConfirmedDeskIdsInRange` names **no** user column in its select list (recording-fake assertion, mirrors US-006/AC-06's proof for `listConfirmedDeskIds`); `listMyConfirmedDatesInRange` is filtered to `user_id` and `status = 'confirmed'` |

### Step 4 — Service: the fully-booked branch (AC-01, AC-05, AC-06, AC-07)

| Field    | Value                                                                                                                                                                                                                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-02, FR-05, FR-06                                                                                                                                                                                                                                                                                                                    |
| Files    | `apps/api/src/modules/bookings/bookings.service.ts` (modify — after the existing projection, compute `fullyBooked = projected.length > 0 && !projected.some(d => d.status === 'available')`; if `!fullyBooked \|\| myBooking` return `nextFreeDays: []` with no query; else compute `from = addDays(date, 1)`, `to = lastBookableDate(today)`, guard `from > to` → `[]`; else run the two range reads in the same `Promise.all` shape as the existing four, build `takenByDate` from the range rows, call `pickNextFreeDays`), `apps/api/src/modules/bookings/bookings.service.spec.ts` (modify) |
| Verify   | `npm test --workspace @desk-booking/api` — expected, named `... (US-009/AC-01)`: a fully-booked payload has `desks.every(d => d.status === 'taken')` and a non-empty `desks`. Named `... (US-009/AC-07)`: `desks: []` never triggers the range reads (asserted via a spy/call-count on the repository, not just the response shape). `... (US-009/AC-05)`: the range reads are skipped entirely when `date === lastBookableDate(today)` (the `from > to` guard) or when `myBooking` is set. A rejected range read propagates rather than resolving `nextFreeDays: []` (FR-06) |

### Step 5 — UI: `EmptyState` gains `body?`/`actions?` (FR-08)

| Field    | Value                                                                                                                                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-08                                                                                                                                                                                                                                                                                  |
| Files    | `apps/ui/src/components/empty-state/EmptyState.tsx` (modify — `body: string` → `body?: string`, render the `<p>` only when present; add `actions?: ReactNode`, rendered after body when present), `apps/ui/src/components/empty-state/EmptyState.spec.tsx` (modify) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected: ST-05's existing case (title + body, no actions) is unchanged; a new case with no `body` renders no body paragraph; a new case with `actions` renders them after the body |

### Step 6 — UI: copy (AC-01, AC-05)

| Field    | Value                                                                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-09                                                                                                                                                                                                                                                                            |
| Files    | `apps/ui/src/screens/book-a-desk/copy.ts` (modify — add `FULLY_BOOKED = (label: string) => \`Every desk is taken on ${label}.\``; add a lead-line helper, e.g. `FULLY_BOOKED_LEAD(count: number): string \| undefined` returning the count-2 string, the count-1 string, or `undefined` for 0 — see `decisions.md` D-03 for the exact wording), `apps/ui/src/screens/book-a-desk/copy.spec.ts` (modify — the assertion `copy.ts:42` already reserves the slot for: `FULLY_BOOKED` differs from `NO_DESKS_EXIST`, and `FULLY_BOOKED_LEAD` returns the right string at 2, 1 and `undefined` at 0) |
| Verify   | `npm test --workspace @desk-booking/ui`                                                                                                                                                                                                                                          |

### Step 7 — UI: the ST-04 branch in `BookADesk.tsx` (AC-01, AC-03, AC-04, AC-05, AC-07)

| Field    | Value                                                                                                                                                                                                                                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-07, FR-10, FR-11, FR-12                                                                                                                                                                                                                                                                                                                                       |
| Files    | `apps/ui/src/screens/book-a-desk/BookADesk.tsx` (modify — insert between the `desks.length === 0` branch (:252-255) and the ordinary-list branch (:256): compute `fullyBooked` from `availability.data.desks`; when true, render `AvailabilityCount` as today (count line stays, AC-01) followed by `<EmptyState title={FULLY_BOOKED(dateLabel)} body={FULLY_BOOKED_LEAD(nextFreeDays.length)} actions={...} />`, where `actions` maps `nextFreeDays` to `Button variant="secondary"` calling `selectDate(date)`, short label from `formatOfficeDateLabel`, long-form `aria-label`, followed by one `Button variant="ghost"` calling `setPickerOpen(true)` reading "Pick another date"), `apps/ui/src/screens/book-a-desk/BookADesk.spec.tsx` (modify) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-009/AC-01)`: the count line reads "0 of 40 desks free · …" above the empty-state title naming the date, no zone list rendered. Named **`... (US-009/AC-03)`**: activating a suggestion issues a new availability request for that date via `selectDate`, clears any prior desk selection, and the date picker never opens. Named **`... (US-009/AC-04)`**: the confirm control is absent (`queryBy…` returns `null`), never disabled. Named `... (US-009/AC-05)`: `nextFreeDays: []` renders the title, no lead line, no suggestion button, and still renders the "Pick another date" link; one entry renders the one-day wording. Named `... (US-009/AC-07)`: `desks: []` still renders ST-05's copy and no suggestion button even when a (test-constructed) `nextFreeDays` is non-empty |

### Step 8 — Evidence, docs and manifest

| Field    | Value                                                                                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | (documentation and evidence — no FR of its own)                                                                                                                                                                      |
| Files    | Screenshots of the ST-04 branch at 360/768/1280, compared against Figma nodes `39:1543`/`39:1420`/`39:1245`, pasted into the PR. `apps/api/src/modules/bookings/README.md` (modify — states US-009 added the range reads and that `desks` is not re-read). `inception/specs/index.md` (modify — US-009 row → `implemented`). `knowledge/traceability/manifest.json` (modify — US-009 `tests[]`). `traceability.md` in this package (modify — fill in as each step lands) |
| Verify   | `node tools/aidlc-check.mjs` — no new findings for US-009                                                                                                                                                             |

### Step 9 — Full suite

| Field    | Value                                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | (all of the above)                                                                                                                                |
| Files    | none                                                                                                                                              |
| Verify   | `npm run lint && npm run typecheck && npm test && node tools/aidlc-check.mjs` — all green, and the check reports US-009 with every AC cited by a test |

## Rollback

No migration lands in this story. Reverting the PR removes the `nextFreeDays` field, the two range
reads, `pickNextFreeDays`, and the ST-04 branch's suggestions; the fully-booked state falls back to
what it rendered before this story (title only, from `EmptyState` with no `actions`). The field is
purely additive to `availabilityResponseSchema` (ADR-002's asymmetry) and safe to leave defined even
if unreachable after a revert.

## Open questions

| Question | Owner | Blocks |
| -------- | ----- | ------ |

None. Build-vs-fallback, the free-count-vs-lean-contract call, the AC-05 lead-line wording, and the
"Pick another date" link found in the real Figma frame were all asked and answered before this plan
was written (`decisions.md` D-01–D-04). The follow-up `change-request` to correct the Figma frame's
per-suggestion counts is tracked outside this story and does not block it.
