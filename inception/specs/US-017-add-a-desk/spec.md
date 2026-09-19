# US-017 — Add a desk

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                          |
| ----------------- | ------------------------------------------------------------------------ |
| **Story**         | `inception/stories/user-stories/US-017-add-a-desk.md`                    |
| **Traces to**     | REQ-015, BR-001.4, BR-001.8, V-08, V-16                                  |
| **Screen**        | SCR-007 — Desk form (ST-01, ST-03, ST-04, ST-05, ST-06, ST-07), overlaying SCR-006 |
| **Covering ADRs** | ADR-002 (shared contract package), ADR-004 (table ownership) — no new ADR |
| **Design note**   | `design-note.md` (Architect, advisory) — cite section numbers below      |
| **Tier**          | Complex                                                                  |
| **Status**        | implemented                                                              |
| **Updated**       | 2026-09-19                                                               |

## Problem

Today `GET /api/admin/desks` is the only desks endpoint; the `desks` table has never been written to by application code (US-016's own repository docblock says so). The **Add desk** button on the Desks screen renders visible and disabled, carrying an accessible reason, because no add flow exists yet (US-016 §6). This story adds the write path: a `POST /api/admin/desks` endpoint enforcing the desk-number format and case-normalised uniqueness, and a dialog form (SCR-007) that lets an administrator create a desk and see it appear in the inventory immediately, with no page navigation.

## Functional requirements

| ID    | Requirement                                                                                       | Priority | Serves | Status      |
| ----- | --------------------------------------------------------------------------------------------------- | -------- | ------ | ----------- |
| FR-01 | `POST /api/admin/desks` accepts `{ deskNumber }`, normalises it (trim, uppercase), and inserts a new `desks` row, `is_active` defaulting true | Must     | AC-01  | implemented |
| FR-02 | The desk-number format (`^[A-Z]-\d{2}$`) is validated identically by the browser (before submit) and the server (`deskCreateSchema`) | Must     | AC-02  | implemented |
| FR-03 | A lower-case entry is normalised to upper case before both the uniqueness check and storage        | Must     | AC-03  | implemented |
| FR-04 | A duplicate desk number (case-normalised, whitespace-trimmed) is refused with `409 desk_number_taken`, and the dialog names the colliding desk, adding the case-collision sentence only when case caused it | Must     | AC-04  | implemented |
| FR-05 | Uniqueness comparison is case-normalised and whitespace-trimmed, relying on `desks_desk_number_format` + `desks_desk_number_key` — no new index or migration | Must     | AC-05  | implemented |
| FR-06 | A second save while one is in flight issues no second request; the confirming action shows busy with its label kept | Must     | AC-06  | implemented |
| FR-07 | A non-duplicate failure (server error, timeout, lost connection) keeps the entered value, creates nothing, and offers retry | Must     | AC-07  | implemented |
| FR-08 | An Employee session posting to `POST /api/admin/desks` is refused (403), inherited from the existing `requireAdmin` mount | Must     | AC-08  | implemented |
| FR-09 | At 360px the form renders as a bottom sheet with the confirming action reachable, no horizontal scroll | Must     | AC-09  | implemented |
| FR-10 | On success, the new desk is inserted into the in-memory list in number order (no refetch), the summary line recounts, a toast confirms bookability, and focus lands on the new row | Must     | AC-01, AC-06 | implemented |
| FR-11 | `components/dialog/Dialog.tsx` is extracted as a shared shell; `ConfirmDialog` is refactored to compose it with no behavioural change (its own spec file is unedited) | Must     | (enables FR-09, AC-09) | implemented |

## Non-functional requirements

| ID     | Requirement                                                                 | Serves |
| ------ | ---------------------------------------------------------------------------- | ------ |
| NFR-01 | No DB migration — `desks_desk_number_format` + `desks_desk_number_key` already provide format + case-normalised uniqueness (design note §2.1) | AC-05  |
| NFR-02 | No client-side duplicate pre-check against the desk list already in memory — uniqueness is server-arbitrated only (ADR-002:76-79) | AC-04  |

## Technical constraints

- The insert issues no pre-check `SELECT`; the unique index (`desks_desk_number_key`) is the sole arbiter of a duplicate, exactly as `insertConfirmedBooking` does for bookings (design note §2.3).
- The desk-number regex and normaliser live once, in `libs/contracts`, consumed identically by the browser and the route (ADR-002's asymmetry; design note §2.2, §2.4).
- No new client route. The form is a same-screen dialog on `/admin/desks`, opened via local state — the same pattern as the existing admin booking-cancel dialog (design note §4).
- `libs/contracts`, `supabase/migrations/**`, `inception/design/tokens.css`, `apps/api/src/http/middleware/**`, `apps/ui/src/routes.tsx` are protected paths; a diff to any of the last four is a review finding (design note §0.2, §9.1).

## Out of scope

- **The status radio (Active/Inactive choice on add).** SCR-007's approved frames show one; US-017's own edge cases and ACs do not. Built to the story: no radio. Tracked in [issue #49](https://github.com/jjoyjoshua/new-aidlc-employee-exchange/issues/49) as a change-request between the story and the screen spec — human decision, confirmed 2026-09-19.
- Edit mode (`Save changes`, prefilled field, upcoming-bookings warning) — US-018.
- Deactivate/activate, and the count-based block — US-019.
- Any route (`/admin/desks/new` or `/admin/desks/:id/edit`) — design note §4 explains why none is added.
- A new error-shaping convention (field-level validation messages on the wire) — this codebase's routes stay generic on `400`; only the `409` gets a distinguishing code.
