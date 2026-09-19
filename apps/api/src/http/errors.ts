/**
 * The one error shape every route returns (app-architecture.md §5.3, api-standards.md).
 *
 *   { statusCode, code, message }
 *
 * `code` is a stable machine-readable string the React app switches on. `message` is safe to
 * show a user. Nothing else crosses the boundary — no stack traces, no Postgres messages,
 * no constraint names.
 */

/**
 * `ErrorBody` and the code strings come from `@desk-booking/contracts`, not from here.
 *
 * This file used to declare its own `ErrorBody` interface and its own
 * `PASSWORD_CHANGE_REQUIRED` constant. Two declarations are not a contract — that is ADR-002's
 * own sentence, and this file is the first place it applied.
 */
import { ERROR_CODES, type ErrorBody, type ErrorCode } from '@desk-booking/contracts';

export { ERROR_CODES };
export type { ErrorBody, ErrorCode };

/**
 * A failure the server chose, with the status and code already decided.
 *
 * Anything thrown that is *not* one of these is a bug, and the handler turns it into a bare
 * 500 with no detail — see `errorHandler`.
 */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    /**
     * OPTIONAL, code-scoped detail (US-019/AC-04, ADR-009). Undefined for every helper except
     * `unprocessable` when a caller passes one — every other call site is unaffected by this
     * parameter's existence.
     */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  toBody(): ErrorBody {
    return {
      statusCode: this.statusCode,
      code: this.code,
      message: this.message,
      // The load-bearing line (ADR-009): every error body in the system today stays
      // byte-identical unless a caller passed `details` — no key, not `null`, not `{}`.
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}

/** The request did not parse, or violates a field rule (V-12, V-16). */
export const badRequest = (code: string, message: string) => new HttpError(400, code, message);

/** No session, expired session, inactive account. */
export const unauthorized = (code: string, message: string) => new HttpError(401, code, message);

/** Signed in but not permitted — wrong role (V-07), or password change pending. */
export const forbidden = (code: string, message: string) => new HttpError(403, code, message);

/** No such desk, booking or account. */
export const notFound = (code: string, message: string) => new HttpError(404, code, message);

/**
 * Something else got there first, or the value is taken (V-04, V-05, V-08, V-10).
 * The world changed, and retrying differently can succeed, or the resource has already moved
 * past the state the request asked for — two people racing for desk A-01, or a booking someone
 * else already cancelled (US-011/AC-09, design note §1.3). Retryability is carried by the `code`,
 * not by the status class: the screen decides what to offer.
 */
export const conflict = (code: string, message: string) => new HttpError(409, code, message);

/**
 * The request is well-formed but the rule refuses it (V-06, V-09, V-11).
 * Not a race: the rule says no — "this desk has 3 upcoming bookings, so it can't be retired".
 *
 * `details` (US-019/AC-04, ADR-009) is for the rarer case where the refusal carries a fact the
 * browser must RENDER, not merely switch on — this docblock's own worked example is that case.
 * Omitted by every caller that has nothing to report.
 */
export const unprocessable = (code: string, message: string, details?: Record<string, unknown>) =>
  new HttpError(422, code, message, details);

/**
 * The forced password change (REQ-029, BR-001.17).
 *
 * This particular code is part of the contract: the React app uses it to route to SCR-010
 * rather than render an error. It now lives in `@desk-booking/contracts` so the middleware and
 * SCR-010 agree on one constant rather than on two typed strings.
 */
export const PASSWORD_CHANGE_REQUIRED = ERROR_CODES.password_change_required;

/**
 * A named downstream is unreachable — Supabase Auth timed out, refused the connection, or
 * answered 5xx.
 *
 * Distinct from `internal_error` on purpose. US-001/AC-07 exists precisely to separate "the
 * service is unavailable" from "we rejected you", and an operator needs to tell a Supabase
 * outage from our own defect. `api-standards.md` gains the row.
 */
export const serviceUnavailable = (message: string) =>
  new HttpError(503, ERROR_CODES.service_unavailable, message);
