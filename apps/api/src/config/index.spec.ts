/**
 * Scaffold tests for the configuration validator.
 *
 * These deliberately carry **no `US-###/AC-##` citation**. US-034 has not been through Gate
 * D1, and a citation here would claim coverage for a story nobody has planned or approved.
 * When US-034 is implemented, its DEV adds the AC-named tests; these stay as the unit-level
 * ones underneath.
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
