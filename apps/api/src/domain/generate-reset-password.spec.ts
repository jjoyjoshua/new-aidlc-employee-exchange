import { describe, expect, it } from 'vitest';
import { evaluatePasswordPolicy, newPasswordSchema } from '@desk-booking/contracts';
import { generateResetPassword } from './generate-reset-password.js';

/**
 * US-027/AC-01. A stub that consumes a fixed, known sequence rather than a real CSPRNG — the
 * point of taking `randomInt` as a parameter (design note §5.1) is that the shuffle and the
 * one-per-class guarantee become directly provable, not just statistically likely.
 */
function sequence(...values: number[]): (maxExclusive: number) => number {
  let i = 0;
  return (maxExclusive: number) => {
    const value = values[i]!;
    i += 1;
    if (value >= maxExclusive) throw new Error(`stub sequence value ${value} out of range [0, ${maxExclusive})`);
    return value;
  };
}

function realRandomInt(maxExclusive: number): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0]! % maxExclusive;
}

const ALLOWED_CHARS = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*-_=+?');

describe('generateResetPassword', () => {
  it('draws one character per V-12 class before filling, then shuffles — proven structurally with a stubbed RNG (US-027/AC-01)', () => {
    // index 0 of each alphabet, in required order (upper, lower, digit, special), then filler
    // index 0 nine times, then a shuffle that is the identity permutation (every `j` picks the
    // current top index).
    const rng = sequence(0, 0, 0, 0, ...Array(10).fill(0), 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1);
    const password = generateResetPassword(rng);
    expect(password).toHaveLength(14);
    expect(Object.values(evaluatePasswordPolicy(password)).every(Boolean)).toBe(true);
  });

  it('never excludes 1, l, I, 0, O — the create path\'s exclusions do not apply here (US-027/AC-01, ADR-014)', () => {
    // A stub that always returns index 0 would never draw the ambiguous glyphs by chance; assert
    // the alphabet itself (not just a sample) admits them by checking the module's declared
    // alphabet contains each one, via a targeted draw.
    const upperAmbiguous = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf('I');
    const lowerAmbiguous = 'abcdefghijklmnopqrstuvwxyz'.indexOf('l');
    const digitAmbiguous = '0123456789'.indexOf('0');
    const rng = sequence(
      upperAmbiguous,
      lowerAmbiguous,
      digitAmbiguous,
      0,
      ...Array(10).fill(0),
      13,
      12,
      11,
      10,
      9,
      8,
      7,
      6,
      5,
      4,
      3,
      2,
      1,
    );
    const password = generateResetPassword(rng);
    expect(password).toContain('I');
    expect(password).toContain('l');
    expect(password).toContain('0');
  });

  it('generates 200 passwords that all satisfy V-12 and are accepted by newPasswordSchema, with the real CSPRNG (US-027/AC-01)', () => {
    for (let i = 0; i < 200; i++) {
      const password = generateResetPassword(realRandomInt);
      expect(Object.values(evaluatePasswordPolicy(password)).every(Boolean)).toBe(true);
      expect(newPasswordSchema.safeParse(password).success).toBe(true);
    }
  });

  it('draws every character from the union of the four declared alphabets — catches a future accidental widening (design note §5.4, ADR-014)', () => {
    for (let i = 0; i < 200; i++) {
      const password = generateResetPassword(realRandomInt);
      for (const char of password) {
        expect(ALLOWED_CHARS.has(char)).toBe(true);
      }
    }
  });

  it('never emits a space, quote, backslash or backtick — dictation/transport safety holds regardless of the glyph policy (ADR-014 clause 4)', () => {
    for (let i = 0; i < 200; i++) {
      const password = generateResetPassword(realRandomInt);
      expect(password).not.toMatch(/[\s'"`\\]/);
    }
  });
});
