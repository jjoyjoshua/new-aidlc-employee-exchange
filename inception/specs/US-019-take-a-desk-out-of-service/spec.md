# US-019 — Take a desk out of service, and put it back

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| **Story**         | `inception/stories/user-stories/US-019-take-a-desk-out-of-service.md`                            |
| **Traces to**     | REQ-017, BR-001.7, BR-001.9, V-09                                                                 |
| **Screen**        | SCR-006 ST-05 – ST-10 (ST-01 – ST-04 are US-016's, untouched)                                     |
| **Covering ADRs** | ADR-009 — structured `details` on an error body (`design-note.md` §9, §4.4)                       |
| **Tier**          | Complex — two new write endpoints (`POST /desks/:id/deactivate`, `.../activate`), a new error code, and a change to the shared error-body shape (`design-note.md` §0) |
| **Status**        | implemented                                                                                             |
| **Updated**       | 2026-09-19                                                                                        |

## Problem

Today a desk can be added and renamed, but never taken out of service. A desk under repair still appears in every employee's availability grid, and there is no way to stop it being booked without deleting it — which the system also does not support, since a desk's booking history must survive (`0002_desks.sql:16-18`). The administrator must be able to retire a desk from the bookable pool and bring it back later, without ever cancelling a booking as a side effect of doing so, and with the one real conflict this can create — a desk someone has already booked ahead — refused rather than silently overridden.

## Functional requirements

| ID    | Requirement                                                                                                          | Priority | Serves | Status      |
| ----- | --------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------- |
| FR-01 | `POST /api/admin/desks/:id/deactivate` sets the named desk's `is_active` to `false` and returns the updated desk       | Must     | AC-01  | implemented |
| FR-02 | `POST /api/admin/desks/:id/activate` sets the named desk's `is_active` to `true` and returns the updated desk, with no rule to satisfy | Must | AC-01, AC-09 | implemented |
| FR-03 | A booking request naming an inactive desk is refused server-side — already true (`bookings.service.ts:181`); this story adds the test, not the code | Must | AC-02 | implemented |
| FR-04 | Deactivating an eligible desk shows a confirmation stating what happens and that past bookings are kept, before the request is sent | Must | AC-03 | implemented |
| FR-05 | A desk holding one or more Confirmed bookings dated today or later refuses deactivation, and the refusal states exactly how many | Must | AC-04 | implemented |
| FR-06 | The blocking count is computed inside the deactivate request, from the database, using `displayStatusPredicate('confirmed', today)` — never from a client-supplied or previously-loaded number | Must | AC-04, AC-08 | implemented |
| FR-07 | The blocking count reaches the browser as a typed field on the `422 desk_has_upcoming_bookings` response body (ADR-009), not embedded in the message string | Must | AC-04 | implemented |
| FR-08 | The blocked dialog's footer offers exactly two controls — dismiss and a navigation — and no control that cancels bookings | Must | AC-05 | implemented |
| FR-09 | The blocked dialog's navigation opens **All bookings** pre-filtered to that desk, status Confirmed, from the office's today | Must | AC-06 | implemented |
| FR-10 | A previously blocked desk deactivates successfully once its blocking bookings are gone, with nothing cached between attempts | Must | AC-07 | implemented |
| FR-11 | Activating a desk shows no confirmation dialog | Must | AC-09 | implemented |
| FR-12 | A successful deactivation or activation updates the row in place (status chip, and on deactivation the booked-ahead count to zero) without a refetch, and states the outcome in a toast | Must | AC-10 | implemented |
| FR-13 | A deactivation failure that is not the block leaves the desk unchanged, keeps the dialog open with a retry, and never calls the row-update path | Must | AC-11 | implemented |
| FR-14 | A non-admin session calling either endpoint is refused, and calling it at all is not offered by the UI | Must | AC-12 | implemented |

## Non-functional requirements

| ID     | Requirement                                                                                                     | Serves |
| ------ | ----------------------------------------------------------------------------------------------------------------| ------ |
| NFR-01 | The blocked dialog is `role="alertdialog"`, carries a warning icon in its header as the non-colour signal, and moves initial focus to the refusal text rather than the primary action (NFR-008) | AC-04, SCR-006 |
| NFR-02 | No migration, no cancellation code path, and no per-route admin check duplicating the router-mount guard (`design-note.md` §0.2, §3.6) | AC-05, AC-12 |

## Technical constraints

- The predicate for "blocking" is `displayStatusPredicate('confirmed', today)` from `domain/booking-history.ts`, reused unmodified — never a hand-written `status='confirmed' AND booking_date >= today` — so the block and SCR-006's own "Booked ahead" column cannot drift apart (`design-note.md` §2.2, `modules/desks/README.md:68-70`).
- Routes are verb sub-resources — `POST /api/admin/desks/:id/deactivate` and `.../activate` — per the transition-vs-field-update rule `ai/standards/api-standards.md:13-21` already states, naming this exact story as its own example (`design-note.md` §3.1). Not a `PATCH` on `/desks/:id` with an `isActive` body.
- The blocking count travels on the wire as an optional, code-scoped `details` object on the shared error body (`libs/contracts/src/error.ts`), typed per-endpoint by `deskBlockedDetailsSchema` in `libs/contracts/src/desks.ts` — **ADR-009**, confirmed 2026-09-19. Emitted only by `unprocessable(..., details)`; every other error body in the system stays byte-identical (`design-note.md` §4.4).
- The count is read once, inside the deactivate request, immediately before the write — never cached, never trusted from the client (`design-note.md` §5.4, §6). This closes the load-to-click window AC-08 names; a narrower, sub-second window remains because this codebase has no database transactions, and it is accepted and documented rather than closed by a migration (`design-note.md` §6.2, confirmed 2026-09-19).
- `updated_at` on `desks` is **not** set by either endpoint — that column is scoped in writing to REQ-016 ("last renamed"), and this story is REQ-017 (`design-note.md` §5.3, confirmed 2026-09-19).
- After a successful deactivation, the browser corrects its own held `bookedAhead` to `0` in `markStateChanged` rather than the server returning it — the server's success already proves the count was zero (`design-note.md` §8.6, confirmed 2026-09-19).
- `DeskDeactivateDialog` is one screen-private component composing `Dialog` directly and switching body/footer/icon across ST-05/ST-07/ST-08/ST-06 — not `ConfirmDialog` reused for ST-05 and something else for ST-06, because that would unmount/remount and bounce focus (`design-note.md` §8.2).
- `Dialog` gains one additive prop, `icon?: ReactNode`, rendered in its header — no `tone` enum, no icon-in-body (`design-note.md` §8.3).
- `DesksServiceDeps` gains no dependency on a `bookings` write. The inability to cancel a booking from this module is structural, not merely untested (`design-note.md` §2.1, §5.4).

## Out of scope

- Any Postgres function or migration closing the residual race window in §6.2 — accepted as a cost for this story; a future story's problem if it ever needs closing (`design-note.md` §6.3).
- The activation-failure banner's copy and placement, and proving it under a test: SCR-006 draws a page-level failure message for a failed activation, but no acceptance criterion covers it (AC-11 is deactivation-only). Recommend filing a `change-request` for `/ba` to add the AC, mirroring how US-017 routed its own uncovered control (`design-note.md` §8.4, open item 5) — filing that issue is a question for the human, not decided in this plan.
- ST-06's singular copy ("1 person has…" / "See that 1 booking") and the exact activation-failure string are drafted in `design-note.md` §8.4 but not confirmed by `/ux` against an approved frame with a count of 1 — implemented as drafted, flagged for `/ux` review.
- Any change to `apps/api/src/modules/bookings/**` — AC-02 is already built; a diff there is a review finding.
- Any change to `apps/api/src/http/middleware/**` or `http/app.ts` — AC-12 is inherited from the existing router mount.
- A new route in `apps/ui/src/routes.tsx` — AC-06 navigates to an address that already exists.
- `apps/ui/src/lib/data-refresh.ts` — this screen is not subscribed to it, matching US-016/017/018.
