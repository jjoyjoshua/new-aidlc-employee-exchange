# US-008 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                    |
| --------- | ---------------------------------------------------------------------- |
| **Story** | `inception/stories/user-stories/US-008-see-my-last-booked-desk.md` |
| **Spec**  | `spec.md`                                                            |
| **Tier**  | Complex                                                              |

## Approval — Gate D1

| Field                | Value                                       |
| -------------------- | -------------------------------------------- |
| Status               | **approved**                                 |
| Approved by          | Joy Joshua <joy_j@trigent.com>               |
| Approved on          | 2026-09-18                                   |
| Plan commit approved | *uncommitted at approval* — base `8ef17ce5a449f8527b80c0304a30219085b1826a` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`; if either is
unset, ask them rather than writing `unknown`. `Plan commit approved` is the SHA of the commit holding
this plan **as they read it**, the commit before this stamp. That SHA is what makes the approval
verifiable: a reviewer at D2 runs `git diff <sha> -- <this file>` and sees whether the plan changed
after approval. The name is self-asserted, so it is attribution, not authentication.

**Architect design note: done — `design-note.md` in this folder.** Verdict: proceed, no blockers, no
new ADR. It settled the response shape (D-01), the eligibility resolution point (D-02), the repository
method (D-03's tie-break), and raised two `major` findings folded into the steps below: the
`created_at desc` tie-break in Step 2 (F-2, without which a cancel-then-rebook same-date pair returns
a coin flip) and the composed `aria-label` in Step 5 (F-3, without which AC-06 is unmet by an
implementation that looks correct and passes a substring assertion). It also flagged a contradiction
between AC-05 and the story's own Edge Cases section (F-1) — not a code blocker, since both readings
agree on everything this plan implements, but filed as
[change-request issue #37](../../../../issues/37) and confirmed with the human 2026-09-18: implement
the Edge Cases reading (label follows a desk through a rename).

## Steps

Ordered. Each step names the files it touches, the `FR-##` it advances, and how it is verified.
Test-first per acceptance criterion: the failing test named `... (US-008/AC-##)` comes before the code
that turns it green.

### Step 1 — Contract: `usualDeskId` on the availability response (D-01)

| Field    | Value                                                                                                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01                                                                                                                                                                                                                        |
| Files    | `libs/contracts/src/availability.ts` (modify — add `usualDeskId: z.string().uuid().nullable().default(null)` to `availabilityResponseSchema`, with a docblock stating it is already filtered to eligibility and derived from the single most recent booking, not frequency — design note §1.3), `libs/contracts/src/availability.spec.ts` (modify) |
| Verify   | `npm test --workspace @desk-booking/contracts` — expected: `availabilityResponseSchema` parses a fixture with `usualDeskId: null`, one with a populated `usualDeskId`, and an **old** fixture with no `usualDeskId` key at all still parses (additive) |

### Step 2 — Repository: `findMyLastBookedDeskId` (D-03)

| Field    | Value                                                                                                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-02, FR-03                                                                                                                                                                                                                 |
| Files    | `apps/api/src/modules/bookings/bookings.repository.ts` (modify — add `findMyLastBookedDeskId(userId): Promise<string \| undefined>` to `AvailabilityRepository` and its implementation: `select('desk_id')`, `.eq('user_id', userId)`, **no status filter**, `.order('booking_date', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle()`), `apps/api/src/modules/bookings/bookings.repository.spec.ts` (modify — recording-fake-client tests), `apps/api/src/modules/bookings/bookings.fixtures.ts` (modify — add a two-booking-same-date fixture, one cancelled and one confirmed, confirmed created later) |
| Verify   | `npm test --workspace @desk-booking/api` — expected, named `... (US-008/AC-04)`: `findMyLastBookedDeskId` returns `undefined` for a user with no bookings. Named `... (US-008/AC-03)`: returns the most recent by `booking_date`, **and — the tie-break case (design note §5, F-2) — given a cancelled and a confirmed booking on the same `booking_date` with the confirmed one created later, returns the confirmed desk's id, not whichever row the fixture lists first** |

### Step 3 — Service: filter to eligibility, join the parallel read (D-02)

| Field    | Value                                                                                                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-04                                                                                                                                                                                                                        |
| Files    | `apps/api/src/modules/bookings/bookings.service.ts` (modify — `getAvailability` adds `availability.findMyLastBookedDeskId(userId)` as a fourth entry in the existing `Promise.all` (`bookings.service.ts:71-75`), then after `projected` is built: `usualDeskId = lastDeskId && projected.some(d => d.id === lastDeskId && d.status === 'available') ? lastDeskId : null`, included in the returned `data`), `apps/api/src/modules/bookings/bookings.service.spec.ts` (modify) |
| Verify   | `npm test --workspace @desk-booking/api` — expected, named `... (US-008/AC-01)`: given a most-recent booking whose desk is available today, `getAvailability` returns that desk's id as `usualDeskId`. Named `... (US-008/AC-04)`: no booking history → `usualDeskId: null`. Named `... (US-008/AC-05)`, two cases: the most-recent desk is `taken` today → `null`; the most-recent desk is inactive (absent from `projected`) → `null`. Named `... (US-008/AC-05)` (rename): the most-recent booking's desk id is present and available under a **different `deskNumber`** than it had when booked (simulating a rename) → still labelled, because the filter matches on id, not name |

### Step 4 — UI: `DeskRow`'s `usual` prop and composed accessible name (D-04)

| Field    | Value                                                                                                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-05, FR-06                                                                                                                                                                                                                 |
| Files    | `apps/ui/src/components/desk-row/DeskRow.tsx` (modify — add `usual?: boolean` prop, ignored for a `taken` row same as `selected`; render a text hint `your usual desk` inside the available-row `<button>`; replace `aria-label={deskNumber}` with a composed name: `[deskNumber, LABEL[selected ? 'selected' : 'available'], usual ? 'your usual desk' : undefined].filter(Boolean).join(', ')` — needs the same `LABEL` record `StatusChip.tsx:24` uses, imported or mirrored, not re-typed inline), `apps/ui/src/screens/book-a-desk/copy.ts` (modify — add the approved string, e.g. `export const YOUR_USUAL_DESK = 'your usual desk';`), `apps/ui/src/components/desk-row/DeskRow.spec.tsx` (modify) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-008/AC-01)`: `usual` renders visible text "your usual desk" on an available row. Named `... (US-008/AC-06)`: the row's accessible name is asserted by **full string match**, not substring — `getByRole('radio', { name: 'A-01, Available, your usual desk' })` for the unselected case and `'A-01, Selected, your usual desk'` once selected — proving the hint and the availability word are both in the computed name, not only visually present |

### Step 5 — UI: thread `usualDeskId` through `ZoneGroup` and `BookADesk` (D-01 plumbing)

| Field    | Value                                                                                                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-07, FR-08                                                                                                                                                                                                                 |
| Files    | `apps/ui/src/components/zone-group/ZoneGroup.tsx` (modify — add `usualDeskId?: string \| undefined` prop, pass `usual={desk.id === usualDeskId}` to each `DeskRow`, mirroring `selectedDeskId` exactly), `apps/ui/src/components/zone-group/ZoneGroup.spec.tsx` (modify), `apps/ui/src/screens/book-a-desk/BookADesk.tsx` (modify — pass `usualDeskId={availability.data.usualDeskId}` to each `ZoneGroup` at `BookADesk.tsx:294-301`; no change to `selectedDeskId`'s own state or initial value), `apps/ui/src/screens/book-a-desk/BookADesk.spec.tsx` (modify) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-008/AC-01)`: given a `usualDeskId` in the availability fixture, the matching row's accessible name includes "your usual desk" and no other row's does. Named `... (US-008/AC-02)`, **with `usualDeskId` seeded** in the fixture: on load, no row has `aria-checked="true"`, and the confirm action is disabled and reads "Select a desk". Every case in this step seeds `myBooking: null` explicitly (design note §2 — a non-null `myBooking` hides the desk list entirely, so no label could ever be observed) |

### Step 6 — Evidence, docs and manifest

| Field    | Value                                                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | (documentation and evidence — no FR of its own)                                                                                                                          |
| Files    | Screenshots of ST-01 and ST-07 at 360/768/1280 with the label visible, pasted into the PR; `apps/api/src/modules/bookings/README.md` (modify — one line noting `getAvailability` now also resolves `usualDeskId`); `inception/specs/index.md` (modify — US-008 row → `implemented`); `knowledge/traceability/manifest.json` (modify — US-008 `tests[]`); `traceability.md` in this package (modify — fill in as each step lands) |
| Verify   | `node tools/aidlc-check.mjs` — no new findings for US-008                                                                                                                |

### Step 7 — Full suite

| Field    | Value                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | (all of the above)                                                                                                                                |
| Files    | none                                                                                                                                              |
| Verify   | `npm run lint && npm run typecheck && npm test && node tools/aidlc-check.mjs` — all green, and the check reports US-008 with every AC cited by a test |

## Rollback

No migration lands in this story. Reverting the PR removes `usualDeskId` from the response and the
label from the UI; the underlying `bookings` rows are unaffected either way. `usualDeskId` is purely
additive to a non-`.strict()` response schema (ADR-002) and safe to leave defined even if a future
revert removes its only reader.

## Open questions

| Question | Owner | Blocks |
| -------- | ----- | ------ |

None. AC-05's rename contradiction (design note F-1) is resolved for implementation purposes — the
Edge Cases reading, confirmed with the human 2026-09-18 — and tracked separately as
[issue #37](../../../../issues/37) for the story text itself, which does not block this plan.
