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
