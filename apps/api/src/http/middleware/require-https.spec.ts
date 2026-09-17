import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { requireHttps } from './require-https.js';
import { errorHandler } from '../error-handler.js';

/**
 * US-001/AC-08 — "credentials are never sent in the clear".
 *
 * The story's QA note calls this environment-level, and the deployed half is. But half of it is
 * cheaply provable in CI, and proving half of a security criterion beats deferring all of it to
 * an environment nobody has chosen yet (`app-architecture.md` §7 item 3).
 */
const appWith = (production: boolean) => {
  const app = express();
  app.use(requireHttps({ production }));
  app.post('/api/auth/sign-in', (_req, res) => {
    res.json({ reached: true });
  });
  app.use(errorHandler);
  return app;
};

describe('requireHttps in production (US-001/AC-08)', () => {
  it('refuses a plain-HTTP request to the sign-in endpoint (US-001/AC-08)', async () => {
    const response = await request(appWith(true))
      .post('/api/auth/sign-in')
      .set('x-forwarded-proto', 'http')
      .send({ email: 'priya@company.com', password: 'correct' });

    expect(response.status).toBe(403);
    expect(response.body.reached).toBeUndefined();
  });

  it('serves a request that arrived over HTTPS (US-001/AC-08)', async () => {
    const response = await request(appWith(true))
      .post('/api/auth/sign-in')
      .set('x-forwarded-proto', 'https')
      .send({ email: 'priya@company.com', password: 'correct' });

    expect(response.status).toBe(200);
    expect(response.body.reached).toBe(true);
  });

  it('carries Strict-Transport-Security on a served response (US-001/AC-08)', async () => {
    const response = await request(appWith(true))
      .post('/api/auth/sign-in')
      .set('x-forwarded-proto', 'https')
      .send({});

    expect(response.headers['strict-transport-security']).toMatch(/max-age=\d+/);
  });

  it('takes the first value when a proxy chain sent a list (US-001/AC-08)', async () => {
    // Multiple proxies append: `x-forwarded-proto: https, http`. The FIRST entry is the scheme
    // the client actually used; reading the last would let an internal hop mask a plaintext
    // client connection.
    const response = await request(appWith(true))
      .post('/api/auth/sign-in')
      .set('x-forwarded-proto', 'http, https')
      .send({});

    expect(response.status).toBe(403);
  });

  it('refuses when the header is absent in production (US-001/AC-08)', async () => {
    // Absent means we cannot show the connection was encrypted. For the one unauthenticated
    // route that carries a password, refusing is the right default — a misconfigured proxy
    // should present as a broken deploy, not as credentials in the clear.
    const response = await request(appWith(true)).post('/api/auth/sign-in').send({});

    expect(response.status).toBe(403);
  });
});

describe('requireHttps outside production (US-001/AC-08)', () => {
  it('serves plain HTTP in development, where there is no TLS terminator (US-001/AC-08)', async () => {
    const response = await request(appWith(false))
      .post('/api/auth/sign-in')
      .set('x-forwarded-proto', 'http')
      .send({});

    expect(response.status).toBe(200);
  });

  it('sets no HSTS header outside production (US-001/AC-08)', async () => {
    // HSTS on localhost pins the whole origin to HTTPS in the developer's browser, which then
    // refuses to load the dev server. It is a genuinely painful thing to undo.
    const response = await request(appWith(false)).post('/api/auth/sign-in').send({});

    expect(response.headers['strict-transport-security']).toBeUndefined();
  });
});
