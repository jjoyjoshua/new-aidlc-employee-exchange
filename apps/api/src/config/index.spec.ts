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
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ConfigurationError, loadConfig } from './index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const valid = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  OFFICE_TIMEZONE: 'Asia/Kolkata',
  MAIL_PROVIDER: 'console',
  MAIL_API_KEY: 'mail-key',
  MAIL_FROM_ADDRESS: 'desks@example.com',
  // Real-shaped, not real: 87/43 base64url characters, matching an uncompressed P-256 public
  // key and a P-256 private scalar respectively (US-031 design note §4.4, §7). Safe to commit —
  // they sign nothing and were generated for this fixture only.
  VAPID_PUBLIC_KEY: 'O88gaQz1WqucBQoIRTHLl44h3g_AiFgmOeDGCpZbOJQweweXvs4O1skpArPwIJoSaSueadKE4yJysus0Vg6da-k',
  VAPID_PRIVATE_KEY: '8C5_EzOg2Bo50ZwbHWqgjgGyRtjrDMBLz1qqQ9Qssvw',
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

/**
 * US-034 — the mail configuration is validated at boot, not guessed at send time. AC-04 is a
 * boot-time guarantee (app-architecture.md §5.4); the two cases below are exactly the two ways
 * a mail configuration could otherwise fail silently instead (Architect design note §1.2, F-3).
 */
describe('loadConfig — mail (US-034)', () => {
  it('accepts the only implemented transport (US-034/AC-04)', () => {
    const config = loadConfig(valid);
    expect(config.MAIL_PROVIDER).toBe('console');
  });

  it('refuses a MAIL_PROVIDER value nothing implements, rather than booting and failing at the first send (US-034/AC-04)', () => {
    expect(() => loadConfig({ ...valid, MAIL_PROVIDER: 'postmark' })).toThrow(ConfigurationError);
  });

  it('refuses MAIL_PROVIDER=console in production — it never sends, so that would be silently dropped mail with a `sent` row to match (US-034/AC-04)', () => {
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production' })).toThrow(ConfigurationError);
  });

  it('accepts MAIL_PROVIDER=console outside production (US-034/AC-04)', () => {
    const config = loadConfig({ ...valid, NODE_ENV: 'development' });
    expect(config.MAIL_PROVIDER).toBe('console');
  });
});

/**
 * US-034/AC-03 — the production sender address and mail service are absent or clearly
 * placeholder, and the repository says so. Proven two ways: the schema has no default (so a
 * checked-out repo with no `.env` refuses to boot rather than silently picking a value), and
 * `.env.example` ships the keys blank with a comment naming the owner (Architect design note
 * §6, F-2, F-11).
 */
/**
 * US-031 design note §7 — the VAPID keys were non-empty strings and nothing else until this
 * story. A wrong-length key boots fine and fails only at `web-push.setVapidDetails()` (or,
 * worse, silently at the browser's `subscribe()` call) — exactly the class of failure
 * US-034/AC-04's boot-time guarantee exists to prevent everywhere else.
 */
describe('loadConfig — VAPID keys (US-031)', () => {
  it('accepts a well-formed key pair and subject (US-031/AC-02)', () => {
    const config = loadConfig(valid);
    expect(config.VAPID_PUBLIC_KEY).toHaveLength(87);
    expect(config.VAPID_PRIVATE_KEY).toHaveLength(43);
  });

  it('refuses a VAPID_PUBLIC_KEY that is not 87 base64url characters', () => {
    expect(() => loadConfig({ ...valid, VAPID_PUBLIC_KEY: 'too-short' })).toThrow(ConfigurationError);
  });

  it('refuses a VAPID_PRIVATE_KEY that is not 43 base64url characters', () => {
    expect(() => loadConfig({ ...valid, VAPID_PRIVATE_KEY: 'too-short' })).toThrow(ConfigurationError);
  });

  it('refuses a VAPID_SUBJECT that is neither a mailto: nor an https: URL', () => {
    expect(() => loadConfig({ ...valid, VAPID_SUBJECT: 'desks@example.com' })).toThrow(ConfigurationError);
  });

  it('accepts an https: subject as well as mailto:', () => {
    const config = loadConfig({ ...valid, VAPID_SUBJECT: 'https://example.com/contact' });
    expect(config.VAPID_SUBJECT).toBe('https://example.com/contact');
  });
});

describe('.env.example — mail placeholders (US-034/AC-03)', () => {
  const envExample = readFileSync(resolve(HERE, '../../../../.env.example'), 'utf8');

  it('ships MAIL_PROVIDER, MAIL_API_KEY and MAIL_FROM_ADDRESS with no value (US-034/AC-03)', () => {
    for (const key of ['MAIL_PROVIDER', 'MAIL_API_KEY', 'MAIL_FROM_ADDRESS']) {
      expect(envExample).toMatch(new RegExp(`^${key}=$`, 'm'));
    }
  });

  it('says the production values are TBD, owned by IT, rather than leaving the blank unexplained (US-034/AC-03)', () => {
    expect(envExample).toMatch(/TBD.*owner:\s*IT/i);
  });

  it('has no default for MAIL_FROM_ADDRESS — a missing address refuses to boot rather than falling back to one (US-034/AC-03)', () => {
    const { MAIL_FROM_ADDRESS: _omitted, ...incomplete } = valid;
    expect(() => loadConfig(incomplete)).toThrow(ConfigurationError);
  });
});
