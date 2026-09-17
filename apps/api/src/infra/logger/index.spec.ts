import { describe, expect, it } from 'vitest';
import { __redactForTesting as redact } from './index.js';

describe('logger redaction', () => {
  it('replaces a password anywhere in the structure', () => {
    const out = redact({ user: { email: 'a@b.com', password: 'hunter2' } }) as Record<string, any>;
    expect(out.user.password).toBe('[redacted]');
    expect(out.user.email).toBe('a@b.com');
  });

  it('replaces a service-role key however the field is spelled', () => {
    const out = redact({ serviceRoleKey: 'x', service_role_key: 'y' }) as Record<string, string>;
    expect(out.serviceRoleKey).toBe('[redacted]');
    expect(out.service_role_key).toBe('[redacted]');
  });

  it("replaces a push subscription's keys", () => {
    const out = redact({ subscription: { endpoint: 'https://push', keys: { p256dh: 'k', auth: 'a' } } }) as Record<string, any>;
    expect(out.subscription.keys).toBe('[redacted]');
    expect(out.subscription.endpoint).toBe('https://push');
  });

  it('leaves ordinary request fields alone', () => {
    const out = redact({ method: 'POST', path: '/api/bookings', status: 201 }) as Record<string, unknown>;
    expect(out).toEqual({ method: 'POST', path: '/api/bookings', status: 201 });
  });
});
