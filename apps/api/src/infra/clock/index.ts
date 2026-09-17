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
