/**
 * V-01 / US-001 AC-04 — a rejected sign-in must land in one response-time band whatever caused
 * it: an unknown email, a wrong password, or a deactivated account.
 *
 * The three causes do naturally different amounts of work. An unknown email is rejected by
 * GoTrue without a hash comparison; a wrong password costs that comparison; a deactivated
 * account **succeeds** at GoTrue and then costs a profile read and a session revoke on top. The
 * slowest case is the one our own design creates, so no amount of care about GoTrue's internal
 * timing fixes it.
 *
 * Converging the three on one code path gives one message. This gives one band.
 *
 * Every input is an argument, including the clock reading — `domain/` never reads the clock
 * (`ai/standards/coding-standards.md`, `app-architecture.md` §2).
 */

/**
 * The floor, in milliseconds.
 *
 * A **constant, not an environment variable**: this is a security parameter, not a deployment
 * one, and a floor an operator can set to `0` is a security control with an off switch
 * (US-001/D-03). Tests pass a smaller floor as an argument rather than waiting.
 *
 * 500ms sits comfortably above a normal server→GoTrue→server round trip, so the real work fits
 * *under* the floor and the band is genuinely uniform, and low enough that a failed sign-in does
 * not feel broken. It is a judgement, not a derivation — argue it down with measurements.
 *
 * **This is not a rate limiter**, and somebody will claim it is. It delays each response and
 * bounds nothing about concurrency: a hundred parallel attempts still run in parallel. BRD-001
 * specifies no rate limit or lockout; that gap is recorded, not closed here.
 */
export const SIGN_IN_MIN_FAILURE_MS = 500;

/**
 * How much longer to wait before answering a rejected sign-in.
 *
 * @param startedAtMs when the attempt began
 * @param nowMs       the clock reading now
 * @param floorMs     the minimum total duration the response must take
 * @returns the remaining delay, never negative
 */
export function remainingDelayMs(startedAtMs: number, nowMs: number, floorMs: number): number {
  return Math.max(0, floorMs - (nowMs - startedAtMs));
}
