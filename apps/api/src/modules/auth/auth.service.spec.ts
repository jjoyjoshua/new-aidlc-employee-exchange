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
  last_seen_at: new Date(0).toISOString(),
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
    setPassword: vi.fn(async () => ({ kind: 'ok' as const })),
    ...overrides.auth,
  };
  const profiles: ProfileRepository = {
    findById: vi.fn(async () => PROFILE),
    stampLastSeen: vi.fn(async () => undefined),
    clearMustChangePassword: vi.fn(async () => undefined),
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
    const { service, profiles } = build({ nowMs: steppingClock(1_000, 20) });

    await service.attemptSignIn('priya@company.com', 'correct');

    expect(profiles.stampLastSeen).toHaveBeenCalledWith(PROFILE.id, new Date(1_000));
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

/**
 * NFR-009 — `loadSession` replaces `currentUser` (US-003 design note §2.6): its one caller,
 * `require-session.ts` step 3/4, now also needs the session's age to decide expiry.
 */
describe('loadSession (US-003)', () => {
  it('returns the user and their last-seen instant for an active account', async () => {
    const { service, profiles } = build({
      profiles: { findById: vi.fn(async () => ({ ...PROFILE, last_seen_at: new Date(12_345).toISOString() })) },
    });

    const session = await service.loadSession(PROFILE.id);

    expect(session?.user.id).toBe(PROFILE.id);
    expect(session?.lastSeenAtMs).toBe(12_345);
    expect(profiles.findById).toHaveBeenCalledWith(PROFILE.id);
  });

  it('returns undefined when no profile exists', async () => {
    const { service } = build({ profiles: { findById: vi.fn(async () => undefined) } });

    expect(await service.loadSession('ghost')).toBeUndefined();
  });

  it('returns undefined for a deactivated account', async () => {
    const { service } = build({
      profiles: { findById: vi.fn(async () => ({ ...PROFILE, is_active: false })) },
    });

    expect(await service.loadSession(PROFILE.id)).toBeUndefined();
  });
});

/**
 * NFR-009 — a failed renewal write must not fail the request it rides on (US-003 design note
 * §2.5); the cost of a lost stamp is at most one throttle interval, retried on the next request.
 */
describe('markSeen (US-003)', () => {
  it('writes the given instant through the repository', async () => {
    const stampLastSeen = vi.fn(async () => undefined);
    const { service } = build({ profiles: { stampLastSeen } });

    await service.markSeen(PROFILE.id, new Date(99_000));

    expect(stampLastSeen).toHaveBeenCalledWith(PROFILE.id, new Date(99_000));
  });

  it('does not reject when the write fails — logs and continues', async () => {
    const { service } = build({
      profiles: { stampLastSeen: vi.fn(async () => { throw new Error('db is down'); }) },
    });

    await expect(service.markSeen(PROFILE.id, new Date(0))).resolves.toBeUndefined();
  });
});

/**
 * US-004 — the forced password change. `setPassword` re-reads the profile itself (design note
 * §5.3) rather than trusting a caller-supplied one, so every assertion here is against the
 * outcome the service computes from a fresh `findById`, never against a value handed in.
 */
describe('setPassword (US-004)', () => {
  it('returns not-required when the mark is already clear (US-004/AC-03)', async () => {
    const { service, auth } = build({});

    const outcome = await service.setPassword(PROFILE.id, 'Correct1!');

    expect(outcome).toEqual({ kind: 'not-required' });
    expect(auth.setPassword).not.toHaveBeenCalled();
  });

  it('refuses and revokes the probe session locally when the candidate equals the current password (US-004/AC-05)', async () => {
    const mustChange = { ...PROFILE, must_change_password: true };
    const probeSession = { access_token: 'probe-token', refresh_token: 'probe-refresh', expires_at: 1_789_200_000 };
    const { service, auth, revoked } = build({
      profiles: { findById: vi.fn(async () => mustChange) },
      auth: {
        signInWithPassword: vi.fn(async () => ({ kind: 'ok' as const, session: probeSession, userId: mustChange.id })),
      },
    });

    const outcome = await service.setPassword(mustChange.id, 'the-admin-set-password');

    expect(outcome).toEqual({ kind: 'same-as-current' });
    expect(auth.setPassword).not.toHaveBeenCalled();
    expect(revoked).toEqual([{ token: 'probe-token', scope: 'local' }]);
  });

  it('never revokes with global scope for the probe — that would end the caller\'s own session too (US-004/AC-05)', async () => {
    const mustChange = { ...PROFILE, must_change_password: true };
    const probeSession = { access_token: 'probe-token', refresh_token: 'probe-refresh', expires_at: 1_789_200_000 };
    const { service, revoked } = build({
      profiles: { findById: vi.fn(async () => mustChange) },
      auth: {
        signInWithPassword: vi.fn(async () => ({ kind: 'ok' as const, session: probeSession, userId: mustChange.id })),
      },
    });

    await service.setPassword(mustChange.id, 'the-admin-set-password');

    expect(revoked.every((r) => r.scope === 'local')).toBe(true);
  });

  it('fails closed when the probe cannot reach the service — V-15 cannot be proven, so nothing is written (US-004 edge case)', async () => {
    const mustChange = { ...PROFILE, must_change_password: true };
    const { service, auth, profiles } = build({
      profiles: { findById: vi.fn(async () => mustChange) },
      auth: { signInWithPassword: vi.fn(async () => ({ kind: 'unavailable' as const })) },
    });

    const outcome = await service.setPassword(mustChange.id, 'Correct1!');

    expect(outcome).toEqual({ kind: 'unavailable' });
    expect(auth.setPassword).not.toHaveBeenCalled();
    expect(profiles.clearMustChangePassword).not.toHaveBeenCalled();
  });

  it('writes the credential and clears the mark on success (US-004/AC-06, US-004/AC-07)', async () => {
    const mustChange = { ...PROFILE, must_change_password: true };
    const { service, auth, profiles } = build({
      profiles: { findById: vi.fn(async () => mustChange) },
      auth: { signInWithPassword: vi.fn(async () => ({ kind: 'rejected' as const })) },
    });

    const outcome = await service.setPassword(mustChange.id, 'Correct1!');

    expect(auth.setPassword).toHaveBeenCalledWith(mustChange.id, 'Correct1!');
    expect(profiles.clearMustChangePassword).toHaveBeenCalledWith(mustChange.id);
    expect(outcome.kind).toBe('ok');
    expect(outcome.kind === 'ok' && outcome.user.mustChangePassword).toBe(false);
  });

  it('never clears the mark when the credential write fails — the old password must keep working (US-004/AC-08)', async () => {
    const mustChange = { ...PROFILE, must_change_password: true };
    const { service, profiles } = build({
      profiles: { findById: vi.fn(async () => mustChange) },
      auth: {
        signInWithPassword: vi.fn(async () => ({ kind: 'rejected' as const })),
        setPassword: vi.fn(async () => ({ kind: 'unavailable' as const })),
      },
    });

    const outcome = await service.setPassword(mustChange.id, 'Correct1!');

    expect(outcome).toEqual({ kind: 'unavailable' });
    expect(profiles.clearMustChangePassword).not.toHaveBeenCalled();
  });

  it('signs in again with the new password to replace the caller\'s revoked access token (design note §6.4)', async () => {
    // Confirmed 2026-09-18 against the real Supabase project: auth.admin.updateUserById revokes
    // the caller's existing access token. The probe call (old password still current) is
    // rejected; the SAME call repeated after the write succeeds, because the stored password has
    // changed by then.
    const mustChange = { ...PROFILE, must_change_password: true };
    const freshSession = { access_token: 'fresh-token', refresh_token: 'fresh-refresh', expires_at: 1_789_200_000 };
    const signInWithPassword = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'rejected' as const }) // the V-15 probe
      .mockResolvedValueOnce({ kind: 'ok' as const, session: freshSession, userId: mustChange.id }); // the re-sign-in
    const { service } = build({
      profiles: { findById: vi.fn(async () => mustChange) },
      auth: { signInWithPassword },
    });

    const outcome = await service.setPassword(mustChange.id, 'Correct1!');

    expect(outcome.kind).toBe('ok');
    expect(outcome.kind === 'ok' && outcome.session?.accessToken).toBe('fresh-token');
    expect(signInWithPassword).toHaveBeenCalledTimes(2);
    expect(signInWithPassword).toHaveBeenNthCalledWith(2, mustChange.email, 'Correct1!');
  });

  it('still answers ok, with no session, when the re-sign-in cannot complete — a 401 next time is safe, not a lockout (design note §6.4)', async () => {
    const mustChange = { ...PROFILE, must_change_password: true };
    const signInWithPassword = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'rejected' as const }) // the V-15 probe
      .mockResolvedValueOnce({ kind: 'unavailable' as const }); // the re-sign-in fails
    const { service } = build({
      profiles: { findById: vi.fn(async () => mustChange) },
      auth: { signInWithPassword },
    });

    const outcome = await service.setPassword(mustChange.id, 'Correct1!');

    expect(outcome.kind).toBe('ok');
    expect(outcome.kind === 'ok' && outcome.session).toBeUndefined();
  });

  it('still answers ok when clearing the mark fails after a successful write — the credential change is real (US-004 design note §6.2)', async () => {
    const mustChange = { ...PROFILE, must_change_password: true };
    const { service, auth } = build({
      profiles: {
        findById: vi.fn(async () => mustChange),
        clearMustChangePassword: vi.fn(async () => { throw new Error('db is down'); }),
      },
      auth: { signInWithPassword: vi.fn(async () => ({ kind: 'rejected' as const })) },
    });

    const outcome = await service.setPassword(mustChange.id, 'Correct1!');

    expect(auth.setPassword).toHaveBeenCalledWith(mustChange.id, 'Correct1!');
    expect(outcome.kind).toBe('ok');
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
