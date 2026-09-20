/**
 * US-027/AC-01 (REQ-021, BR-001.12, V-12). The reset-password endpoint mints its own credential
 * server-side — unlike account creation (US-021/US-022), where the browser generates the value
 * and merely submits it. `apps/ui/src/lib/generate-password.ts` is not reused: it runs on the
 * wrong side of the browser/server boundary for a value that must never be client-supplied, and,
 * per ADR-014, it now also excludes a different set of characters than this function does.
 *
 * `randomInt` is a PARAMETER, not a call to `crypto.getRandomValues` inside this file:
 * `domain/README.md` — "no database, no network, no `Date.now()`, no `process.env`. Every input
 * arrives as an argument" — and a CSPRNG is the same kind of nondeterminism `Date.now` is banned
 * for, just uncaught by any existing lint rule. The service supplies the crypto-backed
 * implementation; this file's own guarantees are then provable with a stubbed one.
 *
 * Self-verifies against `evaluatePasswordPolicy` before returning — the same function the
 * browser's checklist and `newPasswordSchema` both run, so this generator and the policy cannot
 * silently drift (`libs/contracts/src/password.ts`'s own stated reason for existing).
 *
 * Does NOT exclude `1`/`l`/`I`/`0`/`O` — ADR-014. V-18 does not reach this path: it scopes to a
 * generated *initial* password (REQ-033), and this is a reset. The hi-fi design for SCR-008 ST-11
 * relies on the monospace, disambiguating font for legibility instead (ADR-014's own evidence).
 * See `apps/ui/src/lib/generate-password.ts` for the create-path generator this deliberately
 * differs from.
 */
import { evaluatePasswordPolicy } from '@desk-booking/contracts';

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGIT = '0123456789';
/** Verbatim from `generate-password.ts` (ADR-014 clause 4): a credential that is read aloud must
 *  also be dictatable and paste cleanly. No space, quote, backslash or backtick — no font
 *  disambiguates any of those, and `evaluatePasswordPolicy`'s open "special" definition would not
 *  otherwise stop them. */
const SPECIAL = '!@#$%^&*-_=+?';
const ALL = UPPER + LOWER + DIGIT + SPECIAL;

/** Same margin `generate-password.ts` uses — long enough that the length rule is never the near miss. */
const LENGTH = 14;

function randomChar(alphabet: string, randomInt: (maxExclusive: number) => number): string {
  return alphabet[randomInt(alphabet.length)]!;
}

function shuffled(chars: string[], randomInt: (maxExclusive: number) => number): string[] {
  // Fisher-Yates — an unshuffled "one of each rule, then random filler" order would make the
  // first four characters of every generated password predictable.
  const result = [...chars];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function attempt(randomInt: (maxExclusive: number) => number): string {
  // One guaranteed character per V-12 rule that isn't "length", then fill the rest — the only way
  // to GUARANTEE all four hold at any length, rather than hope a purely random draw includes one
  // of each.
  const required = [
    randomChar(UPPER, randomInt),
    randomChar(LOWER, randomInt),
    randomChar(DIGIT, randomInt),
    randomChar(SPECIAL, randomInt),
  ];
  const filler = Array.from({ length: LENGTH - required.length }, () => randomChar(ALL, randomInt));
  return shuffled([...required, ...filler], randomInt).join('');
}

/**
 * Generates a value that satisfies every V-12 rule. Regenerates internally in the unreachable
 * case a draw does not — never returns a value it has not itself verified.
 *
 * @param randomInt returns a uniformly-distributed integer in `[0, maxExclusive)`. The service
 *   passes a `crypto.getRandomValues`-backed implementation; tests pass a stub.
 */
export function generateResetPassword(randomInt: (maxExclusive: number) => number): string {
  let candidate = attempt(randomInt);
  while (!Object.values(evaluatePasswordPolicy(candidate)).every(Boolean)) {
    candidate = attempt(randomInt);
  }
  return candidate;
}
