import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// US-033 verifies; it does not build. `tools/aidlc-check.mjs` already computes WCAG AA 4.5:1
// contrast for every text-on-surface token pair in both themes (light + the `@media` dark
// override) — re-deriving that math here would be a second implementation that can drift from
// the first. This spawns the real, authoritative check instead.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('Design tokens meet WCAG AA contrast in both themes (US-033/AC-06)', () => {
  it('aidlc-check reports zero contrast shortfalls (US-033/AC-06)', () => {
    const result = spawnSync('node', ['tools/aidlc-check.mjs'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
    });

    const contrastWarnings = (result.stdout ?? '')
      .split('\n')
      .filter((line) => /below WCAG AA/i.test(line));

    expect(contrastWarnings).toEqual([]);
    expect(result.status).toBe(0);
  }, 20_000);
});

const VERIFICATION_LOG = join(
  REPO_ROOT,
  'inception',
  'specs',
  'US-033-responsive-and-accessible-across-every-screen',
  'verification-log.md',
);
const ALL_SCREENS = ['SCR-001', 'SCR-002', 'SCR-003', 'SCR-004', 'SCR-005', 'SCR-006', 'SCR-007', 'SCR-008', 'SCR-009', 'SCR-010'];

describe('The three-width sweep is recorded, not just performed (US-033/AC-09)', () => {
  it('verification-log.md exists and lists all ten screens (US-033/AC-09)', () => {
    const log = readFileSync(VERIFICATION_LOG, 'utf8');
    const missing = ALL_SCREENS.filter((scr) => !log.includes(scr));
    expect(missing).toEqual([]);
  });
});

describe('No screen scrolls horizontally at 360, 768 or 1280px (US-033/AC-01, US-033/AC-04)', () => {
  it('the recorded sweep contains no overflow:true result (US-033/AC-01, US-033/AC-04)', () => {
    // The real per-screen, per-width layout claim (AC-01/AC-04) can only be proven by a real
    // browser — jsdom has no layout engine (apps/ui/src/styles/index.css:14-18) — so the sweep
    // itself (verification-log.md) is the evidence. This asserts the recorded evidence is
    // actually clean, not merely present.
    const log = readFileSync(VERIFICATION_LOG, 'utf8');
    expect(log).not.toMatch(/overflow:\s*true/i);
    expect(log).toMatch(/overflow:false/);
  });
});
