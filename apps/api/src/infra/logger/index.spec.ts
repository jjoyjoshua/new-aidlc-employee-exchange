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
  });

  /**
   * US-031 design note §4.5. `endpoint` is a capability URL — anyone holding it can push to
   * that browser — so it is redacted the same as the subscription's keys, not left as an
   * apparently-harmless string (a real regression: the pre-US-031 version of this test
   * asserted the opposite).
   */
  it('replaces a push subscription endpoint, not just its keys (US-031)', () => {
    const out = redact({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc123' }) as Record<string, unknown>;
    expect(out.endpoint).toBe('[redacted]');
  });

  it('leaves ordinary request fields alone', () => {
    const out = redact({ method: 'POST', path: '/api/bookings', status: 201 }) as Record<string, unknown>;
    expect(out).toEqual({ method: 'POST', path: '/api/bookings', status: 201 });
  });
});
