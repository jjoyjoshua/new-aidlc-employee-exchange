import { describe, expect, it } from 'vitest';
import { evaluatePasswordPolicy } from '@desk-booking/contracts';
import { generatePassword } from './generate-password.js';

const EXCLUDED_GLYPHS = ['1', 'l', 'I', '0', 'O'];

describe('generatePassword (US-021/AC-04, REQ-033, V-18)', () => {
  it('generates a value satisfying every V-12 rule, across 200 samples', () => {
    for (let i = 0; i < 200; i++) {
      const password = generatePassword();
      const policy = evaluatePasswordPolicy(password);
      expect(Object.values(policy).every(Boolean)).toBe(true);
    }
  });

  it('never contains an ambiguous glyph, across 200 samples (BR-001.12 — dictated, never emailed)', () => {
    for (let i = 0; i < 200; i++) {
      const password = generatePassword();
      for (const glyph of EXCLUDED_GLYPHS) {
        expect(password).not.toContain(glyph);
      }
    }
  });

  it('is not the same value twice in a row', () => {
    const first = generatePassword();
    const second = generatePassword();
    expect(first).not.toBe(second);
  });
});
