# US-011 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                    |
| --------- | -------------------------------------------------------------------- |
| **Story** | `inception/stories/user-stories/US-011-cancel-my-own-booking.md`      |
| **Spec**  | `spec.md`                                                              |
| **Tier**  | Complex                                                                |

## Approval — Gate D1

| Field                | Value                                       |
| -------------------- | -------------------------------------------- |
| Status               | **approved**                                 |
| Approved by          | Joy Joshua <joy_j@trigent.com>               |
| Approved on          | 2026-09-19                                   |
| Plan commit approved | *uncommitted at approval* — base `63befe27b7f208575e8cf214ce5f1507713fc1cb` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`; if either is unset, ask them rather than writing `unknown`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**, the commit before this stamp. That SHA is what makes the approval verifiable: a reviewer at D2 runs `git diff <sha> -- <this file>` and sees whether the plan changed after approval. The name is self-asserted, so it is attribution, not authentication.

## Steps

Ordered. Each step names the files it touches, the `FR-##` it advances, and how it is verified. Test-first per acceptance criterion: the failing test named `... (US-###/AC-##)` comes before the code that turns it green.

### Step 1 — Contract: the new error code

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-01, FR-06                                               |
| Files    | `libs/contracts/src/error.ts` (modify), `libs/contracts/src/error.spec.ts` (modify) |
| Verify   | `npm test -w libs/contracts` — expected: all pass, including a new case asserting `errorCodeSchema.safeParse('booking_already_cancelled').success === true` and that `errorBodySchema` still parses an unrecognised code (unchanged behaviour) |

### Step 2 — Repository: past-date refusal + disambiguating read

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-02, FR-03, FR-06                                        |
| Files    | `apps/api/src/modules/bookings/bookings.repository.ts` (modify), `apps/api/src/modules/bookings/bookings.repository.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- bookings.repository.spec.ts` — expected: existing cases updated for the new `today` parameter pass; new cases prove `.gte('booking_date', today)` is issued and `findMyBookingState` selects only `status, booking_date` scoped to `id` + `user_id` |

### Step 3 — Service: three-outcome classification, one clock reading

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-04, FR-06                                                |
| Files    | `apps/api/src/modules/bookings/bookings.service.ts` (modify), `apps/api/src/modules/bookings/bookings.service.spec.ts` (modify) |
| Verify   | `npm test -w apps/api -- bookings.service.spec.ts` — expected: classification table (hit→`ok`; miss+cancelled→`already_cancelled`; miss+confirmed→`not_found`; miss+no-row→`not_found`) passes, and a case proves the disambiguating read is **not** issued on the success path |

### Step 4 — Router: the 409 branch

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-05, FR-06                                                |
| Files    | `apps/api/src/modules/bookings/bookings.router.ts` (modify), `apps/api/src/modules/bookings/bookings.routes.spec.ts` (modify), `apps/api/src/modules/bookings/bookings.fixtures.ts` (modify) |
| Verify   | `npm test -w apps/api -- bookings.routes.spec.ts` — expected: (a) a past-Confirmed booking is refused with `404` and remains `confirmed` in storage (US-011/AC-02); (b) the cross-endpoint consistency test — cancel succeeds on exactly the ids `GET /api/bookings` reports as `status: 'confirmed'`; (c) the two-actor test — cancel as one actor, then the owner's own cancel returns `409 booking_already_cancelled` with `cancelled_at`/`cancelled_by`/`cancellation_source` unchanged from the first actor's write (US-011/AC-09); (d) the existing success-path test (US-007/AC-07) still passes unmodified in behaviour |

### Step 5 — `ConfirmDialog`: props, Escape guard, focus trap, close icon, CSS

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-07, FR-08, FR-09, FR-10                                  |
| Files    | `apps/ui/src/components/confirm-dialog/ConfirmDialog.tsx` (modify), `apps/ui/src/components/confirm-dialog/ConfirmDialog.spec.tsx` (modify), `apps/ui/src/components/confirm-dialog/confirm-dialog.css` (modify) |
| Verify   | `npm test -w apps/ui -- ConfirmDialog.spec.tsx` — expected: existing suite stays green (no behaviour change for `ExistingBookingState`'s call shape) plus new cases — `error` renders via `Alert`; `singleAction` collapses the footer to one action; Escape does nothing while `busy`; Tab cycles within the dialog; unmount restores focus to the triggering element; a close (✕) icon calls `onCancel` and is disabled while `busy` |

### Step 6 — Shared cancel fetcher: move + widen to four outcomes

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-11                                                       |
| Files    | `apps/ui/src/components/existing-booking-state/cancel-booking.ts` → `apps/ui/src/lib/cancel-booking.ts` (move + modify), `apps/ui/src/lib/cancel-booking.spec.ts` (move + modify), `apps/ui/src/components/existing-booking-state/ExistingBookingState.tsx` (modify import + collapse), `apps/ui/src/components/existing-booking-state/ExistingBookingState.spec.tsx` (modify — add regression case) |
| Verify   | `npm test -w apps/ui -- cancel-booking.spec.ts ExistingBookingState.spec.tsx` — expected: all four outcome mappings pass (`ok`→`ok`, `already_cancelled`→`already_cancelled`, `refused`→`refused`, `failed`→`failed`); `ExistingBookingState.spec.tsx` gains a case citing `US-007/AC-07` proving a `409` (already-cancelled) still converges to `onCancelled()`, matching today's `404` behaviour |

### Step 7 — `BookingRow`: the Cancel control

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-12                                                       |
| Files    | `apps/ui/src/screens/my-bookings/BookingRow.tsx` (modify), `apps/ui/src/screens/my-bookings/BookingRow.spec.tsx` (modify), `apps/ui/src/screens/my-bookings/booking-row.css` (modify) |
| Verify   | `npm test -w apps/ui -- BookingRow.spec.tsx` — expected: a Cancel control renders and calls `onCancel` when the prop is supplied; no Cancel control renders when it is omitted (proves the existing Past-row call sites are unaffected) |

### Step 8 — `useMyBookings`: `markCancelled`

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-13                                                       |
| Files    | `apps/ui/src/screens/my-bookings/use-my-bookings.ts` (modify), `apps/ui/src/screens/my-bookings/use-my-bookings.spec.ts` (modify) |
| Verify   | `npm test -w apps/ui -- use-my-bookings.spec.ts` — expected: `markCancelled(id)` flips exactly that item's `status` to `'cancelled'` with no re-fetch and no `status: 'loading'` transition; `nextBefore` and other items are untouched |

### Step 9 — Copy

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-15                                                       |
| Files    | `apps/ui/src/screens/my-bookings/copy.ts` (modify), `apps/ui/src/screens/my-bookings/copy.spec.ts` (modify) |
| Verify   | `npm test -w apps/ui -- copy.spec.ts` — expected: dialog title/body builders, button labels, both ST-09 messages and the ST-10 toast builder match the strings verified against the live Figma frames (`traceability.md`) |

### Step 10 — `MyBookings`: wire the whole flow (ST-07–ST-10)

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | FR-14, FR-16                                                |
| Files    | `apps/ui/src/screens/my-bookings/MyBookings.tsx` (modify), `apps/ui/src/screens/my-bookings/MyBookings.spec.tsx` (modify), `apps/ui/src/screens/my-bookings/my-bookings.css` (modify), `apps/ui/src/screens/my-bookings/use-cancel-dialog.ts` (create, + `.spec.ts`) — see `change-log.md` |
| Verify   | `npm test -w apps/ui -- MyBookings.spec.tsx` — expected, one case per: AC-01 (Cancel present on TODAY/Upcoming, absent on Past), AC-03 (dialog names desk+date; Escape dismisses without requesting), AC-04/AC-05 (success flips the row, shows the toast, no skeleton reappears), AC-06 (no password prompt anywhere in the flow), AC-07 (double-activation issues exactly one request; Escape no-ops while busy), AC-08 (failure keeps the dialog open, row stays Confirmed, retry works), AC-09 (already-cancelled renders the non-retryable message with **Close**, and dismissal re-fetches) |

### Step 11 — Traceability, manifest, spec-index, README

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | (documentation of the above)                                |
| Files    | `traceability.md` (modify — flip each row to `implemented` with real `file:line`), `knowledge/traceability/manifest.json` (modify — `US-011.tests[]`), `inception/specs/index.md` (modify — status → `implemented`), `apps/api/src/modules/bookings/README.md` (modify — what US-011 added) |
| Verify   | `npm run check` (aidlc-check) — expected: all checks pass, including check 4 (manifest tests[] parses) and check 16 (spec package completeness) |

### Step 12 — Full verification pass

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Advances | (all)                                                        |
| Files    | none (verification only)                                    |
| Verify   | `npm run lint`, `npm run typecheck`, `npm test` — expected: all green, pasted into the PR description verbatim |

## Rollback

Revert the PR. No data migration and no config change means a revert fully restores prior behaviour, including `cancel-booking.ts`'s file location (a `git revert` restores the move along with the code). No follow-up cleanup step is needed.

## Open questions

None blocking. Two design-note open items were resolved with an explicit default rather than left
open, so this table stays empty per this template's own rule (a non-empty table blocks `go`):

- **Design-note open item 1** (stale "today" row across office midnight): implemented as the
  retryable ST-09 message with no extra refresh — the design note's own default. Recorded in
  `spec.md`'s Out of scope. A human who wants the alternative (refresh-on-any-server-answer) says so
  before `go`; it is a one-line change to Step 10, not a re-plan.
- **Design-note open item 2** (ST-09's non-retryable **Close** label — not drawn in any Figma frame):
  using "Close" verbatim from the approved written screen spec. A human who wants it re-confirmed
  with the designer first says so before `go`.
