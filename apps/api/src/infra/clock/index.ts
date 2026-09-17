/**
 * Where "now" comes from.
 *
 * `domain/` never reads the clock — every rule takes the date it needs as an argument, which
 * is what makes the 30-day window, the weekday rule and "which status does this booking read
 * as today" provable as plain unit tests at any boundary date
 * (app-architecture.md §2, testing-standards.md).
 *
 * Services take a `Clock` so a test can hand them a fixed instant without mocking globals.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** A clock stopped at a chosen instant, for tests. */
export const fixedClock = (instant: Date): Clock => ({ now: () => new Date(instant) });

/**
 * Wait. Lives here rather than inline so the one place that waits — US-001/AC-04's
 * failure-delay floor — is injectable, and so a test can hand the route a small floor instead
 * of actually sleeping half a second (`domain/sign-in-failure-delay.ts`).
 *
 * `domain/` must never call this: the rule computes *how long* to wait and takes the clock
 * reading as an argument; the service is what waits.
 */
export const sleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
