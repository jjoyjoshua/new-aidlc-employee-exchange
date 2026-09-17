/**
 * Structured JSON logging, one line per event (app-architecture.md §5.5).
 *
 * The redaction below is a constraint, not a habit: a password, a token, the service-role
 * key or a push subscription's keys must never reach a log line. RISK-005 specifically
 * requires administrator-set passwords to stay out of persistent logs.
 *
 * `console.log` is banned in server code by the lint config for exactly this reason — it is
 * the path by which a whole request body, secrets included, ends up in a log aggregator.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

/** Field names whose values are replaced before anything is written. */
const REDACT = [
  'password',
  'newpassword',
  'currentpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'apikey',
  'servicerolekey',
  'secret',
  'keys',
  'auth',
  'p256dh',
];

const shouldRedact = (key: string) => REDACT.includes(key.toLowerCase().replace(/[-_]/g, ''));

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      shouldRedact(key) ? '[redacted]' : redact(item, depth + 1),
    ]),
  );
}

function write(level: Level, message: string, fields?: Record<string, unknown>): void {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  });
  // The one permitted write to stdout/stderr in the server.
  // eslint-disable-next-line no-console
  (level === 'error' || level === 'warn' ? console.error : console.log)(line);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write('error', message, fields),
};

/** Exposed for the redaction tests. */
export const __redactForTesting = redact;
