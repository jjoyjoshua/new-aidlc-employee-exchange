# US-018 — Correct a desk number

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| **Story**         | `inception/stories/user-stories/US-018-correct-a-desk-number.md`                                 |
| **Traces to**     | REQ-016, BR-001.4, BR-001.8, BR-001.19, V-08, V-16                                                |
| **Screen**        | SCR-007 ST-02 (reusing ST-03, ST-04, ST-05, ST-07 unmodified)                                     |
| **Covering ADRs** | none — see `design-note.md` §8: two consequential edits to `ai/standards/api-standards.md` and the `desks` module README instead |
| **Tier**          | Complex — a new write operation (`PATCH`), two new request/response schemas in a protected path, and one additive prop on a shared component (`design-note.md` §0) |
| **Status**        | implemented                                                                                       |
| **Updated**       | 2026-09-19                                                                                        |

## Problem

Today a desk's number can only be set once, at creation (`POST /api/admin/desks`). There is no way to correct a typo without deleting and re-adding the desk — which the system also does not support, since desks are never deleted (`0002_desks.sql:16-18`) and a delete would orphan or block on its booking history. The administrator must be able to change a desk's number in place, with its identity, its booking history, and every place that number is displayed following the change automatically, and with the one real cost of doing so — an upcoming holder finding out only when they arrive — stated honestly before the change is saved.

## Functional requirements

| ID    | Requirement                                                                                                    | Priority | Serves      | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------| -------- | ----------- | ----------- |
| FR-01 | `PATCH /api/admin/desks/:id` updates the named desk's `desk_number` and returns the updated desk               | Must     | AC-01       | implemented  |
| FR-02 | The request body is validated and normalised by the same `deskNumberSchema` the create path uses               | Must     | AC-02       | implemented  |
| FR-03 | A format failure is refused client-side before any request is sent, and server-side as defence in depth        | Must     | AC-02       | implemented  |
| FR-04 | A collision (case-normalised, whitespace-trimmed) with a different desk is refused as `409 desk_number_taken`  | Must     | AC-02       | implemented  |
| FR-05 | No pre-check precedes the update; the unique index is the sole arbiter, so renaming to the desk's own current number never collides | Must | AC-07 | implemented  |
| FR-06 | The rename is permitted regardless of how many upcoming Confirmed bookings the desk holds — nothing blocks it  | Must     | AC-03       | implemented  |
| FR-07 | Opening the edit form shows how many people hold the desk (from the count already loaded) and that they will not be told, when the count is non-zero | Must | AC-04 | implemented  |
| FR-08 | The warning does not render when the desk has no upcoming Confirmed bookings                                   | Must     | AC-04       | implemented  |
| FR-09 | The rename sends no email or push notification                                                                 | Must     | AC-05       | implemented  |
| FR-10 | Every read that shows a booking's desk number (the employee's own list, the administrator's list, the desk filter) resolves it live via the desk's id, never a copied string | Must | AC-06 | implemented  |
| FR-11 | The inventory list re-sorts by the new number after a save, in place, without a refetch                        | Must     | AC-01       | implemented  |
| FR-12 | The save is guarded against a double submit and, on a non-duplicate failure, retains the entry and offers a retry | Must   | AC-08       | implemented  |
| FR-13 | A non-admin session is refused                                                                                 | Must     | AC-09       | implemented  |

## Non-functional requirements

| ID     | Requirement                                                                                          | Serves |
| ------ | ----------------------------------------------------------------------------------------------------- | ------ |
| NFR-01 | ST-02's upcoming-bookings note is associated with the field via `aria-describedby`, not merely adjacent to it (NFR-008) | AC-04  |
| NFR-02 | No new migration, no new error code, no new shared component — the write rides the existing schema, guard chain and dialog shell (`design-note.md` §0.2) | — |

## Technical constraints

- `deskNumberSchema`, `DESK_NUMBER_PATTERN` and `normalizeDeskNumber` (`libs/contracts/src/desks.ts`) are reused verbatim, never restated — AC-02's "same rules as create" is true because it is the same object.
- No pre-check `SELECT` precedes the update. The unique index (`desks_desk_number_key`) is the sole arbiter, per `ai/standards/api-standards.md`'s "where a unique index arbitrates, let it" rule — and per `design-note.md` §2.3, a pre-check would simultaneously reintroduce the AC-02 race and break AC-07.
- The `WHERE` clause of the update targets `id`, never `desk_number` — this is what makes the desk's identity and booking history survive the rename (AC-01, AC-06).
- `updated_at` is set explicitly by the application on every rename (`design-note.md` §2.4) — there is no trigger, and none is added.
- No fresh server read of the upcoming-booking count precedes rendering the warning. The count already on the loaded `AdminDesk` is authoritative enough because nothing is gated on it (`design-note.md` §4) — this is the opposite of US-019's requirement and must not be generalised to it.
- `DeskFormDialog` is extended with `mode: 'add' | 'edit'` rather than split into two components (`design-note.md` §6.1) — its docblock already anticipated this.

## Out of scope

- Any activate/deactivate control, `isActive` in any request body, or a `bookedAhead`-based block on saving — that is US-019's, and building any part of it here is a direct AC-03 violation ("the change is permitted — not blocked").
- A status radio on this form in either mode — issue #49 is an add-mode disagreement only; both the story and every ST-02 frame agree edit mode has none.
- A route (`/admin/desks/:id/edit`) — the form stays a dialog over `/admin/desks`, as US-017 already established and this story continues.
- A migration of any kind, including a case-insensitive index or a `citext` column — the existing CHECK constraint already makes the plain unique index case-normalisation-sufficient for updates as well as inserts (`design-note.md` §2.1).
- Denormalising the desk number onto a booking row — AC-06 requires the opposite, and the read paths already join live.
