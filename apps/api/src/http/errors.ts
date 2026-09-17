/**
 * The one error shape every route returns (app-architecture.md §5.3, api-standards.md).
 *
 *   { statusCode, code, message }
 *
 * `code` is a stable machine-readable string the React app switches on. `message` is safe to
 * show a user. Nothing else crosses the boundary — no stack traces, no Postgres messages,
 * no constraint names.
 */

export interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

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
  ) {
    super(message);
    this.name = 'HttpError';
  }

  toBody(): ErrorBody {
    return { statusCode: this.statusCode, code: this.code, message: this.message };
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
 * The world changed, and retrying differently can succeed — two people racing for desk A-01.
 */
export const conflict = (code: string, message: string) => new HttpError(409, code, message);

/**
 * The request is well-formed but the rule refuses it (V-06, V-09, V-11).
 * Not a race: the rule says no — "this desk has 3 upcoming bookings, so it can't be retired".
 */
export const unprocessable = (code: string, message: string) => new HttpError(422, code, message);

/**
 * The forced password change (REQ-029, BR-001.17).
 *
 * This particular code is part of the contract: the React app uses it to route to SCR-010
 * rather than render an error. Changing the string breaks that flow.
 */
export const PASSWORD_CHANGE_REQUIRED = 'password_change_required';
