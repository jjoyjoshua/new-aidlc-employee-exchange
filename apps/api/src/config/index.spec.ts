/**
 * Scaffold tests for the configuration validator.
 *
 * These deliberately carry **no story or acceptance-criterion citation**. The story that owns
 * configuration failure handling has not been through Gate D1, and a citation here would
 * claim coverage for work nobody has planned or approved. Naming its ID in this file would do
 * the same thing: `aidlc-check` reads an ID in a test file as a citation and requires a
 * matching manifest entry, which is exactly the claim these tests must not make.
 *
 * When that story is implemented, its DEV adds the AC-named tests and the manifest entry;
 * these stay as the unit-level tests underneath.
 */
import { describe, expect, it } from 'vitest';
import { ConfigurationError, loadConfig } from './index.js';

const valid = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  OFFICE_TIMEZONE: 'Asia/Kolkata',
  MAIL_PROVIDER: 'postmark',
  MAIL_API_KEY: 'mail-key',
  MAIL_FROM_ADDRESS: 'desks@example.com',
  VAPID_PUBLIC_KEY: 'vapid-public',
  VAPID_PRIVATE_KEY: 'vapid-private',
  VAPID_SUBJECT: 'mailto:desks@example.com',
  REMINDER_RUN_SECRET: 'reminder-secret',
  CORS_ORIGINS: 'http://localhost:5173',
};

describe('loadConfig', () => {
  it('accepts a complete configuration', () => {
    const config = loadConfig(valid);
    expect(config.OFFICE_TIMEZONE).toBe('Asia/Kolkata');
    expect(config.PORT).toBe(3000);
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:5173']);
  });

  it('refuses to start when a required value is missing', () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omitted, ...incomplete } = valid;
    expect(() => loadConfig(incomplete)).toThrow(ConfigurationError);
  });

  it('refuses an OFFICE_TIMEZONE that is absent rather than falling back to UTC', () => {
    const { OFFICE_TIMEZONE: _omitted, ...incomplete } = valid;
    expect(() => loadConfig(incomplete)).toThrow(ConfigurationError);
  });

  it('refuses an offset where an IANA zone name is required', () => {
    expect(() => loadConfig({ ...valid, OFFICE_TIMEZONE: '+05:30' })).toThrow(ConfigurationError);
  });

  it('refuses a misspelled zone name, so a typo fails the boot rather than the times', () => {
    expect(() => loadConfig({ ...valid, OFFICE_TIMEZONE: 'Asia/Calcuta' })).toThrow(ConfigurationError);
  });

  it('reports every problem at once, not just the first', () => {
    const { SUPABASE_URL: _a, MAIL_API_KEY: _b, VAPID_SUBJECT: _c, ...broken } = valid;
    try {
      loadConfig(broken);
      expect.unreachable('expected loadConfig to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).problems).toHaveLength(3);
    }
  });

  it('never puts a secret value in the error message', () => {
    try {
      loadConfig({ ...valid, SUPABASE_SERVICE_ROLE_KEY: '   ' });
      expect.unreachable('expected loadConfig to throw');
    } catch (error) {
      const message = (error as ConfigurationError).message;
      expect(message).toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(message).toContain('value withheld');
    }
  });

  it('splits CORS origins into an explicit list', () => {
    const config = loadConfig({ ...valid, CORS_ORIGINS: 'https://a.example, https://b.example' });
    expect(config.CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
  });
});

/**
 * NFR-009 — the 30-day session window and its hourly renewal throttle are configuration, not a
 * literal, per the story's own instruction. Both are optional and defaulted: the correct value
 * is the requirement itself, known and identical in every environment (US-003 design note §3(a)).
 */
describe('loadConfig — session lifetime (NFR-009)', () => {
  it('defaults to a 30-day lifetime and a 60-minute throttle when neither is set (US-003/AC-01)', () => {
    const config = loadConfig(valid);
    expect(config.SESSION_LIFETIME_DAYS).toBe(30);
    expect(config.SESSION_LAST_SEEN_THROTTLE_MINUTES).toBe(60);
  });

  it('accepts a shortened lifetime, e.g. for an incident (US-003/AC-01)', () => {
    const config = loadConfig({ ...valid, SESSION_LIFETIME_DAYS: '7' });
    expect(config.SESSION_LIFETIME_DAYS).toBe(7);
  });

  it('refuses a lifetime below 1 day', () => {
    expect(() => loadConfig({ ...valid, SESSION_LIFETIME_DAYS: '0' })).toThrow(ConfigurationError);
  });

  it('refuses a lifetime past the 30-day ceiling RISK-010 was accepted against', () => {
    expect(() => loadConfig({ ...valid, SESSION_LIFETIME_DAYS: '31' })).toThrow(ConfigurationError);
  });

  it('refuses a throttle below 1 minute', () => {
    expect(() => loadConfig({ ...valid, SESSION_LAST_SEEN_THROTTLE_MINUTES: '0' })).toThrow(ConfigurationError);
  });

  it('refuses a throttle above 1440 minutes (one day)', () => {
    expect(() => loadConfig({ ...valid, SESSION_LAST_SEEN_THROTTLE_MINUTES: '1441' })).toThrow(ConfigurationError);
  });

  it('refuses a throttle that meets or exceeds the lifetime — AC-02 would silently stop holding (US-003/AC-02)', () => {
    // At this setting last_seen_at is never refreshed before the session expires, so sliding
    // renewal silently becomes a fixed window from sign-in — the exact behaviour AC-02 forbids.
    expect(() =>
      loadConfig({ ...valid, SESSION_LIFETIME_DAYS: '1', SESSION_LAST_SEEN_THROTTLE_MINUTES: '1440' }),
    ).toThrow(ConfigurationError);
  });

  it('accepts a throttle just below the lifetime (US-003/AC-02)', () => {
    const config = loadConfig({ ...valid, SESSION_LIFETIME_DAYS: '1', SESSION_LAST_SEEN_THROTTLE_MINUTES: '1439' });
    expect(config.SESSION_LAST_SEEN_THROTTLE_MINUTES).toBe(1439);
  });
});
