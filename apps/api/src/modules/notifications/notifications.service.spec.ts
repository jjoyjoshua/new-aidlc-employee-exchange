/**
 * Fakes throughout — `bookings.service.spec.ts`'s convention. `deliveries` is an in-memory
 * recorder read back for its observable state, never asserted as "was called with"; `send` is
 * a fake transport, since `infra/mailer`'s only real transport (`console`) never fails and so
 * cannot exercise the failure paths these tests are about.
 */
import { describe, expect, it } from 'vitest';
import { createNotificationsService, type SendEmailInput } from './notifications.service.js';
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
