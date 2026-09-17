import { describe, expect, it } from 'vitest';
import { remainingDelayMs, SIGN_IN_MIN_FAILURE_MS } from './sign-in-failure-delay.js';

/**
 * US-001/AC-04 — a rejected sign-in must land in one response-time band whatever caused it.
 *
 * Pure, instant, no sleeping and no clock mocking: every input is an argument, including the
 * clock reading. That is what makes the rule provable at the cheapest level.
 */
describe('remainingDelayMs', () => {
  it('pads a fast rejection up to the floor (US-001/AC-04)', () => {
    // An unknown email is the fastest cause — GoTrue rejects it without comparing a hash.
    expect(remainingDelayMs(1_000, 1_020, 500)).toBe(480);
  });

  it('adds no delay when the work already exceeded the floor (US-001/AC-04)', () => {
    // The deactivated path does strictly more work than either rejection: GoTrue succeeds,
    // then we read user_profiles, then we revoke the session.
    expect(remainingDelayMs(1_000, 1_600, 500)).toBe(0);
  });

  it('never returns a negative delay (US-001/AC-04)', () => {
    expect(remainingDelayMs(1_000, 5_000, 500)).toBe(0);
  });

  it('adds no delay when the work landed exactly on the floor (US-001/AC-04)', () => {
    expect(remainingDelayMs(1_000, 1_500, 500)).toBe(0);
  });

  it('pads the whole floor when no time has passed (US-001/AC-04)', () => {
    expect(remainingDelayMs(1_000, 1_000, 500)).toBe(500);
  });

  it('takes the floor as an argument so a test need not wait half a second (US-001/AC-04)', () => {
    expect(remainingDelayMs(1_000, 1_010, 50)).toBe(40);
  });

  it('defaults to a 500ms floor — a constant, never an env var (US-001/AC-04)', () => {
    // A security parameter, not a deployment one. A floor an operator can set to 0 is a
    // security control with an off switch (US-001/D-03).
    expect(SIGN_IN_MIN_FAILURE_MS).toBe(500);
  });
});
