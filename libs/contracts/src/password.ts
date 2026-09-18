import { z } from 'zod';

/**
 * V-12 — min 8 characters; an upper-case letter, a lower-case letter, a digit, a special
 * character. Five independent conditions, which is why SCR-010's checklist has five rows.
 *
 * The IDs are stable and the **labels are not here**: copy lives in the UI, keyed on a code
 * (US-001/D-10). SCR-010 and SCR-009 word these rules for their own contexts.
 */
export const PASSWORD_RULE_IDS = ['length', 'upper', 'lower', 'digit', 'special'] as const;
export type PasswordRuleId = (typeof PASSWORD_RULE_IDS)[number];

/**
 * The one evaluation of V-12 in the project. The browser calls it on every keystroke to drive
 * SCR-010's checklist (AC-04); `newPasswordSchema` below calls it at the edge. The SAME
 * function — ADR-002's payoff a second time (design note §3.2).
 *
 * Pure, total, and it never throws: an invalid password is five booleans, not an exception.
 *
 * "Special character" is any character outside `A-Z`/`a-z`/`0-9`, deliberately open rather than
 * an explicit allowlist (design note §3.3) — an allowlist would refuse a legitimate character
 * with no way for the user to learn why. Length is counted in UTF-16 code units, what
 * `String.length` already counts.
 */
export function evaluatePasswordPolicy(password: string): Record<PasswordRuleId, boolean> {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

/**
 * V-12 as a schema, built ON the evaluator rather than beside it — two regexes for one rule is
 * how the checklist and the refusal come to disagree.
 *
 * `max(200)` is the same wire bound `signInRequestSchema` carries: a guard against a
 * pathological body, not a policy. The password is never trimmed (US-004 edge cases).
 */
export const newPasswordSchema = z
  .string()
  .max(200)
  .refine((value) => Object.values(evaluatePasswordPolicy(value)).every(Boolean));
