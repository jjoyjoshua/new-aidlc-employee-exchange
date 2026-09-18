# US-010 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                             |
| --------- | ------------------------------------------------------------- |
| **Story** | `inception/stories/user-stories/US-010-view-my-bookings.md`   |
| **Spec**  | `spec.md`                                                     |
| **Tier**  | Complex                                                        |

## Approval — Gate D1

| Field                | Value                                       |
| -------------------- | -------------------------------------------- |
| Status               | **approved**                                 |
| Approved by          | Joy Joshua <joy_j@trigent.com>               |
| Approved on          | 2026-09-18                                   |
| Plan commit approved | *uncommitted at approval* — base `843b36aa2d72bb177fd0d5bb40d65c1f3710f15f` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`; if either is
unset, ask them rather than writing `unknown`. `Plan commit approved` is the SHA of the commit holding
this plan **as they read it**, the commit before this stamp. That SHA is what makes the approval
verifiable: a reviewer at D2 runs `git diff <sha> -- <this file>` and sees whether the plan changed
after approval. The name is self-asserted, so it is attribution, not authentication.

**Architect design note: done — `design-note.md` in this folder.** Verdict: `GET /api/bookings` with
a `?before=` date-floor cursor (§1), Completed derived server-side onto a response-only enum (§2),
`StatusChip` extended rather than duplicated (§4.4), one new ADR (`ADR-007`, this folder's sibling in
`knowledge/decisions/`) for the derivation only.

**All open questions are now resolved — see below.** Joy Joshua supplied working node-specific Figma
links for all 30 `HF / SCR-002` frames (2026-09-18); the ST-01–ST-06 frames this story covers were
opened and inspected via the Figma connector (node ids in Open questions, resolved). Unlike US-008
and US-009, the frames match the written SCR-002 spec exactly — no corrections were needed to
copy, layout, or the components table. The two remaining open items (the no-frame history case, the
"load older" button's copy) were decided by Joy Joshua when this plan was presented.

## Steps

Ordered. Each step names the files it touches, the `FR-##` it advances, and how it is verified.
Test-first per acceptance criterion: the failing test named `... (US-010/AC-##)` comes before the
code that turns it green.

### Step 1 — Contract: the two schemas and the response envelope

| Field    | Value                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-03, FR-04                                                                                                                |
| Files    | `libs/contracts/src/bookings.ts` (modify), `libs/contracts/src/bookings.spec.ts` (modify — add), `libs/contracts/src/index.ts` (modify) |
| Verify   | `npm test -w libs/contracts` — expected: new tests pass, including `bookingStatusSchema.safeParse('completed')` failing (design-note §2.2) |

### Step 2 — Domain: the derivation rule and the window

| Field    | Value                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-05                                                                                                        |
| Files    | `apps/api/src/domain/booking-history.ts` (create), `apps/api/src/domain/booking-history.spec.ts` (create)   |
| Verify   | `npm test -w apps/api -- booking-history` — expected: `bookingDisplayStatus`'s four cases (US-010/AC-04) and `historyFloor`'s literal boundary (US-010/AC-03) pass |

### Step 3 — Repository: the two new reads

| Field    | Value                                                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-06                                                                                                                                    |
| Files    | `apps/api/src/modules/bookings/bookings.repository.ts` (modify), `apps/api/src/modules/bookings/bookings.repository.spec.ts` (modify — add) |
| Verify   | `npm test -w apps/api -- bookings.repository` — expected: both methods assert `user_id` filter, no `user_id` in the select list, `booking_date desc, created_at desc` order, plain (non-`!inner`) embed |

### Step 4 — Service: `listMyBookings`

| Field    | Value                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-02, FR-07                                                                                                                   |
| Files    | `apps/api/src/modules/bookings/bookings.service.ts` (modify), `apps/api/src/modules/bookings/bookings.service.spec.ts` (modify — add) |
| Verify   | `npm test -w apps/api -- bookings.service` — expected: cursor arithmetic (`nextBefore` from the floor, not the last item), derivation applied per row, over a `fixedClock` (US-010/AC-03, AC-04) |

### Step 5 — Route: `GET /api/bookings`

| Field    | Value                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-08                                                                                                                         |
| Files    | `apps/api/src/modules/bookings/bookings.router.ts` (modify), `apps/api/src/modules/bookings/bookings.routes.spec.ts` (modify — add), `apps/api/src/modules/bookings/bookings.fixtures.ts` (modify — add the future-dated-Cancelled row from design-note §7.1) |
| Verify   | `npm test -w apps/api -- bookings.routes` — expected: default page, `?before=` paging, the wire invariant (`confirmed` ⟹ `date >= today`), `400` on unknown query field, `503`/`500` not swallowed to `[]` (US-010/AC-01, AC-03, AC-04, AC-09) |

### Step 6 — `apps/api` full check

| Field    | Value                                                                          |
| -------- | ------------------------------------------------------------------------------- |
| Advances | (verification only)                                                              |
| Files    | none                                                                              |
| Verify   | `npm run typecheck -w apps/api && npm run lint && npm test -w apps/api` — expected: all green, no new lint findings |

### Step 7 — `StatusChip`: booking-lifecycle variants

| Field    | Value                                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-13                                                                                                                        |
| Files    | `apps/ui/src/components/status-chip/StatusChip.tsx` (modify), `apps/ui/src/components/status-chip/StatusChip.spec.tsx` (modify — add), `apps/ui/src/components/status-chip/status-chip.css` (modify), `apps/ui/src/assets/icon-close.svg` (create — downloaded from Figma, see below) |
| Verify   | `npm test -w apps/ui -- StatusChip` — expected: existing desk variants unchanged; three new booking variants each render a word + `aria-hidden` icon (US-010/AC-05) |

Confirmed against the real frames (node ids `102:5527`, `102:5696`, `102:5940`): Confirmed uses the
existing check-circle icon already in `StatusChip.tsx`; Completed uses `icon-clock.svg` (already in
`apps/ui/src/assets/`); Cancelled needs `Icon / close` (Figma node `11:50`, *"Dismiss a dialog"* —
**this asset already exists in the design system**, to be downloaded via the Figma connector rather
than hand-drawn — design-note open item 7 is resolved, not open).

### Step 8 — `MyBookings.tsx`: the list, its sections, its states

| Field    | Value                                                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-09, FR-10, FR-11, FR-12, FR-14, FR-15                                                                                                                                          |
| Files    | `apps/ui/src/screens/my-bookings/MyBookings.tsx` (modify — replace stub content, keep the two existing toasts), `apps/ui/src/screens/my-bookings/BookingRow.tsx` (create), `apps/ui/src/screens/my-bookings/use-my-bookings.ts` (create), `apps/ui/src/screens/my-bookings/fetch-my-bookings.ts` (create), `apps/ui/src/screens/my-bookings/copy.ts` (create), `apps/ui/src/screens/my-bookings/my-bookings.css` (create), and each file's `.spec.ts`/`.spec.tsx` |
| Verify   | `npm test -w apps/ui -- MyBookings` and `-- use-my-bookings` and `-- copy` — expected: all `AC-01`–`AC-10` cases in `design-note.md` §9 pass, including the two "green test proving nothing" traps (§4.1's `status`-not-`date` sectioning, §7.3's three-way empty state) |

Confirmed against the real frames (node ids below) — copy strings match the written SCR-002 spec
exactly, so `copy.ts` can be written from either source with the same result:

| State | Node (1280) | Confirmed copy |
| --- | --- | --- |
| ST-03 never booked | `102:5527` | Title "You haven't booked a desk yet.", body "Pick a day and a desk — we'll email you a confirmation.", action **Book a desk** |
| ST-04 nothing upcoming | `102:5696` | Title "Nothing booked coming up.", **no body line** (the frame's `EmptyState` renders no `body` prop here), action **Book a desk** |
| ST-05 today's booking | `102:5940` | **TODAY** eyebrow (letter-spaced label), desk number at `heading/semibold` (20px, confirmed larger than a normal row's `body/medium` desk number), own card above Upcoming, still carries **Cancel** |
| ST-06 load error | `102:6303` | "We couldn't load your bookings. They're safe — this is a display problem.", single **Try again** action, no title line, no second action |

Also confirmed: the Past-bookings `AccordionHeader` defaults to expanded (chevron-up) at 1280, matching
the spec's "expanded on desktop"; a Past row is 60px (no Cancel), an Upcoming/Today row is 80px (with
Cancel) — `BookingRow`'s node (`83:5041`) documents "Past rows offer no action (REQ-010 allows
cancelling today-or-later only)".

**Decision surfaced by opening the frames, not in the design note: the approved `Booking row` and
`Today booking` components render a `Cancel` button on every Upcoming/Today row — but US-011, not
this story, owns cancellation.** Per `decisions.md` D-05, this story's `BookingRow` does **not**
render a `Cancel` control at all (rather than rendering one with no handler); US-011 adds it. This
keeps the screen honest — no dead button — at the cost of ST-01/ST-05 looking visually incomplete
until US-011 lands, which is consistent with how prior stories on this screen (US-006 → US-007)
built up one screen across stories.

### Step 9 — `apps/ui` full check, then whole-repo check

| Field    | Value                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| Advances | (verification only)                                                                                             |
| Files    | none                                                                                                             |
| Verify   | `npm run typecheck -w apps/ui && npm run lint && npm test -w apps/ui`, then `npm run build`, `npm run check` (aidlc-check) — expected: all green, check 16 passes on this package |

## Rollback

Revert the PR. No data migration exists to unwind — `supabase/migrations/**` is untouched by this
story (design-note §0, §8). Reverting drops `GET /api/bookings` and the `MyBookings.tsx` rebuild;
`POST /api/bookings` and `POST /api/bookings/:id/cancel` are unaffected because neither their route
nor their contract schema changes.

## Open questions

All resolved as of 2026-09-18. Table kept for the record — a non-empty "Blocks" table is what would
stop `go`; every row here now carries a resolution instead.

| Question                                                                                                          | Owner         | Resolution |
| --------------------------------------------------------------------------------------------------------------------- | -------------- | ---------- |
| The connected Figma file initially returned only a `Cover` page via the MCP connector — no mockup frames found.       | Joy Joshua     | Resolved 2026-09-18. Joy Joshua supplied working node-specific links for all 30 `HF / SCR-002` frames. The ST-01 to ST-06 frames this story covers were opened; node ids and confirmed copy are in Steps 7 and 8 above. No corrections to the written SCR-002 spec were needed. |
| Design-note open item 2: the third empty-ish case (Past section empty, only "Show older" showing) has no drawn frame in SCR-002. | Designer / PO | Resolved 2026-09-18 (Joy Joshua) — build it as ST-04 with an empty Past section. Reuses ST-04's existing copy and layout; no new visual design needed. |
| Design-note open item 3: the "load older" control's copy — SCR-002's conflict row 1 says "Show more", the story text says "an explicit control". | PO/BA (`/ba`) | Resolved 2026-09-18 (Joy Joshua) — "Show more", matching SCR-002's own resolved conflict row 1. |
| No close/X icon asset was known to exist for the Cancelled `StatusChip` variant.                                       | Joy Joshua     | Resolved by opening the frames — `Icon / close` (Figma node `11:50`, "Dismiss a dialog") already exists in the design system; `decisions.md` D-03 updated to download it rather than hand-draw one. |

A non-empty table blocks the D1 approval. Answer or close every row before asking for `go`.
