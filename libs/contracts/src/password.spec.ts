import { describe, expect, it } from 'vitest';
import { PASSWORD_RULE_IDS, evaluatePasswordPolicy, newPasswordSchema } from './password.js';

describe('evaluatePasswordPolicy', () => {
  it('reports all five rules met for a compliant password (US-004/AC-04)', () => {
    expect(evaluatePasswordPolicy('Correct1!')).toEqual({
      length: true,
      upper: true,
      lower: true,
      digit: true,
      special: true,
    });
  });

  it('reports length unmet under 8 characters, independently of the other four (US-004/AC-04)', () => {
    const result = evaluatePasswordPolicy('Cor1!');
    expect(result.length).toBe(false);
    expect(result.upper).toBe(true);
    expect(result.lower).toBe(true);
    expect(result.digit).toBe(true);
    expect(result.special).toBe(true);
  });

  it('reports upper unmet with no upper-case letter, independently of the other four (US-004/AC-04)', () => {
    const result = evaluatePasswordPolicy('correct1!');
    expect(result.upper).toBe(false);
    expect(result.length).toBe(true);
    expect(result.lower).toBe(true);
    expect(result.digit).toBe(true);
    expect(result.special).toBe(true);
  });

  it('reports lower unmet with no lower-case letter, independently of the other four (US-004/AC-04)', () => {
    const result = evaluatePasswordPolicy('CORRECT1!');
    expect(result.lower).toBe(false);
    expect(result.length).toBe(true);
    expect(result.upper).toBe(true);
    expect(result.digit).toBe(true);
    expect(result.special).toBe(true);
  });

  it('reports digit unmet with no digit, independently of the other four (US-004/AC-04)', () => {
    const result = evaluatePasswordPolicy('Correct!!');
    expect(result.digit).toBe(false);
    expect(result.length).toBe(true);
    expect(result.upper).toBe(true);
    expect(result.lower).toBe(true);
    expect(result.special).toBe(true);
  });

  it('reports special unmet with no special character, independently of the other four (US-004/AC-04)', () => {
    const result = evaluatePasswordPolicy('Correct12');
    expect(result.special).toBe(false);
    expect(result.length).toBe(true);
    expect(result.upper).toBe(true);
    expect(result.lower).toBe(true);
    expect(result.digit).toBe(true);
  });

  it('treats a space as a special character (design note §3.3 — an open definition, not an allowlist)', () => {
    expect(evaluatePasswordPolicy('Correct1 ').special).toBe(true);
  });

  it('never throws on an empty string, reporting every rule unmet (US-004/AC-04)', () => {
    expect(evaluatePasswordPolicy('')).toEqual({
      length: false,
      upper: false,
      lower: false,
      digit: false,
      special: false,
    });
  });

  it('exposes the five rule ids the checklist iterates over (SCR-010)', () => {
    expect(PASSWORD_RULE_IDS).toEqual(['length', 'upper', 'lower', 'digit', 'special']);
  });
});

describe('newPasswordSchema', () => {
  it('accepts a password satisfying all five rules (US-004/AC-04)', () => {
    expect(newPasswordSchema.safeParse('Correct1!').success).toBe(true);
  });

  it('rejects a password missing any single rule (US-004/AC-04)', () => {
    expect(newPasswordSchema.safeParse('correct1!').success).toBe(false); // no upper
    expect(newPasswordSchema.safeParse('CORRECT1!').success).toBe(false); // no lower
    expect(newPasswordSchema.safeParse('Correctt!').success).toBe(false); // no digit
    expect(newPasswordSchema.safeParse('Correct12').success).toBe(false); // no special
    expect(newPasswordSchema.safeParse('Cor1!').success).toBe(false); // too short
  });

  it('is not trimmed and not case-folded — the value is checked exactly as submitted (US-004 edge cases)', () => {
    expect(newPasswordSchema.safeParse(' Correct1! ').success).toBe(true);
  });

  it('rejects a pathologically long value, as a wire bound rather than a policy (mirrors signInRequestSchema)', () => {
    expect(newPasswordSchema.safeParse('A1!'.repeat(100)).success).toBe(false);
  });
});
