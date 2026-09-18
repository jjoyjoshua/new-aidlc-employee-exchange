/**
 * NFR-009 — a session lasts 30 days from last use, sliding forward on every use, not a fixed
 * window from sign-in. `api-standards.md` names this the requirement-level rule that belongs in
 * `domain/`, not in the middleware that calls it (US-003 design note §2.1).
 *
 * Every input is an argument, including the clock reading — `domain/` never reads the clock
 * (`ai/standards/coding-standards.md`, `eslint.config.mjs` Boundary 2) and never imports from
 * `config/`, so the numbers below are the values `config/index.ts` reads FROM, not the other
 * way round.
 */

/** The ceiling: RISK-010 was accepted for a 30-day window, not for a longer one. Also the
 *  default — the correct value is the requirement itself, known and identical everywhere. */
export const SESSION_LIFETIME_DAYS_MAX = 30;

/** The throttle's default. A cost knob, not a requirement — how much write traffic a renewal
 *  is worth (db-design.md §1.1). */
export const LAST_SEEN_THROTTLE_MINUTES_DEFAULT = 60;

/**
 * AC-01, AC-03. Expired once the gap **strictly exceeds** the lifetime — a gap equal to the
 * lifetime is still inside the window ("a session lasts 30 days").
 *
 * A negative gap (`lastSeenAtMs` in the future — possible under clock skew between Postgres's
 * `now()` default and this process) is never expired; it falls out of the comparison rather
 * than needing a special case.
 */
export function isSessionExpired(lastSeenAtMs: number, nowMs: number, lifetimeMs: number): boolean {
  return nowMs - lastSeenAtMs > lifetimeMs;
}

/**
 * AC-02. Whether `last_seen_at` is worth rewriting: true once the stored value is at least one
 * throttle interval old. Inclusive (`>=`) — a throttle of `0` then means "write every time",
 * which is what a reader expects from that value, and there is no criterion pinned to this edge
 * the way AC-01 pins one to `isSessionExpired`'s.
 *
 * The throttled value understates true last use by at most one throttle interval — the bound
 * that makes comparing against it (rather than a second, unthrottled timestamp) correct. See
 * the design note §2.2 for the proof.
 */
export function shouldStampLastSeen(lastSeenAtMs: number, nowMs: number, throttleMs: number): boolean {
  return nowMs - lastSeenAtMs >= throttleMs;
}
