import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../composition.js';
import { setConfigForTesting, type Config } from '../../config/index.js';
import type { AuthAdapter, AuthAttempt } from './auth.service.js';
import type { ProfileRepository, UserProfileRow } from './auth.repository.js';
import type { SessionVerifier } from '../../http/middleware/require-session.js';

/**
 * US-001/AC-03, AC-04, AC-07 — against the **real** `createApp`, through supertest.
 *
 * This file exists because the criteria it proves are properties of the assembled application,
 * not of any one function. AC-03 in particular is only proven by a request reaching the real
 * `/api/admin` mount: the story's own QA note says "a UI test that only checks the nav is
 * absent proves nothing", and a spec that builds its own little Express app is the same
 * mistake one level down.
 */

const EMPLOYEE: UserProfileRow = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  email: 'priya@company.com',
  full_name: 'Priya Sharma',
  role: 'employee',
  is_active: true,
  must_change_password: false,
  // Recent, not epoch 0: most tests here use the real clock (no `nowMs` override) and must not
  // accidentally trip NFR-009's 30-day expiry. Tests that exercise the expiry itself set their
  // own `last_seen_at` and inject `nowMs` explicitly (see the US-003 describe block below).
  last_seen_at: new Date().toISOString(),
};

const ADMIN: UserProfileRow = { ...EMPLOYEE, id: '9c858901-8a57-4791-81fe-4c455b099bc9', email: 'marcus@company.com', full_name: 'Marcus Webb', role: 'admin' };
const DEACTIVATED: UserProfileRow = { ...EMPLOYEE, id: '1b4e28ba-2fa1-11d2-883f-0016d3cca427', email: 'leaver@company.com', is_active: false };

const SESSION = { access_token: 'access-token', refresh_token: 'refresh-token', expires_at: 1_789_200_000 };

/** A small floor, injected. Tests assert the floor is respected, never how long it really is. */
const FLOOR_MS = 50;

beforeEach(() => {
  setConfigForTesting({
    NODE_ENV: 'test',
    PORT: 3000,
    CORS_ORIGINS: [],
    SESSION_LIFETIME_DAYS: 30,
    SESSION_LAST_SEEN_THROTTLE_MINUTES: 60,
  } as unknown as Config);
});

/**
 * Build the real app over stub adapters.
 *
 * `byEmail` decides what Supabase Auth would have answered; `rows` is what `user_profiles`
 * holds. Between them the three AC-04 causes are expressible without a network.
 */
function appWith(options: {
  byEmail?: Record<string, AuthAttempt>;
  rows?: UserProfileRow[];
  tokens?: Record<string, string>;
  nowMs?: () => number;
  sessionLifetimeMs?: number;
  lastSeenThrottleMs?: number;
}) {
  const rows = options.rows ?? [EMPLOYEE, ADMIN, DEACTIVATED];
  // Mutable, and read by BOTH the verifier and the stub's revoke — so a sign-out that revokes a
  // token actually makes the NEXT request against it fail, rather than the test asserting
  // against a side-channel array (design note §10; `ai/standards/testing-standards.md` bans
  // asserting the mock).
  const tokens: Record<string, string> = { ...options.tokens };
  const revoked: Array<{ token: string; scope: string }> = [];

  const auth: AuthAdapter = {
    async signInWithPassword(email) {
      return options.byEmail?.[email] ?? { kind: 'rejected' };
    },
    async revokeSession(token, scope) {
      revoked.push({ token, scope });
      delete tokens[token];
    },
  };

  const profiles: ProfileRepository = {
    async findById(id) {
      return rows.find((r) => r.id === id);
    },
    async stampLastSeen(id, at) {
      // NFR-009 — a real write against the stub's own row, not a call recorded on the side: the
      // next request in the same test must see the renewal (design note §10; `testing-standards.md`
      // bans asserting the mock).
      const row = rows.find((r) => r.id === id);
      if (row) row.last_seen_at = at.toISOString();
    },
  };

  const verifier: SessionVerifier = {
    async verify(token) {
      return tokens[token];
    },
  };

  return {
    app: buildApp({
      auth,
      profiles,
      verifier,
      floorMs: FLOOR_MS,
      ...(options.nowMs ? { nowMs: options.nowMs } : {}),
      ...(options.sessionLifetimeMs !== undefined ? { sessionLifetimeMs: options.sessionLifetimeMs } : {}),
      ...(options.lastSeenThrottleMs !== undefined ? { lastSeenThrottleMs: options.lastSeenThrottleMs } : {}),
    }),
    revoked,
    tokens,
    rows,
  };
}

const post = (app: ReturnType<typeof buildApp>, body: unknown) =>
  request(app).post('/api/auth/sign-in').send(body as object);

describe('POST /api/auth/sign-in — the three causes are indistinguishable (US-001/AC-04)', () => {
  const okForPriya: Record<string, AuthAttempt> = {
    'priya@company.com': { kind: 'ok', session: SESSION, userId: EMPLOYEE.id },
    'leaver@company.com': { kind: 'ok', session: SESSION, userId: DEACTIVATED.id },
  };

  it('returns byte-identical bodies for unknown email, wrong password and deactivated (US-001/AC-04)', async () => {
    const { app } = appWith({ byEmail: okForPriya });

    const unknown = await post(app, { email: 'nobody@company.com', password: 'whatever' });
    const wrong = await post(app, { email: 'someone@company.com', password: 'wrong' });
    const deactivated = await post(app, { email: 'leaver@company.com', password: 'correct' });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(deactivated.status).toBe(401);

    // The assertion that catches the three-code-paths-three-messages regression.
    expect(unknown.body).toEqual(wrong.body);
    expect(wrong.body).toEqual(deactivated.body);
  });

  it('reveals nothing about which accounts exist in the body it does send (US-001/AC-04)', async () => {
    const { app } = appWith({ byEmail: okForPriya });

    const response = await post(app, { email: 'leaver@company.com', password: 'correct' });

    expect(response.body.code).toBe('invalid_credentials');
    expect(JSON.stringify(response.body)).not.toContain('leaver@company.com');
    expect(JSON.stringify(response.body)).not.toContain('deactivat');
    expect(JSON.stringify(response.body)).not.toContain('inactive');
  });

  it('holds every one of the three causes to at least the floor (US-001/AC-04)', async () => {
    const { app } = appWith({ byEmail: okForPriya });

    for (const body of [
      { email: 'nobody@company.com', password: 'whatever' },
      { email: 'someone@company.com', password: 'wrong' },
      { email: 'leaver@company.com', password: 'correct' },
    ]) {
      const startedAt = Date.now();
      await post(app, body);
      // Lower bound ONLY. No upper bound and no comparison of means between causes — that is
      // how a timing test becomes the flaky one everyone learns to re-run.
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(FLOOR_MS);
    }
  });

  it('revokes the session GoTrue minted for the deactivated account (US-001/AC-04)', async () => {
    const { app, revoked } = appWith({ byEmail: okForPriya });

    await post(app, { email: 'leaver@company.com', password: 'correct' });

    expect(revoked).toEqual([{ token: SESSION.access_token, scope: 'global' }]);
  });

  it('does not pad a successful sign-in (US-001/AC-01)', async () => {
    // AC-04 asks that the three FAILURE causes be indistinguishable from each other. A 200 with
    // a session in it announces itself; padding it would add half a second to every successful
    // sign-in for no security gain.
    const { app } = appWith({ byEmail: okForPriya });

    const startedAt = Date.now();
    const response = await post(app, { email: 'priya@company.com', password: 'correct' });

    expect(response.status).toBe(200);
    expect(Date.now() - startedAt).toBeLessThan(FLOOR_MS);
  });
});

describe('the assembled app refuses plaintext in production (US-001/AC-08)', () => {
  it('refuses a plain-HTTP sign-in before the body is even parsed (US-001/AC-08)', async () => {
    // require-https.spec.ts proves the middleware. This proves it is MOUNTED — a guard that
    // exists but is not wired is the failure that passes every unit test.
    setConfigForTesting({ NODE_ENV: 'production', PORT: 3000, CORS_ORIGINS: [] } as unknown as Config);
    const { app } = appWith({});

    const response = await request(app)
      .post('/api/auth/sign-in')
      .set('x-forwarded-proto', 'http')
      .send({ email: 'priya@company.com', password: 'correct' });

    expect(response.status).toBe(403);
  });

  it('serves the same request over HTTPS (US-001/AC-08)', async () => {
    setConfigForTesting({ NODE_ENV: 'production', PORT: 3000, CORS_ORIGINS: [] } as unknown as Config);
    const { app } = appWith({
      byEmail: { 'priya@company.com': { kind: 'ok', session: SESSION, userId: EMPLOYEE.id } },
    });

    const response = await request(app)
      .post('/api/auth/sign-in')
      .set('x-forwarded-proto', 'https')
      .send({ email: 'priya@company.com', password: 'correct' });

    expect(response.status).toBe(200);
    expect(response.headers['strict-transport-security']).toMatch(/max-age=\d+/);
  });
});

describe('POST /api/auth/sign-in — request validation (US-001/AC-05)', () => {
  it('rejects a malformed body without echoing what was submitted (US-001/AC-05)', async () => {
    const { app } = appWith({});

    const response = await post(app, { email: 'not-an-email', password: 'hunter2-secret' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
    // The Zod issue list is the natural thing to return and it would put a fragment of a
    // submitted password into a response for a malformed body.
    expect(JSON.stringify(response.body)).not.toContain('hunter2-secret');
    expect(JSON.stringify(response.body)).not.toContain('not-an-email');
  });

  it('rejects unknown fields rather than ignoring them (US-001/AC-05)', async () => {
    const { app } = appWith({});

    const response = await post(app, { email: 'priya@company.com', password: 'x', role: 'admin' });

    expect(response.status).toBe(400);
  });
});

describe('POST /api/auth/sign-in — the service is unreachable (US-001/AC-07)', () => {
  it('answers 503, distinct from a rejection and from our own bug (US-001/AC-07)', async () => {
    const { app } = appWith({
      byEmail: { 'priya@company.com': { kind: 'unavailable' } },
    });

    const response = await post(app, { email: 'priya@company.com', password: 'correct' });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('service_unavailable');
  });

  it('does not suggest the credentials were wrong (US-001/AC-07)', async () => {
    const { app } = appWith({
      byEmail: { 'priya@company.com': { kind: 'unavailable' } },
    });

    const response = await post(app, { email: 'priya@company.com', password: 'correct' });

    expect(response.body.code).not.toBe('invalid_credentials');
  });
});

describe('POST /api/auth/sign-in — success carries the role (US-001/AC-01, US-001/AC-02)', () => {
  it('returns an employee with their role so the browser can land them (US-001/AC-01)', async () => {
    const { app } = appWith({
      byEmail: { 'priya@company.com': { kind: 'ok', session: SESSION, userId: EMPLOYEE.id } },
    });

    const response = await post(app, { email: 'priya@company.com', password: 'correct' });

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('employee');
    expect(response.body.user.mustChangePassword).toBe(false);
    expect(response.body.session.accessToken).toBe('access-token');
  });

  it('returns an administrator with the admin role (US-001/AC-02)', async () => {
    const { app } = appWith({
      byEmail: { 'marcus@company.com': { kind: 'ok', session: SESSION, userId: ADMIN.id } },
    });

    const response = await post(app, { email: 'marcus@company.com', password: 'correct' });

    expect(response.body.user.role).toBe('admin');
  });

  it('matches the email case-insensitively (US-001/AC-01)', async () => {
    const { app } = appWith({
      byEmail: { 'priya@company.com': { kind: 'ok', session: SESSION, userId: EMPLOYEE.id } },
    });

    const response = await post(app, { email: '  Priya@Company.COM  ', password: 'correct' });

    expect(response.status).toBe(200);
  });
});

describe('/api/admin — an employee is refused at the server, not just in the nav (US-001/AC-03)', () => {
  const tokens = { 'employee-token': EMPLOYEE.id, 'admin-token': ADMIN.id, 'leaver-token': DEACTIVATED.id };

  it('refuses an employee token with 403 and no data (US-001/AC-03)', async () => {
    const { app } = appWith({ tokens });

    const response = await request(app)
      .get('/api/admin/anything')
      .set('Authorization', 'Bearer employee-token');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('admin_only');
    expect(response.body).not.toHaveProperty('data');
  });

  it('lets an admin token past the guard — 404 means there is genuinely nothing there yet (US-001/AC-03)', async () => {
    const { app } = appWith({ tokens });

    const response = await request(app)
      .get('/api/admin/anything')
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('route_not_found');
  });

  it('refuses a request with no token at all (US-001/AC-03)', async () => {
    const { app } = appWith({ tokens });

    const response = await request(app).get('/api/admin/anything');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('no_session');
  });

  it('refuses a malformed authorization header (US-001/AC-03)', async () => {
    const { app } = appWith({ tokens });

    const response = await request(app)
      .get('/api/admin/anything')
      .set('Authorization', 'employee-token');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('no_session');
  });

  it('refuses a token that does not verify (US-001/AC-03)', async () => {
    const { app } = appWith({ tokens });

    const response = await request(app)
      .get('/api/admin/anything')
      .set('Authorization', 'Bearer forged-token');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('session_invalid');
  });

  it('ends a deactivated user live session immediately, mid-session (US-001/AC-03)', async () => {
    // REQ-005 biting at the middleware rather than at token expiry. This is also db-design.md
    // open question 3, which US-001 answers "yes, immediately" and the PO still owes a
    // confirmation on.
    const { app } = appWith({ tokens });

    const response = await request(app)
      .get('/api/auth/session')
      .set('Authorization', 'Bearer leaver-token');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('account_inactive');
  });
});

describe('POST /api/auth/sign-out (US-002/AC-02)', () => {
  it('ends a session — the same token no longer authorises the next request (US-002/AC-02)', async () => {
    const { app } = appWith({ tokens: { 'access-token': EMPLOYEE.id } });

    const before = await request(app).get('/api/auth/session').set('Authorization', 'Bearer access-token');
    expect(before.status).toBe(200);

    const signOut = await request(app).post('/api/auth/sign-out').set('Authorization', 'Bearer access-token');
    expect(signOut.status).toBe(204);

    const after = await request(app).get('/api/auth/session').set('Authorization', 'Bearer access-token');
    expect(after.status).toBe(401);
  });

  it('revokes with local scope, not global (US-002/D-03)', async () => {
    const { app, revoked } = appWith({ tokens: { 'access-token': EMPLOYEE.id } });

    await request(app).post('/api/auth/sign-out').set('Authorization', 'Bearer access-token');

    expect(revoked).toEqual([{ token: 'access-token', scope: 'local' }]);
  });

  it('answers 204 with no bearer token at all (US-002/AC-02, US-002/D-02)', async () => {
    const { app } = appWith({});

    const response = await request(app).post('/api/auth/sign-out');

    expect(response.status).toBe(204);
  });

  it('answers 204 for a token that never verifies (US-002/AC-02, US-002/D-02)', async () => {
    const { app } = appWith({});

    const response = await request(app).post('/api/auth/sign-out').set('Authorization', 'Bearer forged-token');

    expect(response.status).toBe(204);
  });

  it('runs no session chain — a deactivated account is still revoked, not refused (US-002/AC-04)', async () => {
    // Structural proof for AC-04: require-session.ts step 3 refuses a deactivated account's
    // token today. If sign-out ran that chain, this request would be 401 and nothing would be
    // revoked. It is 204 and revoked instead, which is the property AC-04 depends on once
    // the forced-password-change story fills the (currently empty) must_change_password step 5.
    const { app, revoked } = appWith({ tokens: { 'leaver-token': DEACTIVATED.id } });

    const response = await request(app).post('/api/auth/sign-out').set('Authorization', 'Bearer leaver-token');

    expect(response.status).toBe(204);
    expect(revoked).toEqual([{ token: 'leaver-token', scope: 'local' }]);
  });

  it('does not touch the stored credential — it still works at the next sign-in (US-002/AC-04)', async () => {
    // RISK-009: an administrator-set password must still work, and mustChangePassword must
    // still be true, after the user signs out of the forced password-change screen.
    const mustChange: UserProfileRow = { ...EMPLOYEE, must_change_password: true };
    const { app } = appWith({
      rows: [mustChange],
      byEmail: { 'priya@company.com': { kind: 'ok', session: SESSION, userId: mustChange.id } },
    });

    const first = await post(app, { email: 'priya@company.com', password: 'admin-set' });
    expect(first.body.user.mustChangePassword).toBe(true);

    await request(app).post('/api/auth/sign-out').set('Authorization', `Bearer ${SESSION.access_token}`);

    const second = await post(app, { email: 'priya@company.com', password: 'admin-set' });

    expect(second.status).toBe(200);
    expect(second.body.user.mustChangePassword).toBe(true);
  });
});

describe('GET /api/auth/session (US-001/AC-02)', () => {
  it('returns the role from the table so a cold boot can render correctly (US-001/AC-02)', async () => {
    const { app } = appWith({ tokens: { 'admin-token': ADMIN.id } });

    const response = await request(app)
      .get('/api/auth/session')
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('admin');
    expect(response.body.user.email).toBe('marcus@company.com');
  });

  it('reflects a role changed under a live session rather than a stale claim (US-001/AC-02)', async () => {
    // REQ-022 changes roles under live sessions. The role is read from user_profiles on every
    // request precisely so this is true; a JWT claim would still say "admin".
    const demoted: UserProfileRow = { ...ADMIN, role: 'employee' };
    const { app } = appWith({ rows: [demoted], tokens: { 'admin-token': ADMIN.id } });

    const response = await request(app)
      .get('/api/auth/session')
      .set('Authorization', 'Bearer admin-token');

    expect(response.body.user.role).toBe('employee');
  });

  it('requires a session (US-001/AC-03)', async () => {
    const { app } = appWith({});

    const response = await request(app).get('/api/auth/session');

    expect(response.status).toBe(401);
  });
});

/**
 * NFR-009 — a session lasts 30 days from last use, sliding forward on every use.
 *
 * A mutable clock so one test can move time forward across several requests without waiting —
 * the QA note's own instruction, and the reason `buildApp`'s `nowMs`/`sessionLifetimeMs`/
 * `lastSeenThrottleMs` overrides exist (US-003 design note §3, §10).
 */
function mutableClock(startMs: number) {
  let current = startMs;
  return { nowMs: () => current, advance: (ms: number) => { current += ms; } };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

describe('session lifetime — sliding 30-day expiry (US-003)', () => {
  it('does not challenge a session used 29 days ago (US-003/AC-01)', async () => {
    const T0 = 1_700_000_000_000;
    const clock = mutableClock(T0);
    const aged: UserProfileRow = { ...EMPLOYEE, last_seen_at: new Date(T0 - 29 * DAY_MS).toISOString() };
    const { app } = appWith({
      rows: [aged],
      tokens: { 'access-token': aged.id },
      nowMs: clock.nowMs,
      sessionLifetimeMs: 30 * DAY_MS,
      lastSeenThrottleMs: HOUR_MS,
    });

    const response = await request(app).get('/api/auth/session').set('Authorization', 'Bearer access-token');

    expect(response.status).toBe(200);
  });

  it('slides the window forward on use — 40 days after sign-in, still valid because used daily (US-003/AC-02)', async () => {
    const T0 = 1_700_000_000_000;
    const clock = mutableClock(T0);
    const row: UserProfileRow = { ...EMPLOYEE, last_seen_at: new Date(T0 - 20 * DAY_MS).toISOString() };
    const { app, rows } = appWith({
      rows: [row],
      tokens: { 'access-token': row.id },
      nowMs: clock.nowMs,
      sessionLifetimeMs: 30 * DAY_MS,
      lastSeenThrottleMs: HOUR_MS,
    });

    // Used today: renews last_seen_at to T0.
    const first = await request(app).get('/api/auth/session').set('Authorization', 'Bearer access-token');
    expect(first.status).toBe(200);
    expect(rows[0]?.last_seen_at).toBe(new Date(T0).toISOString());

    // 20 more days pass — 40 days after the original sign-in, but only 20 since last use.
    clock.advance(20 * DAY_MS);
    const second = await request(app).get('/api/auth/session').set('Authorization', 'Bearer access-token');

    expect(second.status).toBe(200);
  });

  it('throttles the renewal write to once per configured interval (US-003/AC-02)', async () => {
    const T0 = 1_700_000_000_000;
    const clock = mutableClock(T0);
    const row: UserProfileRow = { ...EMPLOYEE, last_seen_at: new Date(T0).toISOString() };
    const { app, rows } = appWith({
      rows: [row],
      tokens: { 'access-token': row.id },
      nowMs: clock.nowMs,
      sessionLifetimeMs: 30 * DAY_MS,
      lastSeenThrottleMs: HOUR_MS,
    });

    clock.advance(30 * 60 * 1000);
    await request(app).get('/api/auth/session').set('Authorization', 'Bearer access-token');
    expect(rows[0]?.last_seen_at).toBe(new Date(T0).toISOString());

    clock.advance(60 * 60 * 1000);
    await request(app).get('/api/auth/session').set('Authorization', 'Bearer access-token');
    expect(rows[0]?.last_seen_at).toBe(new Date(T0 + 90 * 60 * 1000).toISOString());
  });

  it('refuses a session unused for 31 days, and does not renew the refused request (US-003/AC-03)', async () => {
    const T0 = 1_700_000_000_000;
    const clock = mutableClock(T0);
    const row: UserProfileRow = { ...EMPLOYEE, last_seen_at: new Date(T0 - 31 * DAY_MS).toISOString() };
    const original = row.last_seen_at;
    const { app, rows } = appWith({
      rows: [row],
      tokens: { 'access-token': row.id },
      nowMs: clock.nowMs,
      sessionLifetimeMs: 30 * DAY_MS,
      lastSeenThrottleMs: HOUR_MS,
    });

    const response = await request(app).get('/api/auth/session').set('Authorization', 'Bearer access-token');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('session_expired');
    // The stamping bug this order guards against: a stamp here would resurrect the very session
    // the rule just refused (design note §2.3).
    expect(rows[0]?.last_seen_at).toBe(original);
  });

  it('never challenges a session across day 1, day 15 and day 29 of the window (US-003/AC-04)', async () => {
    const T0 = 1_700_000_000_000;
    const clock = mutableClock(T0);
    const row: UserProfileRow = { ...EMPLOYEE, last_seen_at: new Date(T0).toISOString() };
    const { app } = appWith({
      rows: [row],
      tokens: { 'access-token': row.id },
      nowMs: clock.nowMs,
      sessionLifetimeMs: 30 * DAY_MS,
      lastSeenThrottleMs: HOUR_MS,
    });

    // Day 1, then day 15 (+14), then day 29 (+14) — each request also renews the window.
    for (const advanceByMs of [1 * DAY_MS, 14 * DAY_MS, 14 * DAY_MS]) {
      clock.advance(advanceByMs);
      const response = await request(app).get('/api/auth/session').set('Authorization', 'Bearer access-token');
      expect(response.status).toBe(200);
    }
  });
});
