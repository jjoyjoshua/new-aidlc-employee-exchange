# US-016 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                  |
| --------- | ------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-016-see-the-desk-inventory.md` |
| **Spec**  | `spec.md`                                        |
| **Tier**  | Complex                                           |

## Approval — Gate D1

| Field                | Value           |
| --------------------- | --------------- |
| Status               | **approved**    |
| Approved by          | Joy Joshua <joy_j@trigent.com> |
| Approved on          | 2026-09-19      |
| Plan commit approved | *uncommitted at approval* — base `177360d9cd05626fa8d6f515c40ad692fed6d0df` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`; if either is unset, ask them rather than writing `unknown`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**, the commit before this stamp. That SHA is what makes the approval verifiable: a reviewer at D2 runs `git diff <sha> -- <this file>` and sees whether the plan changed after approval. The name is self-asserted, so it is attribution, not authentication.

## Steps

Ordered. Each step names the files it touches, the `FR-##` it advances, and how it is verified. Test-first per acceptance criterion: the failing test named `... (US-016/AC-##)` comes before the code that turns it green.

### Step 1 — Contract: add `bookedAhead` to `adminDeskSchema`

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-04, FR-05                                                 |
| Files    | `libs/contracts/src/desks.ts` (modify — add `bookedAhead: z.number().int().nonnegative()`, rewrite the envelope docblock per `design-note.md` §8.2), `libs/contracts/src/desks.spec.ts` (create — parses `bookedAhead: 0` and rejects an object where it is absent) |
| Verify   | `npm test -w libs/contracts` — the new spec passes; existing `adminDesksResponseSchema` parses are unaffected |

### Step 2 — Repository: the booking-count read

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-04                                                         |
| Files    | `apps/api/src/modules/desks/desks.repository.ts` (modify — add `listUpcomingConfirmedDeskIds(status, from)`, `desk_id`-only select, `.eq('status', status).gte('booking_date', from)`, per `design-note.md` §2.2), `desks.repository.spec.ts` (modify — the recording fake gains a `gte` recorder; assert the exact query shape and that no other column is selected) |
| Verify   | `npm test -w apps/api -- desks.repository` — new test named `... (US-016/AC-04)` passes |

### Step 3 — Service: tally the count from the borrowed predicate

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-04, FR-05, NFR-01                                          |
| Files    | `apps/api/src/modules/desks/desks.service.ts` (modify — `DesksServiceDeps` gains `nowMs`, `officeTimezone`; `listAllDesks` reads `today` once via `officeToday`, resolves `displayStatusPredicate('confirmed', today)`, runs both repository calls via `Promise.all`, tallies into a `Map`, maps `bookedAhead: counts.get(row.id) ?? 0`; docblock rewritten — it is no longer "a pure mapping, no clock read"), `desks.service.spec.ts` (modify — a desk with 3 upcoming Confirmed bookings reports `3`; a second desk's bookings never leak into the first; a desk with only a past Confirmed booking reports `0`; a desk with only a future Cancelled booking reports `0`; `officeToday`/`nowMs` read exactly once) |
| Verify   | `npm test -w apps/api -- desks.service` — tests named `(US-016/AC-04)` and `(US-016/AC-05)` pass |

### Step 4 — Wire the service's new dependencies

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-04                                                         |
| Files    | `apps/api/src/composition.ts` (modify — `createDesksService({ desks: ..., nowMs, officeTimezone })` at the existing call site) |
| Verify   | `npm run typecheck -w apps/api` — no type error at the call site |

### Step 5 — Extend the existing route tests for the new field and re-title AC-01/AC-10

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-01, FR-04, FR-05, FR-10                                    |
| Files    | `apps/api/src/modules/admin/admin.routes.spec.ts` (modify — extend the `toEqual` body assertion at the existing `GET /api/admin/desks` block to include `bookedAhead`; extend all four `DesksRepository` stub literals with the new method; re-title the existing Employee-403 test to cite `US-016/AC-10` alongside `US-014/AC-03`; re-title the existing ordering/no-filter test to cite `US-016/AC-01`; add a case proving `bookedAhead` reaches the body correctly for a seeded desk), `admin.router.ts` (modify — docblock only, per `design-note.md` §8.3; no handler change) |
| Verify   | `npm test -w apps/api -- admin.routes` — all extended and new cases pass |

### Step 6 — `StatusChip`'s third variant

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-02, FR-03, NFR-02                                          |
| Files    | `apps/ui/src/assets/icon-block.svg` (create — Figma node `11:43`), `apps/ui/src/assets/icon-plus.svg` (create — Figma node `192:40`), `apps/ui/src/components/status-chip/StatusChip.tsx` (modify — add `{ kind: 'inventory'; status: 'active' \| 'inactive' }` to `StatusChipProps`, export `INVENTORY_LABEL`, render check-circle/block icon per status, docblock updated per `design-note.md` §8.4), `status-chip.css` (modify — `.status-chip--active` reuses the available role's tokens, `.status-chip--inactive` reuses the existing inactive role — see D-04), `StatusChip.spec.tsx` (modify — `kind="inventory"` renders the word **and** an icon per status; the inactive variant carries no danger-family class) |
| Verify   | `npm test -w apps/ui -- StatusChip` — tests named `(US-016/AC-02)` and `(US-016/AC-03)` pass |

### Step 7 — Move the desk fetch to `lib/` (D-01)

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | (enables FR-06 through FR-11)                                 |
| Files    | `apps/ui/src/lib/fetch-desks.ts` (create, moved from `screens/all-bookings/`), `apps/ui/src/lib/use-desks.ts` (create, moved), `apps/ui/src/lib/use-desks.spec.ts` (create, moved — citations unchanged), `apps/ui/src/screens/all-bookings/{fetch-desks.ts,use-desks.ts,use-desks.spec.ts}` (delete), `apps/ui/src/screens/all-bookings/AllBookings.tsx` (modify — import paths only), `knowledge/traceability/manifest.json` (modify — update the moved spec file's path in US-014's `tests[]` entry) |
| Verify   | `npm test -w apps/ui -- all-bookings` — unaffected, still green; `npm run check` — `aidlc-check` still resolves US-014's manifest entry |

### Step 8 — Screen copy: booked-ahead label, summary line, disabled-control reasons

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-05, FR-11                                                   |
| Files    | `apps/ui/src/screens/desks/copy.ts` (create — `bookedAheadLabel(count)` per D-03, `summaryLine(desks)` deriving the "N desks · M active, K inactive" line client-side per `design-note.md` §3.2, the disabled-control reason string per D-02), `copy.spec.ts` (create) |
| Verify   | `npm test -w apps/ui -- screens/desks/copy` — new tests pass |

### Step 9 — `DeskInventorySkeletonRow`

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-07                                                          |
| Files    | `apps/ui/src/screens/desks/DeskInventorySkeletonRow.tsx` (create — table/card/card-compact variants at 64px/80px/156px, matching `DeskInventoryRow`'s real heights, per `design-note.md` §5.2) |
| Verify   | visual check against the Figma frame only; behaviour covered by `Desks.spec.tsx` in Step 11 |

### Step 10 — `DeskInventoryRow`

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-02, FR-05, FR-08, FR-11                                     |
| Files    | `apps/ui/src/screens/desks/DeskInventoryRow.tsx` (create — table `<tr>` at 1024px+, card `<li>` below, per D-05's naming; renders `StatusChip kind="inventory"`, `bookedAheadLabel`, disabled **Edit** and **Deactivate**/**Activate** buttons each with the D-02 reason as `title` + visually-hidden span), `DeskInventoryRow.spec.tsx` (create — AC-02 word+icon, AC-05 dash+accessible text, AC-08 both actions present in both trees, AC-11's disabled+reason) |
| Verify   | `npm test -w apps/ui -- DeskInventoryRow` — tests named `(US-016/AC-02)`, `(US-016/AC-05)`, `(US-016/AC-08)` pass |

### Step 11 — `Desks` screen

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-06, FR-07, FR-09, FR-11                                     |
| Files    | `apps/ui/src/screens/desks/Desks.tsx` (create — loading branch renders `DeskInventorySkeletonRow` in both trees with **Add desk** enabled; error branch renders `Alert tone="danger"` with **Try again**, no table, **Add desk** entirely absent; empty branch renders `EmptyState` with SCR-006's copy and a disabled **Add desk**; ready branch renders the summary line (`role="status"`), the table tree and the card tree of `DeskInventoryRow`s, and the header's own disabled **Add desk**), `Desks.spec.tsx` (create — one case per AC: AC-01, AC-06, AC-07 [including the hidden-vs-disabled distinction], AC-09's structural absences, AC-11's per-control disabled+reason with each assertion titled after the story that will edit it) |
| Verify   | `npm test -w apps/ui -- screens/desks/Desks` — tests named `(US-016/AC-06)`, `(US-016/AC-07)`, `(US-016/AC-09)` pass |

### Step 12 — Responsive CSS

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-08                                                          |
| Files    | `apps/ui/src/screens/desks/desks.css` (create — table shown / card list `display:none` above 1024px and the reverse below, per `design-note.md` §7.1; `.desks__visually-hidden` utility, screen-private per the existing no-global-utility rule) |
| Verify   | `npm test -w apps/ui -- screens/desks` — the CSS-boundary assertions from Step 11 pass |

### Step 13 — Route

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-10                                                          |
| Files    | `apps/ui/src/routes.tsx` (modify — add `<Route path="/admin/desks" element={<RequireRole role="admin"><Desks /></RequireRole>} />` beside `/admin/bookings`) |
| Verify   | `npm test -w apps/ui -- Desks` — a rendered-at-`/admin/desks` test with an Employee session redirects to `/bookings`; with an Admin session it renders the screen |

### Step 14 — Documentation and traceability closeout

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | (all — required by `aidlc-check`)                              |
| Files    | `apps/api/src/modules/desks/README.md` (modify — record the new `bookings` read, its `desk_id`-only select and why, the borrowed predicate, the forward constraint on US-019; fix the stale `US-015/US-017` cross-reference per `design-note.md` §8.1), `libs/contracts/src/desks.ts` (docblock only, already done in Step 1), `admin.router.ts` (docblock only, already done in Step 5), `StatusChip.tsx` (docblock only, already done in Step 6), `inception/specs/index.md` (modify — add the US-016 row), `knowledge/traceability/manifest.json` (modify — add US-016's `requirements[]`/`acs[]`/`tests[]` entries), `inception/specs/US-016-see-the-desk-inventory/traceability.md` (modify — every row's Status becomes `implemented` with real file/test paths) |
| Verify   | `npm run check` — `aidlc-check` passes; `npm run lint && npm run typecheck && npm test` — full suite green |

## Rollback

Revert the PR. No migration and no data write exists to roll back separately — the change is additive on the wire and new/moved files only. The one non-code artifact touched outside this story's folder is `knowledge/traceability/manifest.json`'s US-014 entry (a moved file path); reverting the PR restores that line along with everything else, so no separate rollback step is needed there either.

## Open questions

| Question                                         | Owner         | Blocks |
| --------------------------------------------------- | ----------------- | -------- |
| Exact reason string on each disabled control (placeholder: "Not available yet — coming in a later release.", D-02) | `/ux` + PO | none — ships with the placeholder, revisited as copy polish |
| Booked-ahead singular/plural and the dash's accessible text (placeholders in D-03) | `/ux` + PO | none — ships with the placeholder |
| Whether the "visible-but-disabled unbuilt control" pattern should become an ADR now that it will recur for SCR-007/SCR-008 (design note §8, open item 6) | Joy Joshua | nothing in this story |

None of these block Step 1–14: each has a shipped default recorded in `decisions.md`, and the table above exists so they are not forgotten rather than because they gate the plan.
