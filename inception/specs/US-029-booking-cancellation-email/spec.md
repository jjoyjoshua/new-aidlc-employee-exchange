# US-029 — Get a cancellation email when my booking is voided

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do.

|                   |                                                                        |
| ----------------- | -------------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-029-booking-cancellation-email.md`    |
| **Traces to**     | REQ-024, BR-001.13, BR-001.18, BR-001.20, V-13                           |
| **Screen**        | none — no UI                                                               |
| **Covering ADRs** | none                                                                      |
| **Tier**          | Medium                                                                    |
| **Status**        | implemented                                                               |
| **Updated**       | 2026-09-21                                                                |

## Problem

Three write paths cancel a booking — the owner themselves (US-011), an admin on their behalf
(US-015), and the deactivation cascade (US-025) — and none of them tells the owner. US-028 built
the composer pattern (`notifications.service.ts`) and US-034 built the transport/log this story
needs; this story is the second and third and fourth caller of that same module, adding its own
`sendBookingCancellation` composer the same way US-028 added `sendBookingConfirmation`.

## Functional requirements

| ID    | Requirement                                                                                                                                                  | Priority | Serves                                   | Status      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------- | ----------- |
| FR-01 | `notifications.service.ts` exposes `sendBookingCancellation(input)`, composing subject/body from `deskNumber`/`date`/`cancellationSource` (owner/admin/cascade), then calling `recordAndSend` | Must     | AC-01, AC-02, AC-04, AC-05, AC-06, AC-08     | implemented |
| FR-02 | `bookings.repository.ts`'s `cancelOwnedBooking` returns `desk_id`/`booking_date` alongside `id` so the owner-cancel path can compose without a second query      | Must     | AC-01, AC-02                                 | implemented |
| FR-03 | `bookings.router.ts`'s `POST /:id/cancel` calls `sendBookingCancellation` on `outcome.kind === 'ok'`, using the session's own email and `cancellationSource: 'owner'` | Must     | AC-01, AC-02, AC-05, AC-07, AC-08, AC-10     | implemented |
| FR-04 | `admin-bookings.repository.ts`'s `cancelAnyBooking` reads back the desk number and the owner's current email after a successful cancel                           | Must     | AC-01, AC-02, AC-04, AC-07                   | implemented |
| FR-05 | `admin.router.ts`'s `POST /bookings/:id/cancel` calls `sendBookingCancellation` on `outcome.kind === 'ok'`, using the looked-up owner email and `cancellationSource: 'admin'` | Must     | AC-01, AC-02, AC-04, AC-07, AC-08, AC-10     | implemented |
| FR-06 | `users.service.ts`'s `DeactivateAccountOutcome`'s `ok` branch also carries `cancelledBookings` (desk/date per row), already computed by the repository but currently discarded to a count | Must     | AC-03, AC-06                                 | implemented |
| FR-07 | `admin.router.ts`'s `POST /users/:id/deactivate` sends one `sendBookingCancellation` per cancelled booking, `cancellationSource: 'deactivation_cascade'`, never a summary | Must     | AC-03, AC-04, AC-06, AC-07, AC-08, AC-10     | implemented |
| FR-08 | AC-09's one-email guarantee needs no new code — only the write that actually lands reaches `outcome.kind === 'ok'` on any of the three paths; a losing concurrent attempt never reaches the notify call | Must     | AC-09                                        | implemented |

## Non-functional requirements

None beyond what US-034 already established (NFR-005, NFR-007) — this story adds no new
non-functional surface.

## Technical constraints

- No literal wording lives outside `notifications` — the module composes the message, the three
  callers hand over facts (`modules/README.md`'s charter, US-028/D-01's precedent).
- No transaction spans any send — each call happens after its own write already committed.
- No new dependency, no schema change, no new config key, no new endpoint.
- `cancellation_source` is read back from the row that was actually written, never inferred by
  comparing ids (`0003_bookings.sql`'s own instruction to this story).

## Out of scope

- The reminder email (US-030) and push alerts (US-031, US-032) — each is its own story and its
  own `send*`/channel inside or beside `notifications`.
- Choosing the real mail provider — still `TBD (owner: IT)`, US-034's concern.
- Exact transactional copy beyond what AC-04's example fixes — drafted here as a default (D-05),
  open to the human's edit before `go`.
