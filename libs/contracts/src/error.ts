/**
 * The one error shape that crosses the wire, and the stable strings the React app switches on.
 *
 * Both sides import this file. Two declarations of an error body are not a contract — that is
 * ADR-002's own sentence, and `apps/api/src/http/errors.ts` is where it first applied.
 */
import { z } from 'zod';

/** The stable machine-readable strings (`ai/standards/api-standards.md`). */
export const errorCodeSchema = z.enum([
  'invalid_request',
  'invalid_credentials',
  'no_session',
  'session_invalid',
  // NFR-009 — idle expiry, distinct from a token Supabase itself refused (`session_invalid`):
  // an operator triaging "users are being signed out" needs to tell the two apart, even though
  // the browser treats every 401 here identically (US-003 design note §4).
  'session_expired',
  'account_inactive',
  'admin_only',
  // US-004's, exported now: it is a contract between a middleware and SCR-010, which is
  // exactly the kind of agreement that belongs in one place rather than two typed strings.
  'password_change_required',
  // US-004/AC-05 — V-15. The new password is the administrator-set one. SCR-010 ST-03 is the
  // only state this code produces, and it is the only refusal on that screen the browser
  // cannot reach on its own.
  'password_same_as_current',
  // US-004/AC-03 — the mirror of `password_change_required`. There is no voluntary password
  // change in this release (BRD-001 §10), so the endpoint refuses an account that is not
  // marked. One character from its opposite in a switch, which is why both are constants.
  'password_change_not_required',
  // US-006 — a well-formed, real calendar date that the date-window rules refuse: before today,
  // beyond the 30-day window, or a weekend (V-02, V-03). 422, not 400: the request parsed fine,
  // the rule said no (US-006 design note §2.7). Also US-007's, for the same two rules on a POST.
  'date_not_bookable',
  // US-007/FR-02 — the `bookings_one_confirmed_per_desk_per_day` partial unique index fired:
  // another employee's booking beat this one to the same desk/date (V-04, AC-08).
  'desk_already_booked',
  // US-007/FR-02 — the `bookings_one_confirmed_per_user_per_day` partial unique index fired:
  // the caller already holds a Confirmed booking for that date, made elsewhere between page
  // load and confirm (BR-001.1, V-05, AC-05).
  'already_booked_that_date',
  // US-007/FR-04 — the posted deskId does not exist.
  'desk_not_found',
  // US-007/FR-04 — the posted deskId names a desk with is_active = false (BR-001.7, AC-12).
  'desk_inactive',
  // US-007/FR-06 — one code for "no such booking", "not the caller's" and "not currently
  // confirmed" alike (D-03, design note §3.3): distinguishing them would turn the endpoint into
  // an existence oracle over booking ids, the same enumeration weakness US-001/AC-04 rejects.
  'booking_not_found',
  'route_not_found',
  'service_unavailable',
  'internal_error',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** Switch on these; never on a string literal. A typo becomes a compile error. */
export const ERROR_CODES = errorCodeSchema.enum;

/**
 * `code` is `z.string()`, **not** `errorCodeSchema` — deliberately.
 *
 * ADR-002 exists because a tab loaded before a deploy talks to the server that came after it.
 * If this schema pinned the enum, that tab would fail to *parse* a legitimate new error code and
 * turn a handled error into a crash. Parse it loosely, switch on `ERROR_CODES`, and give the
 * switch a default branch. Strictness belongs on requests, not on the shape of a failure.
 */
export const errorBodySchema = z.object({
  statusCode: z.number().int(),
  code: z.string().min(1),
  message: z.string(),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;
