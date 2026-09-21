import { describe, expect, it } from 'vitest';
import {
  pushAuthSchema,
  pushEndpointSchema,
  pushOptInRequestSchema,
  pushP256dhSchema,
  pushReadResponseSchema,
  pushSettingsResponseSchema,
} from './notifications.js';

const REAL_SHAPED_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123-def456';
// 87 chars — uncompressed P-256 point (65 bytes). 22 chars — the auth secret (16 bytes). Both
// real-shaped, not real (US-031 design note §4.4).
const P256DH = 'O88gaQz1WqucBQoIRTHLl44h3g_AiFgmOeDGCpZbOJQweweXvs4O1skpArPwIJoSaSueadKE4yJysus0Vg6da-k';
const AUTH = '6_vGXk9KyNjRxqt5n23www';

describe('pushEndpointSchema (US-031/AC-02, design note §4.4 — trust boundary)', () => {
  it('accepts a real-shaped https push endpoint', () => {
    expect(pushEndpointSchema.safeParse(REAL_SHAPED_ENDPOINT).success).toBe(true);
  });

  it('rejects http: — a push service is always TLS', () => {
    expect(pushEndpointSchema.safeParse('http://fcm.googleapis.com/fcm/send/abc123').success).toBe(false);
  });

  it('rejects a URL carrying credentials', () => {
    expect(pushEndpointSchema.safeParse('https://user:pass@fcm.googleapis.com/fcm/send/abc123').success).toBe(false);
  });

  it('rejects localhost — an authenticated SSRF primitive must not resolve inward', () => {
    expect(pushEndpointSchema.safeParse('https://localhost/fcm/send/abc123').success).toBe(false);
  });

  it('rejects a literal IPv4 host', () => {
    expect(pushEndpointSchema.safeParse('https://127.0.0.1/fcm/send/abc123').success).toBe(false);
  });

  it('rejects a literal IPv6 host', () => {
    expect(pushEndpointSchema.safeParse('https://[::1]/fcm/send/abc123').success).toBe(false);
  });

  it('rejects a .local host', () => {
    expect(pushEndpointSchema.safeParse('https://push.local/fcm/send/abc123').success).toBe(false);
  });

  it('rejects a URL over 2048 characters', () => {
    const long = `https://fcm.googleapis.com/fcm/send/${'a'.repeat(2100)}`;
    expect(pushEndpointSchema.safeParse(long).success).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(pushEndpointSchema.safeParse('').success).toBe(false);
  });
});

describe('pushP256dhSchema / pushAuthSchema (US-031, design note §4.4 — derived lengths)', () => {
  it('accepts an 87-character p256dh key', () => {
    expect(pushP256dhSchema.safeParse(P256DH).success).toBe(true);
  });

  it('rejects a p256dh key of the wrong length', () => {
    expect(pushP256dhSchema.safeParse('too-short').success).toBe(false);
  });

  it('accepts a 22-character auth secret', () => {
    expect(pushAuthSchema.safeParse(AUTH).success).toBe(true);
  });

  it('rejects an auth secret of the wrong length', () => {
    expect(pushAuthSchema.safeParse('too-short').success).toBe(false);
  });
});

describe('pushOptInRequestSchema (US-031/AC-02)', () => {
  const valid = { endpoint: REAL_SHAPED_ENDPOINT, p256dh: P256DH, auth: AUTH };

  it('accepts a well-formed subscription', () => {
    expect(pushOptInRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an unknown field — .strict(), matching every other request schema', () => {
    expect(pushOptInRequestSchema.safeParse({ ...valid, expirationTime: null }).success).toBe(false);
  });

  it('rejects a body missing the subscription entirely', () => {
    expect(pushOptInRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('pushSettingsResponseSchema / pushReadResponseSchema (US-031/AC-01, AC-07)', () => {
  it('parses the write routes’ response shape', () => {
    expect(pushSettingsResponseSchema.safeParse({ pushOptIn: false }).success).toBe(true);
  });

  it('parses the read route’s response shape, carrying the VAPID public key alongside the flag', () => {
    expect(pushReadResponseSchema.safeParse({ pushOptIn: true, vapidPublicKey: P256DH }).success).toBe(true);
  });

  it('does not carry anything about whether this browser holds a subscription (design note §3)', () => {
    const parsed = pushReadResponseSchema.parse({ pushOptIn: true, vapidPublicKey: P256DH });
    expect(parsed).not.toHaveProperty('subscriptionExists');
  });
});
