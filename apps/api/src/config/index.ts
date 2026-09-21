/**
 * Configuration — read once, validated once, and the process refuses to start if anything
 * required is missing or malformed (US-034/AC-04, app-architecture.md §5.4).
 *
 * This is the only module in the server permitted to touch `process.env`; the lint config
 * enforces that. A service that boots with half a configuration does not fail here — it
 * fails later, in production, quietly, which is the failure this module exists to prevent.
 *
 * Protected path: any change here is Complex (`ai/standards/task-surfaces.md`).
 */
import { z } from 'zod';
import { SESSION_LIFETIME_DAYS_MAX, LAST_SEEN_THROTTLE_MINUTES_DEFAULT } from '../domain/session-lifetime.js';

const nonEmpty = (what: string) => z.string().trim().min(1, `${what} is required`);

/** IANA zone name, not an offset. Validated by asking the platform, so a typo fails the
 *  boot rather than producing times that are quietly wrong. `Asia/Kolkata` is UTC+05:30 —
 *  a half-hour offset that whole-hour assumptions get wrong (NFR-001). */
const ianaTimeZone = z.string().trim().min(1).refine(
  (value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'must be an IANA time zone name, e.g. Asia/Kolkata — not an offset' },
);

/**
 * No `.default()` on OFFICE_TIMEZONE, deliberately, even though the value is known.
 * A default of UTC would make BR-001.14's explicit failure case — reminders fired at 08:00
 * UTC while the office is not on UTC — the out-of-the-box behaviour. NFR-001 says a missing
 * value must refuse process start rather than fall back.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  SUPABASE_URL: nonEmpty('SUPABASE_URL').url(),
  SUPABASE_ANON_KEY: nonEmpty('SUPABASE_ANON_KEY'),
  /** Bypasses every RLS policy in the project. Server-only, never bundled, never logged,
   *  read in exactly one module (`infra/supabase`). See ADR-001. */
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty('SUPABASE_SERVICE_ROLE_KEY'),

  OFFICE_TIMEZONE: ianaTimeZone,

  /** The set of transports `infra/mailer` actually implements — currently just `console`, which
   *  logs and never sends. A provider we have not written is a configuration error, not a
   *  runtime surprise: `app-architecture.md` §5.4 cites US-034/AC-04 as a BOOT-time guarantee,
   *  so an unrecognised value must fail here, not the first time somebody books a desk
   *  (Architect design note §1.2, US-034/F-3). */
  MAIL_PROVIDER: z.enum(['console']),
  MAIL_API_KEY: nonEmpty('MAIL_API_KEY'),
  MAIL_FROM_ADDRESS: nonEmpty('MAIL_FROM_ADDRESS').email(),

  VAPID_PUBLIC_KEY: nonEmpty('VAPID_PUBLIC_KEY'),
  VAPID_PRIVATE_KEY: nonEmpty('VAPID_PRIVATE_KEY'),
  VAPID_SUBJECT: nonEmpty('VAPID_SUBJECT'),

  /** The reminder run is guarded by a shared secret, not a user session — no user triggers
   *  it (app-architecture.md §4.3). */
  REMINDER_RUN_SECRET: nonEmpty('REMINDER_RUN_SECRET'),

  /** Explicit origins per environment; never `*` outside local dev. */
  CORS_ORIGINS: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),

  /**
   * NFR-009 — optional and defaulted, deliberately: the correct value is the requirement
   * itself, known and identical in every environment, so a required key would break every
   * existing deployment to make it retype `30` (US-003 design note §3(a)). The ceiling is
   * `domain/session-lifetime.ts`'s own constant, so NFR-009's number appears once (§3(b)); an
   * operator may shorten the window during an incident, never lengthen it past what RISK-010
   * was accepted against.
   */
  SESSION_LIFETIME_DAYS: z.coerce.number().int().min(1).max(SESSION_LIFETIME_DAYS_MAX).default(SESSION_LIFETIME_DAYS_MAX),
  /** A cost knob (how much write traffic a renewal is worth), not a requirement — db-design.md
   *  §1.1. Bounded to at most a day so a typo cannot silently disable renewal for a week. */
  SESSION_LAST_SEEN_THROTTLE_MINUTES: z.coerce.number().int().min(1).max(1440).default(LAST_SEEN_THROTTLE_MINUTES_DEFAULT),
})
  /**
   * At throttle >= lifetime, `last_seen_at` is never refreshed before the session expires, so
   * sliding renewal silently becomes a fixed window from sign-in — exactly what AC-02 forbids,
   * reachable by a plausible typo (minutes instead of hours). Refusing to boot turns that into
   * a process that will not start, which is what this module is for (US-003 design note §3).
   */
  .superRefine((value, ctx) => {
    const lifetimeMs = value.SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000;
    const throttleMs = value.SESSION_LAST_SEEN_THROTTLE_MINUTES * 60 * 1000;
    if (throttleMs >= lifetimeMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_LAST_SEEN_THROTTLE_MINUTES'],
        message: 'SESSION_LAST_SEEN_THROTTLE_MINUTES must be less than SESSION_LIFETIME_DAYS, or sessions never renew',
      });
    }

    /** `console` never sends — it logs and reports success. In production that is mail
     *  silently dropped with a `sent` row to match, which is exactly what US-034/AC-04 forbids
     *  (Architect design note §1.2, F-3). The real provider is `TBD (owner: IT)` — this refusal
     *  is what makes going live without one a boot failure instead of a quiet one. */
    if (value.NODE_ENV === 'production' && value.MAIL_PROVIDER === 'console') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MAIL_PROVIDER'],
        message:
          'MAIL_PROVIDER=console writes mail to the log and sends nothing. In production that ' +
          'is silently dropped mail with a `sent` row to match (US-034/AC-04). Set the real ' +
          'provider once chosen — TBD (owner: IT), BRD-001 open question #7.',
      });
    }
  });

export type Config = z.infer<typeof schema>;

/** Keys whose values must never reach a log line, an error message, or the browser. */
const SECRET_KEYS = new Set([
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'MAIL_API_KEY',
  'VAPID_PRIVATE_KEY',
  'REMINDER_RUN_SECRET',
]);

export class ConfigurationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Configuration is not usable:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigurationError';
  }
}

/**
 * Parse and validate. Throws `ConfigurationError` listing **every** problem, not just the
 * first — a boot that fails three times over three deploys wastes three deploys.
 *
 * The error names the offending keys but never their values: an invalid secret is still a
 * secret, and this message is the one most likely to be pasted into a chat window.
 */
export function loadConfig(source: Record<string, string | undefined>): Config {
  const result = schema.safeParse(source);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const key = issue.path.join('.') || '(root)';
    return SECRET_KEYS.has(key) ? `${key}: ${issue.message} (value withheld)` : `${key}: ${issue.message}`;
  });
  throw new ConfigurationError(problems);
}

let cached: Config | undefined;

/** The single read of `process.env` in the server. */
export function config(): Config {
  cached ??= loadConfig(process.env);
  return cached;
}

/** Test seam: lets a spec install a known configuration without touching the environment. */
export function setConfigForTesting(value: Config | undefined): void {
  cached = value;
}
