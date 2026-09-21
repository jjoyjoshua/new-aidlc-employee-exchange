import { describe, expect, it, vi, beforeEach } from 'vitest';
import { setConfigForTesting, type Config } from '../../config/index.js';
import { requireReminderSecret } from './require-reminder-secret.js';

const SECRET = 'a-genuinely-long-shared-secret-value';

beforeEach(() => {
  setConfigForTesting({ REMINDER_RUN_SECRET: SECRET } as unknown as Config);
});

function callMiddleware(headerValue: string | undefined) {
  const req = { headers: headerValue === undefined ? {} : { 'x-reminder-run-secret': headerValue } } as unknown as Parameters<
    typeof requireReminderSecret
  >[0];
  const res = {} as Parameters<typeof requireReminderSecret>[1];
  const next = vi.fn();
  requireReminderSecret(req, res, next);
  return next;
}

describe('requireReminderSecret (US-030/AC-01, app-architecture.md §4.3)', () => {
  it('calls next() with no error when the header matches the configured secret exactly', () => {
    const next = callMiddleware(SECRET);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(error) with 401 reminder_run_unauthorized when the header is missing entirely', () => {
    const next = callMiddleware(undefined);
    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0]![0] as { statusCode: number; code: string };
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('reminder_run_unauthorized');
  });

  it('refuses an empty header value the same way as a missing one', () => {
    const next = callMiddleware('');
    const error = next.mock.calls[0]![0] as { statusCode: number; code: string };
    expect(error.code).toBe('reminder_run_unauthorized');
  });

  it('refuses a wrong secret of the SAME length — proves the comparison checks content, not just length', () => {
    const wrongSameLength = 'b'.repeat(SECRET.length);
    const next = callMiddleware(wrongSameLength);
    const error = next.mock.calls[0]![0] as { statusCode: number; code: string };
    expect(error.code).toBe('reminder_run_unauthorized');
  });

  it('refuses a wrong secret of a DIFFERENT length without throwing — timingSafeEqual would throw on mismatched buffer lengths if called directly', () => {
    const next = callMiddleware('too-short');
    const error = next.mock.calls[0]![0] as { statusCode: number; code: string };
    expect(error.code).toBe('reminder_run_unauthorized');
  });
});
