# US-012 — Refresh the booking list on regaining focus

|                   |                                                                          |
| ----------------- | -------------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-012-refresh-booking-list-on-focus.md`  |
| **Traces to**     | REQ-036                                                                     |
| **Screen**        | SCR-002 (My bookings) — SCR-005 (All bookings) is out of scope, see below   |
| **Covering ADRs** | ADR-008 (shared focus-regain module; no new dependency; invalidation deferred) |
| **Tier**          | Complex                                                                     |
| **Status**        | implemented                                                                 |
| **Updated**       | 2026-09-19                                                                  |

## Problem

Today, `MyBookings` fetches its list once on mount (`use-my-bookings.ts`) and never again unless the employee presses **Try again** on a hard error or cancels a booking in the same tab. A booking cancelled by someone else — an Admin (US-015, not yet built), a deactivation cascade (US-025, not yet built), or the same employee in a second tab (US-011, already shipped) — keeps rendering as **Confirmed** until the employee reloads the page by hand. The system must instead re-fetch and reconcile that list whenever the browser window or tab regains focus, without disturbing an open cancel confirmation and without a jarring reload.

## Functional requirements

| ID    | Requirement | Priority | Serves | Status |
| ----- | ----------- | -------- | ------ | ------ |
| FR-01 | `apps/ui/src/lib/data-refresh.ts` exposes `useFocusRefresh(refresh, { enabled })`, backed by exactly one `document`/`window` event-listener pair for the whole app (ADR-008) | Must | AC-01 | implemented |
| FR-02 | When both `visibilitychange` (→ `visible`) and `focus` fire for the same regain, subscribers are called once, not twice | Must | AC-01, edge case "rapid focus changes" | implemented |
| FR-03 | A second, later regain still calls subscribers — the coalescing in FR-02 is per-regain, not a standing suppression | Must | edge case "rapid focus changes" | implemented |
| FR-04 | `useMyBookings` gains `refreshQuietly()`: re-fetches the default page and merges it into `items` by `id` (updates fields of known rows, prepends unseen ones), without ever setting `status: 'loading'` | Must | AC-01, AC-02, AC-03 | implemented |
| FR-05 | `refreshQuietly()` never modifies `nextBefore` or any page already appended by `loadOlder()` | Must | AC-03 | implemented |
| FR-06 | A failed `refreshQuietly()` sets `quietRefreshFailed: true` and leaves `items`/`today`/`nextBefore` exactly as they were | Must | AC-04 | implemented |
| FR-07 | `MyBookings` renders an inline, retryable notice (existing `Alert`, `tone="warning"`) when `quietRefreshFailed` is true, without replacing the list | Must | AC-04 | implemented |
| FR-08 | `MyBookings` passes `enabled: false` to `useFocusRefresh` whenever the cancel confirmation dialog is open, so no refresh fires until it closes | Must | AC-05 | implemented |
| FR-09 | A second, concurrent `refreshQuietly()` call while one is already in flight is a no-op | Should | edge case "in-flight refresh not duplicated" | implemented |

## Non-functional requirements

None new. NFR-001 (office-local dates) governs `today`/`date` handling already exercised by the reused fields; this story does not add a new limit or guarantee of its own.

## Technical constraints

- Must use the shared singleton in `apps/ui/src/lib/data-refresh.ts` (ADR-008) — no screen may add its own `visibilitychange`/`focus` listener. `ai/standards/task-surfaces.md:61-64` makes the data-fetching layer's configuration Complex precisely to stop that duplication.
- No new dependency (ADR-008 rejected adopting a query/cache library for this story).
- `Alert` (FR-07) is used with only its existing props (`tone`, `actions`, `live`) — adding a new prop would itself be a Complex "shared component contract" change and is out of scope.
- `refreshQuietly()` must not go through `status: 'loading'`, mirroring the discipline `markCancelled()` already established in the same file (US-011) for exactly the same reason: it would re-announce the loading state over content the employee is already reading.

## Out of scope

- **SCR-005 (All bookings)** — `AllBookings.tsx` is a stub with no list (US-013's scope). AC-06's SCR-005 half is a tracked follow-up, not delivered here (`decisions.md` D-01).
- **Cache invalidation on mutation** — ADR-008 defers this; no story today needs one tab's mutation to update another screen's list within the same tab.
- **Migrating `book-a-desk/use-availability.ts`** onto `useFocusRefresh` — no story requires focus-refresh behaviour on that screen.
