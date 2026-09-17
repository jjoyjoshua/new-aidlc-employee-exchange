import { describe, expect, it } from 'vitest';
import { isTransportFailure, supabaseAuthAdapter } from './auth.adapter.js';
import { setSupabaseAuthClientForTesting } from '../../infra/supabase/index.js';

/**
 * US-001/AC-07 — "an unreachable service does not read as a rejection".
 *
 * This is the one judgement the adapter makes, and getting it wrong is silent in both
 * directions: call an outage a rejection and users are told their password is wrong during an
 * incident; call a rejection an outage and a wrong password offers a **Try again** button that
 * will never work.
 */
describe('isTransportFailure (US-001/AC-07)', () => {
  it('treats no error at all as no failure (US-001/AC-07)', () => {
    expect(isTransportFailure(null)).toBe(false);
  });

  it('treats a 400 as a credential answer, not an outage (US-001/AC-07)', () => {
    expect(isTransportFailure({ status: 400 })).toBe(false);
  });

  it('treats a 401 as a credential answer, not an outage (US-001/AC-07)', () => {
    expect(isTransportFailure({ status: 401 })).toBe(false);
  });

  it('treats a 429 as a credential answer rather than an outage (US-001/AC-07)', () => {
    // Supabase's own per-IP auth limit. ADR-003 makes every sign-in in the company arrive from
    // one server IP, so this is reachable in production. It is deliberately NOT an outage: the
    // request did reach the service and the service answered.
    expect(isTransportFailure({ status: 429 })).toBe(false);
  });

  it('treats status 0 as an outage — a refused connection, not a rejection (US-001/AC-07)', () => {
    // supabase-js reports a refused connection, a DNS failure or a timeout as
    // AuthRetryableFetchError with status 0. That is not an HTTP status at all. Checking only
    // for `undefined` let it fall through to `0 >= 500` === false, so a total outage was
    // classified as a credential rejection and every user was told their password was wrong.
    expect(isTransportFailure({ status: 0 })).toBe(true);
  });

  it('treats any sub-100 status as an outage (US-001/AC-07)', () => {
    // 100 is the lowest real HTTP status. Anything below it means no response happened.
    expect(isTransportFailure({ status: 99 })).toBe(true);
  });

  it('treats a 500 as an outage (US-001/AC-07)', () => {
    expect(isTransportFailure({ status: 500 })).toBe(true);
  });

  it('treats a 503 as an outage (US-001/AC-07)', () => {
    expect(isTransportFailure({ status: 503 })).toBe(true);
  });

  it('treats an error with no status at all as an outage (US-001/AC-07)', () => {
    // DNS failure, connection refused, a timeout. Erring towards "unavailable" on an
    // unrecognised shape is deliberate: telling a user their credentials failed when the truth
    // is our outage is the worse of the two mistakes.
    expect(isTransportFailure({})).toBe(true);
  });
});

describe('a downstream that throws rather than returns (US-001/AC-07)', () => {
  it('reports unavailable when the Supabase client throws (US-001/AC-07)', async () => {
    // Found by running the server against a placeholder Supabase URL: supabase-js 2.109 builds
    // a RealtimeClient in its constructor, which throws on Node 20 without native WebSocket.
    // That throw escaped the adapter and surfaced as a 500 — "our bug" — when the truth was
    // "we cannot reach the service". A unit test cannot catch what only the real client does,
    // so this asserts the shape of the guard instead: anything thrown becomes `unavailable`.
    setSupabaseAuthClientForTesting({
      auth: {
        signInWithPassword() {
          throw new Error('Node.js 20 detected without native WebSocket support.');
        },
      },
    } as never);

    const outcome = await supabaseAuthAdapter.signInWithPassword('priya@company.com', 'correct');

    expect(outcome).toEqual({ kind: 'unavailable' });
    setSupabaseAuthClientForTesting(undefined);
  });

  it('reports unavailable when the client rejects rather than throws synchronously (US-001/AC-07)', async () => {
    setSupabaseAuthClientForTesting({
      auth: {
        signInWithPassword: async () => {
          throw new TypeError('fetch failed');
        },
      },
    } as never);

    const outcome = await supabaseAuthAdapter.signInWithPassword('priya@company.com', 'correct');

    expect(outcome).toEqual({ kind: 'unavailable' });
    setSupabaseAuthClientForTesting(undefined);
  });
});
