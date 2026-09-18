import { describe, expect, it } from 'vitest';
import { isSessionExpired, shouldStampLastSeen, SESSION_LIFETIME_DAYS_MAX } from './session-lifetime.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

/**
 * NFR-009 — a session lasts 30 days from last use, not from sign-in.
 *
 * Pure, instant, no sleeping and no clock mocking: every input is an argument, including the
 * clock reading (US-003 design note §2.1).
 */
describe('isSessionExpired', () => {
  const lifetimeMs = 30 * DAY_MS;

  it('is not expired 29 days after last use (US-003/AC-01)', () => {
    const lastSeenAtMs = 0;
    const nowMs = 29 * DAY_MS;
    expect(isSessionExpired(lastSeenAtMs, nowMs, lifetimeMs)).toBe(false);
  });

  it('is not expired exactly at the 30-day boundary — the window is inclusive (US-003/AC-01)', () => {
    const lastSeenAtMs = 0;
    const nowMs = 30 * DAY_MS;
    expect(isSessionExpired(lastSeenAtMs, nowMs, lifetimeMs)).toBe(false);
  });

  it('is expired one millisecond past the 30-day boundary (US-003/AC-03)', () => {
    const lastSeenAtMs = 0;
    const nowMs = 30 * DAY_MS + 1;
    expect(isSessionExpired(lastSeenAtMs, nowMs, lifetimeMs)).toBe(true);
  });

  it('is expired 31 days after last use (US-003/AC-03)', () => {
    const lastSeenAtMs = 0;
    const nowMs = 31 * DAY_MS;
    expect(isSessionExpired(lastSeenAtMs, nowMs, lifetimeMs)).toBe(true);
  });

  it('is never expired when the stored timestamp is in the future (clock skew)', () => {
    // Postgres's now() default and the Node process can disagree slightly. A negative gap must
    // not be treated as an enormous positive one.
    expect(isSessionExpired(DAY_MS, 0, lifetimeMs)).toBe(false);
  });
});

describe('shouldStampLastSeen', () => {
  const throttleMs = 60 * MIN_MS;

  it('does not renew before the throttle interval has elapsed (US-003/AC-02)', () => {
    expect(shouldStampLastSeen(0, 59 * MIN_MS, throttleMs)).toBe(false);
  });

  it('renews exactly at the throttle interval — the throttle is inclusive (US-003/AC-02)', () => {
    expect(shouldStampLastSeen(0, 60 * MIN_MS, throttleMs)).toBe(true);
  });

  it('renews after the throttle interval has elapsed (US-003/AC-02)', () => {
    expect(shouldStampLastSeen(0, 61 * MIN_MS, throttleMs)).toBe(true);
  });

  it('never renews when the stored timestamp is in the future (clock skew)', () => {
    expect(shouldStampLastSeen(MIN_MS, 0, throttleMs)).toBe(false);
  });
});

describe('SESSION_LIFETIME_DAYS_MAX', () => {
  it('is the 30-day ceiling RISK-010 was accepted against', () => {
    expect(SESSION_LIFETIME_DAYS_MAX).toBe(30);
  });
});
