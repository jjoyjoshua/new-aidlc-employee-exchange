# PR: feat(admin): see the desk inventory and how many people hold each desk [US-016]

## Linked artifacts

- Story: `inception/stories/user-stories/US-016-see-the-desk-inventory.md` (Gate 1 baseline: `177360d9cd05626fa8d6f515c40ad692fed6d0df`)
- Design note: `inception/specs/US-016-see-the-desk-inventory/design-note.md` (Architect, advisory)
- ADR: none — see `decisions.md` and the design note §8 for why

## AC → evidence

| AC | Implemented in | Proven by (test name) |
| --- | --- | --- |
| AC-01 | `desks.repository.ts`'s `listAllDesks` (unchanged, no `is_active` filter, ordered `desk_number`) | `admin.routes.spec.ts`: `'returns an inactive desk alongside active ones, ordered — inactive desks stay findable (US-014/AC-03, US-016/AC-01)'` |
| AC-02 | `StatusChip.tsx`'s new `kind: 'inventory'`, `INVENTORY_LABEL` | `StatusChip.spec.tsx`: `'renders the word "Active" plus an icon (US-016/AC-02)'`, `'renders the word "Inactive" plus an icon, never "Available"/"Taken" (US-016/AC-02)'` |
| AC-03 | `status-chip.css`'s `.status-chip--inactive` (reuses the existing `--c-state-inactive-*` role) | `StatusChip.spec.tsx`: `'the Inactive variant carries the quiet-neutral class, never a danger-family one (US-016/AC-03)'` |
| AC-04 | `desks.repository.ts`'s `listUpcomingConfirmedDeskIds`; `desks.service.ts`'s tally via `displayStatusPredicate('confirmed', today)` | `desks.repository.spec.ts`: `'selects desk_id ONLY from bookings, filtered to the given status and >= the given date, no order'`; `desks.service.spec.ts`: `'tallies three confirmed upcoming bookings on one desk to bookedAhead: 3'`; `admin.routes.spec.ts`: `'reports bookedAhead per desk, tallied from the confirmed-upcoming reads (US-016/AC-04, AC-05)'` |
| AC-05 | `libs/contracts/src/desks.ts`'s `bookedAhead: z.number().int().nonnegative()` (required); `copy.ts`'s `bookedAheadLabel`/`bookedAheadAccessibleText` | `desks.spec.ts` (contracts): `'rejects a missing bookedAhead — AC-05 requires the field, never its absence'`; `desks.service.spec.ts`: `'AC-05: a desk with no matching bookings reports 0, never undefined or omitted'`; `DeskInventoryRow.spec.tsx`: `'renders zero booked-ahead as an em dash paired with accessible words, never blank (US-016/AC-05)'` |
| AC-06 | `Desks.tsx`'s empty branch (`EmptyState` + disabled **Add desk**) | `Desks.spec.tsx`: `'renders the empty state with no table and a disabled Add desk action'` |
| AC-07 | `Desks.tsx`'s loading/error branches; `DeskInventorySkeletonRow.tsx` | `Desks.spec.tsx`: `'renders skeleton rows in both trees while loading, with Add desk present (US-016/AC-07)'`, `'on a load failure, shows the alert with Try again, no table, and Add desk entirely absent (US-016/AC-07)'` |
| AC-08 | `DeskInventoryRow.tsx` (Edit + Deactivate/Activate, both trees); `desks.css`'s 1024px/768px breakpoints | `DeskInventoryRow.spec.tsx`: `'renders both Edit and Deactivate as present, correctly labelled controls (US-016/AC-08)'`, `'never renders an overflow/more menu (US-016/AC-08)'`; `Desks.spec.tsx`: `'renders exactly one Edit control per desk in each tree, and no "more" control'` |
| AC-09 | `Desks.tsx` (structural absence); `admin.router.ts`'s `GET /desks` (no query parameters) | `Desks.spec.tsx`: `'has no textbox, combobox, or a control named search/filter/delete/remove (US-016/AC-09)'` |
| AC-10 | Inherited: `require-admin.ts` (server mount), `RequireRole` (client, `routes.tsx`'s new `/admin/desks`) | `admin.routes.spec.ts`: `'refuses an Employee session with 403 (US-014/AC-03, US-016/AC-10)'`; `Desks.spec.tsx`: `'an Employee session is redirected to /bookings, never shown the inventory'` |

**AC-06 and AC-08's controls (Add desk, Edit, Deactivate/Activate) render visible and `disabled`, each with an accessible reason** — their destinations (US-017, US-018, US-019) do not exist yet (design note §6, confirmed with the human before implementation). Every such control has its own positive test asserting it is present, correctly labelled, `disabled`, and carries the reason — see `DeskInventoryRow.spec.tsx` and `Desks.spec.tsx`'s `"— US-017/018/019 remove this"`-titled tests, which those stories must edit to ship.

## Command output (pasted, not summarized)

```
$ npm run lint
> eslint .
(no output — clean)

$ npm run typecheck
> tsc -p tsconfig.json --noEmit   (contracts, build)
> tsc -p tsconfig.json --noEmit   (api)
> tsc -p tsconfig.json --noEmit   (ui)
> tsc -p tsconfig.json --noEmit   (contracts)
(no errors)

$ npm test
> @desk-booking/api@0.1.0 test
 Test Files  19 passed | 1 skipped (20)
      Tests  356 passed | 6 skipped (362)

> @desk-booking/ui@0.1.0 test
 Test Files  56 passed (56)
      Tests  528 passed (528)

> @desk-booking/contracts@0.1.0 test
 Test Files  7 passed (7)
      Tests  145 passed (145)

$ node tools/aidlc-check.mjs
aidlc-check: OK (framework 0.5.0, 519 IDs, 36 warnings)
```

## Verification gaps — disclosed, not hidden

1. **No live manual check in a running browser.** This environment has no backing Supabase/Postgres project to sign in against, so the screen has not been visually confirmed pixel-for-pixel against the Figma frames in a live app — only against the frames themselves (fetched via the Figma MCP tools before implementation) and 35 automated component tests covering both the table and card DOM trees at their CSS breakpoints. Please do a live check at 1280/768/360px before merging, particularly the 1024px table/card boundary and the card-compact action-button widths.
2. **`libs/contracts/src/desks.ts`'s `desks.spec.ts` fixture `VALID_DESK` and every other `AdminDesk` test fixture across the UI (`AllBookings.spec.tsx`, `FilterBar.spec.tsx`) were updated to include `bookedAhead` — a mechanical, expected consequence of adding a required field, called out here so it reads as intentional rather than scope creep.**

## QA evidence

- Positive, negative and boundary cases per AC are listed in `design-note.md` §10's test-placement table and implemented as described above.
- Edge cases from the story's own notes: a desk with only a past Confirmed booking, and a desk with only a future Cancelled booking, both proven to report `bookedAhead: 0` by the repository's own query-shape assertion (`.eq('status','confirmed').gte('booking_date', today)` and nothing wider) — the same level this codebase proves date/status filtering at without a real database (`admin-bookings.repository.spec.ts`'s own precedent).
- The PostgREST-embedded-aggregate approach the design note flags as the highest-risk wrong turn (§2.2) was not used; `desks.service.spec.ts`'s `'does not let one desk's bookings leak into another's count'` test is the one that would catch a cross-desk tally bug.
- No screenshots — see Verification gaps above.

## Checklist

- [x] Self-reviewed against `ai/quality/review-checklist.md`
- [x] `knowledge/traceability/manifest.json` updated; `node tools/aidlc-check.mjs` green locally
- [ ] Regression test citing the issue — n/a, this is a new story, not a bug fix
- [x] No unrelated changes; docs updated (`apps/api/src/modules/desks/README.md`, `libs/contracts/src/desks.ts`'s docblock, `admin.router.ts`'s docblock, `StatusChip.tsx`'s docblock, this spec package, US-014's own `traceability.md`/`change-log.md` for the moved `use-desks`/`fetch-desks` files)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
