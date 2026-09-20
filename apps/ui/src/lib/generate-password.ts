/**
 * SCR-009's **Suggest a password** (REQ-033, V-18, US-021/D-04) — the generator this US-022
 * story specifies in detail (AC-01, AC-02, AC-04; see `generate-password.spec.ts`). One pure
 * function that
 * self-verifies its own output against `evaluatePasswordPolicy` — the same function the
 * checklist and the server both run — before ever returning a value, so the generator and the
 * policy cannot silently drift apart (`password.ts`'s own stated reason for `newPasswordSchema`
 * being built ON the evaluator rather than beside it).
 *
 * Excludes `1`/`l`/`I`/`0`/`O` (BR-001.12, BRD-001 §10): the value is dictated or read from a
 * screen, never emailed, so a glyph a listener cannot tell apart from another turns one account
 * creation into an avoidable reset (SCR-008 ST-10's own reasoning, reused here verbatim).
 */
import { evaluatePasswordPolicy } from '@desk-booking/contracts';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O
const LOWER = 'abcdefghijkmnpqrstuvwxyz'; // no l
const DIGIT = '23456789'; // no 0, 1
const SPECIAL = '!@#$%^&*-_=+?';
const ALL = UPPER + LOWER + DIGIT + SPECIAL;

/** Long enough that the length rule is never the near miss — margin, not the minimum. */
const LENGTH = 14;

function randomInt(maxExclusive: number): number {
  // Web Crypto, not Math.random(): this produces a credential, however briefly held.
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0]! % maxExclusive;
}

function randomChar(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)]!;
}

function shuffled(chars: string[]): string[] {
  // Fisher-Yates, over crypto-sourced indices — an unshuffled "one of each rule, then random
  // filler" order would make the first four characters of every generated password predictable.
  const result = [...chars];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function attempt(): string {
  // One guaranteed character per V-12 rule that isn't "length", then fill the rest from the
  // combined alphabet — the only way to GUARANTEE all four hold at any length, rather than hope
  // a purely random draw happens to include one of each.
  const required = [randomChar(UPPER), randomChar(LOWER), randomChar(DIGIT), randomChar(SPECIAL)];
  const filler = Array.from({ length: LENGTH - required.length }, () => randomChar(ALL));
  return shuffled([...required, ...filler]).join('');
}

/**
 * Generates a value that satisfies every V-12 rule and contains none of the five excluded
 * glyphs. Regenerates internally in the unreachable case a draw does not — never returns a
 * value it has not itself verified.
 */
export function generatePassword(): string {
  let candidate = attempt();
  while (!Object.values(evaluatePasswordPolicy(candidate)).every(Boolean)) {
    candidate = attempt();
  }
  return candidate;
}
