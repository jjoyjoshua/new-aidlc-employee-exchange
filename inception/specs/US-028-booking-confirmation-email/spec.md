# US-028 — Get a confirmation email when my booking is made

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do.

|                   |                                                                        |
| ----------------- | -------------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-028-booking-confirmation-email.md`    |
| **Traces to**     | REQ-023                                                                   |
| **Screen**        | none — no UI                                                               |
| **Covering ADRs** | none                                                                      |
| **Tier**          | Medium                                                                    |
| **Status**        | implemented                                                               |
| **Updated**       | 2026-09-21                                                                |

## Problem

`POST /api/bookings` creates a Confirmed booking and already echoes `confirmationEmail` (the
caller's own address) on its response — but nothing sends that email. US-034 built the mail
transport and the delivery log this story needed; this story is the first caller.

## Functional requirements

| ID    | Requirement                                                                                                                          | Priority | Serves       | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----------- |
| FR-01 | `notifications.service.ts` exposes `sendBookingConfirmation(input)`, composing the confirmation's subject/body from the given desk number and date, then calling `recordAndSend` (US-034) | Must     | AC-01, AC-02, AC-03, AC-04, AC-08 | implemented |
| FR-02 | `bookings.router.ts`'s `POST /` calls and awaits `sendBookingConfirmation` immediately after `outcome.kind === 'ok'`, using `req.user.email` — never a second read of `user_profiles` | Must     | AC-01, AC-06 | implemented |
| FR-03 | The call happens exactly once per successful booking; a retry that lands on `desk_conflict`/`user_conflict` never reaches it | Must     | AC-05        | implemented |
| FR-04 | The call is wrapped in its own `try/catch`; neither a reported failure nor a thrown error from `sendBookingConfirmation` changes the `201` response | Must     | AC-07        | implemented |

## Non-functional requirements

None beyond what US-034 already established (NFR-005, NFR-007) — this story adds no new
non-functional surface.

## Technical constraints

- No literal wording lives in `bookings` — `notifications` composes the message (D-01,
  `modules/README.md`'s own charter).
- No transaction spans the send — the insert already committed by the time it is called
  (`app-architecture.md` §4.1).
- No new dependency, no schema change, no new config key.

## Out of scope

- Push notifications (US-032), cancellation email (US-029), reminder email (US-030) — each is
  its own story and its own `send*` composer inside `notifications`.
- Choosing the real mail provider — still `TBD (owner: IT)`, US-034's concern.
