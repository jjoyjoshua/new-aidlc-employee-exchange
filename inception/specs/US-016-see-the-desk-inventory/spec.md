# US-016 — See the desk inventory and how many people hold each desk

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                   |
| ----------------- | ------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-016-see-the-desk-inventory.md` |
| **Traces to**     | REQ-017, BR-001.4, BR-001.9, V-07, NFR-008, NFR-001 |
| **Screen**        | SCR-006 — Desks. ST-01 Default, ST-02 Loading, ST-03 Empty, ST-04 Load error only. ST-05–ST-10 (deactivate/activate flow) are US-019's |
| **Covering ADRs** | ADR-002 (shared contract package), ADR-004 (table ownership) — applied, none new (`design-note.md` §8) |
| **Tier**          | Complex                                            |
| **Status**        | implemented                                        |
| **Updated**       | 2026-09-19                                          |

## Problem

Today `GET /api/admin/desks` returns `{ id, deskNumber, isActive }` for every desk (built by US-014 for its filter dropdown), and no screen renders it as an inventory. The sidebar already links to `/admin/desks` (`AppShell.tsx:33`), but no route exists there, so the link 404s via the catch-all. An administrator has no way to see which desks exist, whether each is Active or Inactive, or how many upcoming bookings a desk holds — the fact US-019's deactivation block depends on and must not silently disagree with.

The system must add a `bookedAhead` count to the existing desk response, and build the `/admin/desks` screen that renders the full inventory — table at 1280px, cards at 768px and 360px — with loading, empty and error states, admin-only.

## Functional requirements

| ID    | Requirement                          | Priority | Serves | Status      |
| ----- | ------------------------------------- | -------- | ------ | ----------- |
| FR-01 | `GET /api/admin/desks` continues to return every desk, active and inactive, ordered by desk number | Must | AC-01 | not started |
| FR-02 | Each desk row renders its state as an icon-plus-word chip reading "Active" or "Inactive" | Must | AC-02 | not started |
| FR-03 | The Inactive chip uses the quiet-neutral fill/border/ink role (`--c-state-inactive-*`), never the danger family | Must | AC-03 | not started |
| FR-04 | `GET /api/admin/desks` additionally returns `bookedAhead`: the count of that desk's Confirmed bookings dated the office's today or later, computed via `displayStatusPredicate('confirmed', today)` — the same predicate US-019's block must use | Must | AC-04 | not started |
| FR-05 | `bookedAhead` is a required, non-negative integer (never absent) on the wire; the UI renders `0` as an em dash paired with accessible text, never a blank cell | Must | AC-05 | not started |
| FR-06 | An empty inventory renders `EmptyState` with SCR-006's copy and an **Add desk** action (disabled, per FR-11); the page header keeps its own **Add desk** action alongside it | Must | AC-06 | not started |
| FR-07 | While loading, skeleton rows render at the row's real height in both the table and card trees, with **Add desk** enabled; on a load failure, an `Alert` (tone danger) with **Try again** renders in place of the table, and **Add desk** is hidden (not merely disabled) | Must | AC-07 | not started |
| FR-08 | **Edit** and the activate/deactivate action are both directly visible on every row at 1280px, 768px and 360px, with no overflow menu | Must | AC-08 | not started |
| FR-09 | The screen has no search field, filter bar, or delete action | Must | AC-09 | not started |
| FR-10 | The screen and its data are refused to a signed-in Employee (client redirect to `/bookings`; server 403 `admin_only`, inherited from the `/api/admin` mount) | Must | AC-10 | not started |
| FR-11 | **Add desk** (header and empty state), **Edit**, and **Deactivate**/**Activate** render as real, correctly labelled, correctly positioned controls that are `disabled`, each carrying an accessible reason — because US-017/US-018/US-019 (their destinations) do not exist yet | Must | AC-06, AC-08 | not started |

## Non-functional requirements

| ID     | Requirement                                    | Serves           |
| ------ | ----------------------------------------------- | ---------------- |
| NFR-01 | "Today" for FR-04 is the office's own calendar date (NFR-001), resolved from one clock reading per request — never the browser's, never re-read a second time in the same request | AC-04, AC-05 |
| NFR-02 | State is never colour-only (NFR-008): the Active/Inactive chip carries an icon and a word; the quiet-neutral role is a second cue via the (absent) border | AC-02, AC-03 |

## Technical constraints

- Extend the existing `GET /api/admin/desks` endpoint and `adminDeskSchema` additively (`bookedAhead`); do not add a second endpoint (`design-note.md` §3).
- The count is one extra query (`desk_id` list, `status = confirmed`, `booking_date >= today`), tallied in the service — never a PostgREST embedded aggregate and never N+1 (`design-note.md` §2.2).
- Never write `status = 'confirmed'` or the `>= today` bound literally in `modules/desks`; both must come from `displayStatusPredicate('confirmed', today)` in `apps/api/src/domain/booking-history.ts`, unmodified (`design-note.md` §2.4).
- `StatusChip` gains a third discriminant, `kind: 'inventory'`, with its own `INVENTORY_LABEL` — never rendered via `kind: 'desk'` (`design-note.md` §4).
- No change to `inception/design/tokens.css`: the Active chip binds `--c-state-available-*`, Inactive binds `--c-state-inactive-*`; both already exist in both themes (`design-note.md` §0.2, §4.3).
- No migration: `bookings_desk_id_booking_date_idx` and `bookings_booking_date_status_idx` already serve this read (`design-note.md` §0.2).
- No new prop on `Button`, `EmptyState`, or `Alert` — compose them as they are (`design-note.md` §4.3, §7.3).
- Table/card responsive switch follows the existing zero-`matchMedia`, dual-tree/CSS pattern from `all-bookings/` (`design-note.md` §7.1), with the 1024px boundary (not 768px).
- Screen-private components under `apps/ui/src/screens/desks/`, mirroring `AdminBookingRow`/`AdminSkeletonRow`'s screen-private precedent (`design-note.md` §5.1).
- `fetch-desks.ts`/`use-desks.ts` move to `apps/ui/src/lib/` as the desk-list fetch now has two consumers (`design-note.md` §5.3) — see `decisions.md` D-01.

## Out of scope

- Any working destination for **Add desk**, **Edit**, **Deactivate**, or **Activate** — those are US-017, US-018, and US-019 respectively. This story renders the controls disabled only.
- Search, filtering, or deletion of desks (AC-09) — deactivation (US-019) is the only retirement path.
- Wiring this screen to `apps/ui/src/lib/data-refresh.ts` — the story's own edge case excludes it.
- A design-token change for an `--c-state-active-*` role — the Figma component binds the existing `--c-state-available-*` role instead (open item 4, UX's to consider later, not blocking).
- An ADR for the "visible-but-disabled unbuilt control" pattern — recorded here and in the design note; promoting it to an ADR is open item 6, not this story's call.
