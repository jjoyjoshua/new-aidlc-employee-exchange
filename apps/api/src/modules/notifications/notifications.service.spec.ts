/**
 * Fakes throughout — `bookings.service.spec.ts`'s convention. `deliveries` is an in-memory
 * recorder read back for its observable state, never asserted as "was called with"; `send` is
 * a fake transport, since `infra/mailer`'s only real transport (`console`) never fails and so
 * cannot exercise the failure paths these tests are about.
 */
import { describe, expect, it } from 'vitest';
import { createNotificationsService, type BookingConfirmationInput, type SendEmailInput } from './notifications.service.js';
import type { DeliveryRow, NotificationsRepository } from './notifications.repository.js';
import type { MailMessage, SendMailResult } from '../../infra/mailer/index.js';

function recordingDeliveries(): NotificationsRepository & { rows: DeliveryRow[] } {
  const rows: DeliveryRow[] = [];
  return {
    rows,
    async insertDelivery(row) {
      rows.push(row);
    },
  };
}

function throwingDeliveries(): NotificationsRepository {
  return {
    async insertDelivery() {
      throw new Error('connection refused');
    },
  };
}

function fixedSend(result: SendMailResult): (message: MailMessage) => Promise<SendMailResult> {
  return async () => result;
}

/** Captures the exact `MailMessage` `sendMail` would have received — the one thing US-028 adds
 *  over US-034's own tests, which never composed a message. Never asserted as "was called with
 *  these args" via a mocking library; read back as plain data instead. */
function capturingSend(result: SendMailResult = { ok: true }): {
  send: (message: MailMessage) => Promise<SendMailResult>;
  messages: MailMessage[];
} {
  const messages: MailMessage[] = [];
  return {
    messages,
    async send(message) {
      messages.push(message);
      return result;
    },
  };
}

const CONFIRMATION_INPUT: BookingConfirmationInput = {
  bookingId: 'b1',
  userId: 'u1',
  email: 'dana@example.com',
  deskNumber: 'A-01',
  date: '2026-09-22',
};

const INPUT: SendEmailInput = {
  kind: 'confirmation',
  bookingId: 'b1',
  userId: 'u1',
  recipient: 'dana@example.com',
  subject: 'Your desk is booked',
  body: 'A-01, 2026-09-22',
};

describe('recordAndSend — a successful send (US-034/AC-05)', () => {
  it('records exactly one sent row with no error_detail, and returns ok/recorded (US-034/AC-05)', async () => {
    const deliveries = recordingDeliveries();
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: true }) });

    const result = await svc.recordAndSend(INPUT);

    expect(result).toEqual({ ok: true, recorded: true });
    expect(deliveries.rows).toHaveLength(1);
    expect(deliveries.rows[0]).toEqual({
      bookingId: 'b1',
      userId: 'u1',
      channel: 'email',
      kind: 'confirmation',
      recipient: 'dana@example.com',
      outcome: 'sent',
      errorDetail: undefined,
    });
  });

  it('hardcodes channel to email regardless of kind — this function is the email path (US-034/AC-08)', async () => {
    const deliveries = recordingDeliveries();
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: true }) });

    await svc.recordAndSend({ ...INPUT, kind: 'reminder' });

    expect(deliveries.rows[0]!.channel).toBe('email');
  });
});

describe('recordAndSend — a failed send never throws and is fully recorded (US-034/AC-05, AC-07)', () => {
  it('records exactly one failed row with the sanitized reason, and resolves rather than rejecting — a mail failure never risks the callers own write (US-034/AC-07)', async () => {
    const deliveries = recordingDeliveries();
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: false, error: 'transport_rejected' }) });

    const result = await svc.recordAndSend(INPUT);

    expect(result).toEqual({ ok: false, error: 'transport_rejected', recorded: true });
    expect(deliveries.rows).toHaveLength(1);
    expect(deliveries.rows[0]).toMatchObject({ outcome: 'failed', errorDetail: 'transport_rejected' });
  });

  it('replaces a failure reason outside the known set with transport_unknown before it can reach the row (US-034/AC-06)', async () => {
    // Simulates a transport that ignores MailFailureReason's type at runtime — TypeScript has
    // no runtime enforcement of a union (Architect design note §4, F-5).
    const badResult = { ok: false, error: 'auth failed: apikey=sk-live-abc123' } as unknown as SendMailResult;
    const badSend = fixedSend(badResult);
    const deliveries = recordingDeliveries();
    const svc = createNotificationsService({ deliveries, send: badSend });

    const result = await svc.recordAndSend(INPUT);

    expect(result).toEqual({ ok: false, error: 'transport_unknown', recorded: true });
    expect(deliveries.rows[0]!.errorDetail).toBe('transport_unknown');
    expect(JSON.stringify(deliveries.rows)).not.toContain('sk-live-abc123');
  });
});

describe('recordAndSend — the delivery-log write itself fails (US-034/AC-05, AC-07, design note F-4)', () => {
  it('never throws, and reports recorded:false rather than silently losing the failed send', async () => {
    const svc = createNotificationsService({
      deliveries: throwingDeliveries(),
      send: fixedSend({ ok: false, error: 'transport_unreachable' }),
    });

    const result = await svc.recordAndSend(INPUT);

    expect(result).toEqual({ ok: false, error: 'transport_unreachable', recorded: false });
  });

  it('never throws even when the send itself succeeded but the row could not be written', async () => {
    const svc = createNotificationsService({ deliveries: throwingDeliveries(), send: fixedSend({ ok: true }) });

    const result = await svc.recordAndSend(INPUT);

    expect(result).toEqual({ ok: true, recorded: false });
  });
});

describe('recordAndSend — one function, every message kind (US-034/AC-08)', () => {
  it('produces independent rows for a confirmation and a cancellation through the identical function', async () => {
    const deliveries = recordingDeliveries();
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: true }) });

    await svc.recordAndSend({ ...INPUT, kind: 'confirmation', bookingId: 'b1' });
    await svc.recordAndSend({ ...INPUT, kind: 'cancellation', bookingId: 'b2' });

    expect(deliveries.rows).toHaveLength(2);
    expect(deliveries.rows.map((r) => r.kind)).toEqual(['confirmation', 'cancellation']);
    expect(deliveries.rows.map((r) => r.bookingId)).toEqual(['b1', 'b2']);
  });
});

describe('sendBookingConfirmation — sends to the owner alone (US-028/AC-01, AC-03)', () => {
  it('records exactly one sent, confirmation row, addressed to the given email and nobody else (US-028/AC-01, US-028/AC-03)', async () => {
    const deliveries = recordingDeliveries();
    const { send } = capturingSend();
    const svc = createNotificationsService({ deliveries, send });

    const result = await svc.sendBookingConfirmation(CONFIRMATION_INPUT);

    expect(result).toEqual({ ok: true, recorded: true });
    expect(deliveries.rows).toHaveLength(1);
    expect(deliveries.rows[0]).toMatchObject({
      bookingId: 'b1',
      userId: 'u1',
      kind: 'confirmation',
      recipient: 'dana@example.com',
      outcome: 'sent',
    });
  });
});

describe('sendBookingConfirmation — names the desk and the date (US-028/AC-02)', () => {
  it('composes a subject and body that both name the desk number and the date (US-028/AC-02)', async () => {
    const deliveries = recordingDeliveries();
    const { send, messages } = capturingSend();
    const svc = createNotificationsService({ deliveries, send });

    await svc.sendBookingConfirmation(CONFIRMATION_INPUT);

    expect(messages).toHaveLength(1);
    expect(messages[0]!.subject).toContain('A-01');
    expect(messages[0]!.subject).toContain('2026-09-22');
    expect(messages[0]!.body).toContain('A-01');
    expect(messages[0]!.body).toContain('2026-09-22');
  });

  it('reflects a different desk and date without a code change — it is composed, not a fixed string', async () => {
    const deliveries = recordingDeliveries();
    const { send, messages } = capturingSend();
    const svc = createNotificationsService({ deliveries, send });

    await svc.sendBookingConfirmation({ ...CONFIRMATION_INPUT, deskNumber: 'B-07', date: '2026-10-01' });

    expect(messages[0]!.subject).toContain('B-07');
    expect(messages[0]!.subject).toContain('2026-10-01');
  });
});

describe('sendBookingConfirmation — mandatory, unconditional (US-028/AC-04)', () => {
  it('has no parameter that could suppress the send — every call reaches the transport (US-028/AC-04)', async () => {
    const deliveries = recordingDeliveries();
    const { send, messages } = capturingSend();
    const svc = createNotificationsService({ deliveries, send });

    await svc.sendBookingConfirmation(CONFIRMATION_INPUT);

    expect(messages).toHaveLength(1);
  });
});

describe('sendBookingConfirmation — the sender is never this composer’s to set (US-028/AC-08)', () => {
  it('hands send() only to/subject/body — no sender field for this module to control; the address comes from config() inside sendMail (US-034) (US-028/AC-08)', async () => {
    const deliveries = recordingDeliveries();
    const { send, messages } = capturingSend();
    const svc = createNotificationsService({ deliveries, send });

    await svc.sendBookingConfirmation(CONFIRMATION_INPUT);

    expect(Object.keys(messages[0]!)).toEqual(['to', 'subject', 'body']);
  });
});

describe('sendBookingConfirmation — a mail failure is recorded, never thrown (US-028/AC-07)', () => {
  it('resolves ok:false rather than rejecting when the transport is unavailable (US-028/AC-07)', async () => {
    const deliveries = recordingDeliveries();
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: false, error: 'transport_unreachable' }) });

    const result = await svc.sendBookingConfirmation(CONFIRMATION_INPUT);

    expect(result).toEqual({ ok: false, error: 'transport_unreachable', recorded: true });
    expect(deliveries.rows[0]).toMatchObject({ outcome: 'failed', kind: 'confirmation' });
  });
});
