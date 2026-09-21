/**
 * `POST /api/internal/reminders/run` — guarded by a shared secret, never a user session, because
 * no user triggers it (`app-architecture.md` §4.3, US-030/D-05). Mounted on the mount point,
 * never per route — the same discipline `requireAdmin` states for its own reasons.
 *
 * A missing header, an empty one, a wrong-length one, and a wrong-but-same-length one all refuse
 * identically with `401 reminder_run_unauthorized` — no distinguishing detail, the same
 * anti-enumeration posture `requireAdmin` takes for a wrong role.
 */
import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { config } from '../../config/index.js';
import { ERROR_CODES, unauthorized } from '../errors.js';

const HEADER_NAME = 'x-reminder-run-secret';

function secretsMatch(given: string, expected: string): boolean {
  // Unequal lengths refuse immediately — `timingSafeEqual` throws on mismatched buffer
  // lengths rather than returning false, and the length check itself leaks nothing worth
  // defending (US-030/D-05).
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export const requireReminderSecret: RequestHandler = (req, _res, next) => {
  const header = req.headers[HEADER_NAME];
  const given = typeof header === 'string' ? header : undefined;

  if (!given || !secretsMatch(given, config().REMINDER_RUN_SECRET)) {
    next(unauthorized(ERROR_CODES.reminder_run_unauthorized, 'That request could not be authenticated.'));
    return;
  }

  next();
};
