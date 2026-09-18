/**
 * `@desk-booking/contracts` — the wire contract both sides import.
 *
 * It depends on `zod` and nothing else (ADR-002). It describes what crosses the wire, plus the
 * requirement-level rules both sides must evaluate identically — `evaluatePasswordPolicy` (V-12)
 * and `booking-window`'s date rules (BR-001.3, US-005/D-02) are the same function called from
 * both `apps/ui` and `apps/api/src/domain`, which is ADR-002's payoff, not an exception to it.
 * Everything else — persistence, HTTP, auth — stays out. Nothing here may import from `apps/api`
 * or `apps/ui`, and `eslint.config.mjs` enforces that — the browser reaching `apps/api` would put
 * a path between browser code and the service-role key (ADR-001).
 */
export * from './error.js';
export * from './auth.js';
export * from './password.js';
export * from './booking-window.js';

/**
 * Zod is re-exported **through** this package on purpose.
 *
 * `apps/ui` does not declare `zod` itself: the design note's reason is that two declared ranges
 * are how the versions drift apart, and two resolved copies of Zod produce schema instances
 * whose types are structurally incompatible in ways the error message never explains. But the
 * browser's data-fetching layer genuinely needs `ZodType` to accept a response schema as a
 * parameter, and importing an undeclared dependency is its own kind of wrong.
 *
 * Re-exporting resolves both: there is exactly one Zod in the build, and it arrives the same way
 * the schemas do. Import `z` and `ZodType` from here, never from `zod`, outside this package.
 */
export { z } from 'zod';
export type { ZodType, ZodTypeAny, infer as Infer } from 'zod';
