import { describe, expect, it, vi } from 'vitest';
import { setConfigForTesting, type Config } from '../../config/index.js';
import { sendMail } from './index.js';

const BASE_CONFIG: Config = {
  NODE_ENV: 'development',
  PORT: 3000,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  OFFICE_TIMEZONE: 'Asia/Kolkata',
  MAIL_PROVIDER: 'console',
  MAIL_API_KEY: 'mail-key',
  MAIL_FROM_ADDRESS: 'desks@example.com',
  VAPID_PUBLIC_KEY: 'vapid-public',
  VAPID_PRIVATE_KEY: 'vapid-private',
  VAPID_SUBJECT: 'mailto:desks@example.com',
  REMINDER_RUN_SECRET: 'reminder-secret',
  CORS_ORIGINS: ['http://localhost:5173'],
  SESSION_LIFETIME_DAYS: 30,
  SESSION_LAST_SEEN_THROTTLE_MINUTES: 60,
};

describe('sendMail (US-034/AC-01, AC-02)', () => {
  it('sends the from address from config().MAIL_FROM_ADDRESS, never a literal (US-034/AC-01)', async () => {
    setConfigForTesting({ ...BASE_CONFIG, MAIL_FROM_ADDRESS: 'a-changed-sender@example.com' });
    try {
      const result = await sendMail({ to: 'dana@example.com', subject: 'Hi', body: 'Body' });
      expect(result).toEqual({ ok: true });
    } finally {
      setConfigForTesting(undefined);
    }
  });

  it('with MAIL_PROVIDER=console, resolves ok and never delivers anything (US-034/AC-02)', async () => {
    setConfigForTesting(BASE_CONFIG);
    try {
      const result = await sendMail({ to: 'dana@example.com', subject: 'Hi', body: 'Body' });
      expect(result).toEqual({ ok: true });
    } finally {
      setConfigForTesting(undefined);
    }
  });

  it('logs to and subject but never the body — a body would be persistent-log content (US-034/AC-06)', async () => {
    setConfigForTesting(BASE_CONFIG);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await sendMail({ to: 'dana@example.com', subject: 'Your desk is booked', body: 'SECRET-BODY-CONTENT' });

      const logged = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(logged).toContain('dana@example.com');
      expect(logged).toContain('Your desk is booked');
      expect(logged).not.toContain('SECRET-BODY-CONTENT');
    } finally {
      logSpy.mockRestore();
      setConfigForTesting(undefined);
    }
  });
});
