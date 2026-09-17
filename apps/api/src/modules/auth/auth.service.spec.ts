import { describe, expect, it, vi } from 'vitest';
import { createAuthService, type AuthAdapter, type ProfileRepository } from './auth.service.js';
import type { UserProfileRow } from './auth.repository.js';

/**
 * US-001/AC-04 — the three causes converge on ONE outcome before anything shapes a response.
 *
 * These specs assert the *decision* — the outcome kind and the deadline the service computes —
 * never that a sleep function was called. `ai/standards/testing-standards.md` bans asserting the
 * mock; the deadline is the decision, and it is what a wrong implementation gets wrong.
 */

const PROFILE: UserProfileRow = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  email: 'priya@company.com',
  full_name: 'Priya Sharma',
  role: 'employee',
  is_active: true,
  must_change_password: false,
};

const SESSION = { access_token: 'access', refresh_token: 'refresh', expires_at: 1_789_200_000 };

/** A clock that advances by a fixed amount on each reading, so "work took time" is expressible. */
const steppingClock = (start: number, ...steps: number[]) => {
  const readings = [start, ...steps.map((s) => start + s)];
  let i = 0;
  return () => readings[Math.min(i++, readings.length - 1)] ?? start;
};

function build(overrides: {
  auth?: Partial<AuthAdapter>;
  profiles?: Partial<ProfileRepository>;
  nowMs?: () => number;
  floorMs?: number;
}) {
  const revoked: Array<{ token: string; scope: string }> = [];
  const auth: AuthAdapter = {
    signInWithPassword: vi.fn(async () => ({ kind: 'ok' as const, session: SESSION, userId: PROFILE.id })),
    revokeSession: vi.fn(async (token: string, scope: string) => {
      revoked.push({ token, scope });
    }),
    ...overrides.auth,
  };
  const profiles: ProfileRepository = {
    findById: vi.fn(async () => PROFILE),
    stampLastSeen: vi.fn(async () => undefined),
    ...overrides.profiles,
  };
  const service = createAuthService({
    auth,
    profiles,
    nowMs: overrides.nowMs ?? steppingClock(1_000, 20),
    floorMs: overrides.floorMs ?? 500,
  });
  return { service, auth, profiles, revoked };
}

describe('attemptSignIn — convergence (US-001/AC-04)', () => {
  it('returns rejected for an unknown email (US-001/AC-04)', async () => {
    const { service } = build({
      auth: { signInWithPassword: vi.fn(async () => ({ kind: 'rejected' as const })) },
    });

    const outcome = await service.attemptSignIn('nobody@company.com', 'whatever');

    expect(outcome.kind).toBe('rejected');
  });

  it('returns rejected for a wrong password (US-001/AC-04)', async () => {
    const { service } = build({
      auth: { signInWithPassword: vi.fn(async () => ({ kind: 'rejected' as const })) },
    });

    const outcome = await service.attemptSignIn('priya@company.com', 'wrong');

    expect(outcome.kind).toBe('rejected');
  });

  it('returns rejected for a deactivated account whose password is correct (US-001/AC-04)', async () => {
    // GoTrue SUCCEEDS here — it has no concept of is_active. This is the case that makes a
    // browser-side sign-in unable to satisfy AC-04 at all (ADR-003).
    const { service } = build({
      profiles: { findById: vi.fn(async () => ({ ...PROFILE, is_active: false })) },
    });

    const outcome = await service.attemptSignIn('priya@company.com', 'correct');

    expect(outcome.kind).toBe('rejected');
  });

  it('returns rejected when the credential is valid but no profile row exists (US-001/AC-04)', async () => {
    const { service } = build({ profiles: { findById: vi.fn(async () => undefined) } });

    const outcome = await service.attemptSignIn('ghost@company.com', 'correct');

    expect(outcome.kind).toBe('rejected');
  });

  it('computes the same deadline from its start time for all three causes (US-001/AC-04)', async () => {
    const outcomes = await Promise.all([
      build({
        auth: { signInWithPassword: vi.fn(async () => ({ kind: 'rejected' as const })) },
        nowMs: steppingClock(1_000, 5),
      }).service.attemptSignIn('nobody@company.com', 'x'),
      build({
        auth: { signInWithPassword: vi.fn(async () => ({ kind: 'rejected' as const })) },
        nowMs: steppingClock(1_000, 90),
      }).service.attemptSignIn('priya@company.com', 'wrong'),
      build({
        profiles: { findById: vi.fn(async () => ({ ...PROFILE, is_active: false })) },
        nowMs: steppingClock(1_000, 310),
      }).service.attemptSignIn('priya@company.com', 'correct'),
    ]);

    // Fast, slower and slowest all land on the same absolute deadline: start + floor.
    for (const outcome of outcomes) {
      expect(outcome.kind).toBe('rejected');
      expect(outcome.kind === 'rejected' && outcome.deadlineMs).toBe(1_500);
    }
  });

  it('revokes the session GoTrue minted for a deactivated account, globally (US-001/AC-04)', async () => {
    // GoTrue has already issued a real refresh token. requireSession would refuse every request
    // made with it, but leaving it alive contradicts what REQ-005 means. Scope is 'global'
    // (US-002/D-03): the account holds no working credential anywhere, not just on this device.
    const { service, revoked } = build({
      profiles: { findById: vi.fn(async () => ({ ...PROFILE, is_active: false })) },
    });

    await service.attemptSignIn('priya@company.com', 'correct');

    expect(revoked).toEqual([{ token: SESSION.access_token, scope: 'global' }]);
  });
});

describe('attemptSignIn — success (US-001/AC-01, US-001/AC-02)', () => {
  it('returns the session and the profile for an active employee (US-001/AC-01)', async () => {
    const { service } = build({});

    const outcome = await service.attemptSignIn('priya@company.com', 'correct');

    expect(outcome.kind).toBe('ok');
    expect(outcome.kind === 'ok' && outcome.user.role).toBe('employee');
    expect(outcome.kind === 'ok' && outcome.session.accessToken).toBe('access');
  });

  it('carries the admin role through so the caller can land them correctly (US-001/AC-02)', async () => {
    const { service } = build({
      profiles: { findById: vi.fn(async () => ({ ...PROFILE, role: 'admin' as const })) },
    });

    const outcome = await service.attemptSignIn('marcus@company.com', 'correct');

    expect(outcome.kind === 'ok' && outcome.user.role).toBe('admin');
  });

  it('stamps last_seen_at on a successful sign-in (US-001/AC-03)', async () => {
    const { service, profiles } = build({});

    await service.attemptSignIn('priya@company.com', 'correct');

    expect(profiles.stampLastSeen).toHaveBeenCalledWith(PROFILE.id);
  });

  it('never revokes the session of an account that signed in successfully (US-001/AC-01)', async () => {
    const { service, revoked } = build({});

    await service.attemptSignIn('priya@company.com', 'correct');

    expect(revoked).toEqual([]);
  });

  it('carries mustChangePassword through without acting on it (US-001/AC-01)', async () => {
    // The forced password-change story is what gates on this flag; this story only reports it
    // (US-001/D-08). Naming that story by its id here would read as a coverage citation, and
    // this test proves nothing for it — `aidlc-check` is right to reject that.
    const { service } = build({
      profiles: { findById: vi.fn(async () => ({ ...PROFILE, must_change_password: true })) },
    });

    const outcome = await service.attemptSignIn('priya@company.com', 'correct');

    expect(outcome.kind).toBe('ok');
    expect(outcome.kind === 'ok' && outcome.user.mustChangePassword).toBe(true);
  });
});

describe('attemptSignIn — email normalisation (US-001/AC-01)', () => {
  it('trims and lower-cases the email before the auth call (US-001/AC-01)', async () => {
    // BR-001.10 makes uniqueness case-normalised, so a case-insensitive match can never be
    // ambiguous. Normalising here rather than trusting GoTrue means the behaviour is ours and
    // has this test (US-001/D-02).
    const { service, auth } = build({});

    await service.attemptSignIn('  Priya@Company.COM  ', 'correct');

    expect(auth.signInWithPassword).toHaveBeenCalledWith('priya@company.com', 'correct');
  });

  it('never alters the password (US-001/AC-01)', async () => {
    const { service, auth } = build({});

    await service.attemptSignIn('priya@company.com', '  MiXeD Case  ');

    expect(auth.signInWithPassword).toHaveBeenCalledWith('priya@company.com', '  MiXeD Case  ');
  });
});

/**
 * US-002 — `signOut` ends a session server-side, `'local'`ly (US-002/D-03: not the same scope
 * US-001's refusal path uses), and never fails the caller — see the router for why (US-002/AC-02).
 */
describe('signOut (US-002/AC-02)', () => {
  it('revokes the given token with local scope (US-002/AC-02)', async () => {
    const { service, revoked } = build({});

    await service.signOut('a-real-token');

    expect(revoked).toEqual([{ token: 'a-real-token', scope: 'local' }]);
  });

  it('calls the adapter no times when no token is present (US-002)', async () => {
    const { service, auth } = build({});

    await service.signOut(undefined);

    expect(auth.revokeSession).not.toHaveBeenCalled();
  });
});

describe('attemptSignIn — service unavailable (US-001/AC-07)', () => {
  it('separates a transport failure from a rejection (US-001/AC-07)', async () => {
    const { service } = build({
      auth: { signInWithPassword: vi.fn(async () => ({ kind: 'unavailable' as const })) },
    });

    const outcome = await service.attemptSignIn('priya@company.com', 'correct');

    expect(outcome.kind).toBe('unavailable');
  });

  it('does not pad an unavailable outcome — it is no oracle (US-001/AC-07)', async () => {
    // The floor exists to hide which of three CREDENTIAL causes occurred. A downstream outage
    // depends on nothing about the account, so padding it would slow an incident for no gain.
    const { service } = build({
      auth: { signInWithPassword: vi.fn(async () => ({ kind: 'unavailable' as const })) },
    });

    const outcome = await service.attemptSignIn('priya@company.com', 'correct');

    expect(outcome).toEqual({ kind: 'unavailable' });
  });
});
