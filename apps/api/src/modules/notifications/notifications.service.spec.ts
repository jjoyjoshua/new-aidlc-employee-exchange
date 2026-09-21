/**
 * Fakes throughout — `bookings.service.spec.ts`'s convention. `deliveries` is an in-memory
 * recorder read back for its observable state, never asserted as "was called with"; `send` is
 * a fake transport, since `infra/mailer`'s only real transport (`console`) never fails and so
 * cannot exercise the failure paths these tests are about.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createNotificationsService,
  type BookingCancellationInput,
  type BookingConfirmationInput,
  type BookingReminderInput,
  type SendEmailInput,
} from './notifications.service.js';
import type {
  DeliveryRow,
  NotificationsRepository,
  PushSubscriptionRecipient,
  PushSubscriptionRow,
} from './notifications.repository.js';
import type { MailMessage, SendMailResult } from '../../infra/mailer/index.js';
import type { PushFailureReason } from '../../infra/webpush/index.js';
import type { CancellationSource } from '../../domain/cancellation-copy.js';
import { formatShortDate } from '../../domain/format-display-date.js';
import { setConfigForTesting, type Config } from '../../config/index.js';

/** US-032. Every test in this file that does NOT exercise the push channel passes this —
 *  `sendBookingConfirmation`/`sendBookingCancellation`'s push fan-out is wrapped so a repository
 *  fake that throws on `getPushOptIn` (`NOT_STUBBED_PUSH` below) is caught before `sendPush`
 *  would ever be called; this stub makes that "never reached" claim a test failure if it is
 *  ever wrong. */
async function NOT_STUBBED_SEND_PUSH(): Promise<{ ok: true } | { ok: false; error: PushFailureReason }> {
  throw new Error('sendPush not stubbed — this test does not exercise the push channel');
}

/** US-031's four methods, not stubbed — none of the email-path fakes above exercise push.
 *  Spread into each fake so `NotificationsRepository`'s wider surface still typechecks here. */
const NOT_STUBBED_PUSH = {
  async getPushOptIn(): Promise<boolean> {
    throw new Error('getPushOptIn not stubbed — this fake only exercises the email path');
  },
  async setPushOptIn(): Promise<boolean> {
    throw new Error('setPushOptIn not stubbed — this fake only exercises the email path');
  },
  async upsertPushSubscription(): Promise<void> {
    throw new Error('upsertPushSubscription not stubbed — this fake only exercises the email path');
  },
  async deletePushSubscriptions(): Promise<void> {
    throw new Error('deletePushSubscriptions not stubbed — this fake only exercises the email path');
  },
  async listPushSubscriptions(): Promise<PushSubscriptionRecipient[]> {
    throw new Error('listPushSubscriptions not stubbed — this fake only exercises the email path');
  },
  async deletePushSubscriptionByEndpoint(): Promise<void> {
    throw new Error('deletePushSubscriptionByEndpoint not stubbed — this fake only exercises the email path');
  },
  async markPushSubscriptionDelivered(): Promise<void> {
    throw new Error('markPushSubscriptionDelivered not stubbed — this fake only exercises the email path');
  },
};

function recordingDeliveries(): NotificationsRepository & { rows: DeliveryRow[] } {
  const rows: DeliveryRow[] = [];
  return {
    rows,
    async insertDelivery(row) {
      rows.push(row);
    },
    async claimReminderSent() {
      throw new Error('claimReminderSent not stubbed — this fake only exercises insertDelivery');
    },
    async markDeliveryFailed() {
      throw new Error('markDeliveryFailed not stubbed — this fake only exercises insertDelivery');
    },
    ...NOT_STUBBED_PUSH,
  };
}

function throwingDeliveries(): NotificationsRepository {
  return {
    async insertDelivery() {
      throw new Error('connection refused');
    },
    async claimReminderSent() {
      throw new Error('claimReminderSent not stubbed — this fake only exercises insertDelivery');
    },
    async markDeliveryFailed() {
      throw new Error('markDeliveryFailed not stubbed — this fake only exercises insertDelivery');
    },
    ...NOT_STUBBED_PUSH,
  };
}

/** US-030. Controllable claim-first fake — `claimed` set once, consumed by the first call, so a
 *  test can simulate "first run claims it, second run finds it already claimed" without a real
 *  unique index. `rows`/`failedIds` are read back as plain data, matching this file's own
 *  convention of never asserting a mock "was called with". */
function claimingDeliveries(
  claimed: boolean[] = [true],
  options: { demotionThrows?: boolean } = {},
): NotificationsRepository & {
  claimedRows: DeliveryRow[];
  failed: Array<{ id: string; errorDetail: string }>;
} {
  const claimedRows: DeliveryRow[] = [];
  const failed: Array<{ id: string; errorDetail: string }> = [];
  const queue = [...claimed];
  let nextId = 0;
  return {
    claimedRows,
    failed,
    async insertDelivery() {
      throw new Error('insertDelivery not stubbed — this fake only exercises the claim-first path');
    },
    async claimReminderSent(row) {
      const willClaim = queue.length > 1 ? queue.shift()! : (queue[0] ?? true);
      if (!willClaim) return { claimed: false };
      claimedRows.push(row);
      nextId += 1;
      return { claimed: true, id: `delivery-${nextId}` };
    },
    async markDeliveryFailed(id, errorDetail) {
      if (options.demotionThrows) throw new Error('connection refused');
      failed.push({ id, errorDetail });
    },
    ...NOT_STUBBED_PUSH,
  };
}

/** The email-path methods, not stubbed — none of the push fakes below exercise the mail path. */
const NOT_STUBBED_EMAIL = {
  async insertDelivery(): Promise<void> {
    throw new Error('insertDelivery not stubbed — this fake only exercises the push path');
  },
  async claimReminderSent(): Promise<never> {
    throw new Error('claimReminderSent not stubbed — this fake only exercises the push path');
  },
  async markDeliveryFailed(): Promise<void> {
    throw new Error('markDeliveryFailed not stubbed — this fake only exercises the push path');
  },
};

/**
 * A controllable push-path fake. `optIn` is the flag's CURRENT stored value, read by
 * `getPushOptIn` and mutated by `setPushOptIn`. `subscriptions`/`deletedFor` are read back as
 * plain data (this file's own convention), never asserted as "was called with" via a mock.
 * `failing` names which method(s) throw, so a test can prove the write-ordering rule directly.
 */
function pushDeliveries(
  options: { optIn?: boolean; failing?: Set<'upsert' | 'setFlag' | 'delete'> } = {},
): NotificationsRepository & {
  subscriptions: PushSubscriptionRow[];
  deletedFor: string[];
  flag: boolean;
} {
  let flag = options.optIn ?? false;
  const failing = options.failing ?? new Set();
  const subscriptions: PushSubscriptionRow[] = [];
  const deletedFor: string[] = [];

  return {
    ...NOT_STUBBED_EMAIL,
    subscriptions,
    deletedFor,
    get flag() {
      return flag;
    },
    async getPushOptIn() {
      return flag;
    },
    async setPushOptIn(_userId, value) {
      if (failing.has('setFlag')) throw new Error('connection refused');
      flag = value;
      return flag;
    },
    async upsertPushSubscription(row) {
      if (failing.has('upsert')) throw new Error('connection refused');
      subscriptions.push(row);
    },
    async deletePushSubscriptions(userId) {
      if (failing.has('delete')) throw new Error('connection refused');
      deletedFor.push(userId);
    },
    async listPushSubscriptions(): Promise<PushSubscriptionRecipient[]> {
      throw new Error('listPushSubscriptions not stubbed — this fake only exercises US-031 opt-in/opt-out');
    },
    async deletePushSubscriptionByEndpoint(): Promise<void> {
      throw new Error('deletePushSubscriptionByEndpoint not stubbed — this fake only exercises US-031 opt-in/opt-out');
    },
    async markPushSubscriptionDelivered(): Promise<void> {
      throw new Error('markPushSubscriptionDelivered not stubbed — this fake only exercises US-031 opt-in/opt-out');
    },
  };
}

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
  VAPID_PUBLIC_KEY: 'O88gaQz1WqucBQoIRTHLl44h3g_AiFgmOeDGCpZbOJQweweXvs4O1skpArPwIJoSaSueadKE4yJysus0Vg6da-k',
  VAPID_PRIVATE_KEY: '8C5_EzOg2Bo50ZwbHWqgjgGyRtjrDMBLz1qqQ9Qssvw',
  VAPID_SUBJECT: 'mailto:desks@example.com',
  REMINDER_RUN_SECRET: 'reminder-secret',
  CORS_ORIGINS: ['http://localhost:5173'],
  SESSION_LIFETIME_DAYS: 30,
  SESSION_LAST_SEEN_THROTTLE_MINUTES: 60,
};

const USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  p256dh: 'O88gaQz1WqucBQoIRTHLl44h3g_AiFgmOeDGCpZbOJQweweXvs4O1skpArPwIJoSaSueadKE4yJysus0Vg6da-k',
  auth: '6_vGXk9KyNjRxqt5n23www',
  userAgent: 'Mozilla/5.0',
};

describe('getPushSettings (US-031/FR-01, AC-08, AC-09)', () => {
  it('returns the stored flag alongside the VAPID public key, never anything about a subscription', async () => {
    setConfigForTesting(BASE_CONFIG);
    try {
      const svc = createNotificationsService({ deliveries: pushDeliveries({ optIn: true }), send: fixedSend({ ok: true }), sendPush: NOT_STUBBED_SEND_PUSH });

      const result = await svc.getPushSettings(USER_ID);

      expect(result).toEqual({ pushOptIn: true, vapidPublicKey: BASE_CONFIG.VAPID_PUBLIC_KEY });
    } finally {
      setConfigForTesting(undefined);
    }
  });

  it('propagates a read failure rather than guessing a default (US-031/AC-08)', async () => {
    setConfigForTesting(BASE_CONFIG);
    const deliveries = pushDeliveries();
    deliveries.getPushOptIn = async () => {
      throw new Error('connection refused');
    };
    try {
      const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: true }), sendPush: NOT_STUBBED_SEND_PUSH });
      await expect(svc.getPushSettings(USER_ID)).rejects.toThrow('connection refused');
    } finally {
      setConfigForTesting(undefined);
    }
  });
});

describe('optIntoPush — subscription FIRST, flag SECOND (US-031/AC-02, AC-07, design note §4.2)', () => {
  it('writes the subscription, then the flag, and returns the confirmed flag value', async () => {
    const deliveries = pushDeliveries();
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: true }), sendPush: NOT_STUBBED_SEND_PUSH });

    const result = await svc.optIntoPush(USER_ID, SUBSCRIPTION);

    expect(result).toEqual({ pushOptIn: true });
    expect(deliveries.subscriptions).toEqual([{ userId: USER_ID, ...SUBSCRIPTION }]);
    expect(deliveries.flag).toBe(true);
  });

  it('leaves the flag untouched, and throws, when the subscription upsert fails — nothing is written', async () => {
    const deliveries = pushDeliveries({ failing: new Set(['upsert']) });
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: true }), sendPush: NOT_STUBBED_SEND_PUSH });

    await expect(svc.optIntoPush(USER_ID, SUBSCRIPTION)).rejects.toThrow('connection refused');

    expect(deliveries.flag).toBe(false);
    expect(deliveries.subscriptions).toEqual([]);
  });

  it("throws, reporting the account's real (still off) state, when the flag write fails after a successful subscription upsert — AC-07's exact case", async () => {
    const deliveries = pushDeliveries({ failing: new Set(['setFlag']) });
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: true }), sendPush: NOT_STUBBED_SEND_PUSH });

    await expect(svc.optIntoPush(USER_ID, SUBSCRIPTION)).rejects.toThrow('connection refused');

    // The orphaned subscription is harmless: sending later checks the flag before subscriptions,
    // and the flag is still false.
    expect(deliveries.subscriptions).toEqual([{ userId: USER_ID, ...SUBSCRIPTION }]);
    expect(deliveries.flag).toBe(false);
  });
});

describe('optOutOfPush — flag FIRST, subscriptions SECOND (US-031/AC-03, AC-07, design note §4.3)', () => {
  it('writes the flag off, then deletes every subscription for the account', async () => {
    const deliveries = pushDeliveries({ optIn: true });
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: true }), sendPush: NOT_STUBBED_SEND_PUSH });

    const result = await svc.optOutOfPush(USER_ID);

    expect(result).toEqual({ pushOptIn: false });
    expect(deliveries.flag).toBe(false);
    expect(deliveries.deletedFor).toEqual([USER_ID]);
  });

  it('throws, changing nothing, when the flag write itself fails — no delete is attempted', async () => {
    const deliveries = pushDeliveries({ optIn: true, failing: new Set(['setFlag']) });
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: true }), sendPush: NOT_STUBBED_SEND_PUSH });

    await expect(svc.optOutOfPush(USER_ID)).rejects.toThrow('connection refused');

    expect(deliveries.flag).toBe(true);
    expect(deliveries.deletedFor).toEqual([]);
  });

  it('still reports success when the flag write succeeds but the subscription cleanup fails — the flag is already the true, safe state', async () => {
    const deliveries = pushDeliveries({ optIn: true, failing: new Set(['delete']) });
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: true }), sendPush: NOT_STUBBED_SEND_PUSH });

    const result = await svc.optOutOfPush(USER_ID);

    expect(result).toEqual({ pushOptIn: false });
    expect(deliveries.flag).toBe(false);
  });
});

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

const REMINDER_INPUT: BookingReminderInput = {
  bookingId: 'b1',
  userId: 'u1',
  email: 'dana@example.com',
  deskNumber: 'A-02',
  date: '2026-09-17',
};

const CANCELLATION_INPUT: BookingCancellationInput = {
  bookingId: 'b1',
  userId: 'u1',
  email: 'dana@example.com',
  deskNumber: 'A-02',
  date: '2026-09-09',
  cancellationSource: 'owner',
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
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: true }), sendPush: NOT_STUBBED_SEND_PUSH });

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
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: true }), sendPush: NOT_STUBBED_SEND_PUSH });

    // 'cancellation', not 'reminder' — since US-030, 'reminder' takes the claim-first path
    // (a different repository fake entirely, `claimingDeliveries`); this test's point is that
    // `channel` is kind-independent on the send-then-record path, proven with any OTHER kind.
    await svc.recordAndSend({ ...INPUT, kind: 'cancellation' });

    expect(deliveries.rows[0]!.channel).toBe('email');
  });
});

describe('recordAndSend — a failed send never throws and is fully recorded (US-034/AC-05, AC-07)', () => {
  it('records exactly one failed row with the sanitized reason, and resolves rather than rejecting — a mail failure never risks the callers own write (US-034/AC-07)', async () => {
    const deliveries = recordingDeliveries();
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: false, error: 'transport_rejected' }), sendPush: NOT_STUBBED_SEND_PUSH });

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
    const svc = createNotificationsService({ deliveries, send: badSend, sendPush: NOT_STUBBED_SEND_PUSH });

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
      sendPush: NOT_STUBBED_SEND_PUSH,
    });

    const result = await svc.recordAndSend(INPUT);

    expect(result).toEqual({ ok: false, error: 'transport_unreachable', recorded: false });
  });

  it('never throws even when the send itself succeeded but the row could not be written', async () => {
    const svc = createNotificationsService({ deliveries: throwingDeliveries(), send: fixedSend({ ok: true }), sendPush: NOT_STUBBED_SEND_PUSH });

    const result = await svc.recordAndSend(INPUT);

    expect(result).toEqual({ ok: true, recorded: false });
  });
});

describe('recordAndSend — one function, every message kind (US-034/AC-08)', () => {
  it('produces independent rows for a confirmation and a cancellation through the identical function', async () => {
    const deliveries = recordingDeliveries();
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: true }), sendPush: NOT_STUBBED_SEND_PUSH });

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
    const svc = createNotificationsService({ deliveries, send, sendPush: NOT_STUBBED_SEND_PUSH });

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
    const svc = createNotificationsService({ deliveries, send, sendPush: NOT_STUBBED_SEND_PUSH });

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
    const svc = createNotificationsService({ deliveries, send, sendPush: NOT_STUBBED_SEND_PUSH });

    await svc.sendBookingConfirmation({ ...CONFIRMATION_INPUT, deskNumber: 'B-07', date: '2026-10-01' });

    expect(messages[0]!.subject).toContain('B-07');
    expect(messages[0]!.subject).toContain('2026-10-01');
  });
});

describe('sendBookingConfirmation — mandatory, unconditional (US-028/AC-04)', () => {
  it('has no parameter that could suppress the send — every call reaches the transport (US-028/AC-04)', async () => {
    const deliveries = recordingDeliveries();
    const { send, messages } = capturingSend();
    const svc = createNotificationsService({ deliveries, send, sendPush: NOT_STUBBED_SEND_PUSH });

    await svc.sendBookingConfirmation(CONFIRMATION_INPUT);

    expect(messages).toHaveLength(1);
  });
});

describe('sendBookingConfirmation — the sender is never this composer’s to set (US-028/AC-08)', () => {
  it('hands send() only to/subject/body — no sender field for this module to control; the address comes from config() inside sendMail (US-034) (US-028/AC-08)', async () => {
    const deliveries = recordingDeliveries();
    const { send, messages } = capturingSend();
    const svc = createNotificationsService({ deliveries, send, sendPush: NOT_STUBBED_SEND_PUSH });

    await svc.sendBookingConfirmation(CONFIRMATION_INPUT);

    expect(Object.keys(messages[0]!)).toEqual(['to', 'subject', 'body']);
  });
});

describe('sendBookingConfirmation — a mail failure is recorded, never thrown (US-028/AC-07)', () => {
  it('resolves ok:false rather than rejecting when the transport is unavailable (US-028/AC-07)', async () => {
    const deliveries = recordingDeliveries();
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: false, error: 'transport_unreachable' }), sendPush: NOT_STUBBED_SEND_PUSH });

    const result = await svc.sendBookingConfirmation(CONFIRMATION_INPUT);

    expect(result).toEqual({ ok: false, error: 'transport_unreachable', recorded: true });
    expect(deliveries.rows[0]).toMatchObject({ outcome: 'failed', kind: 'confirmation' });
  });
});

describe('sendBookingCancellation — sends to the owner alone (US-029/AC-01)', () => {
  it('records exactly one sent, cancellation row, addressed to the given email and nobody else (US-029/AC-01)', async () => {
    const deliveries = recordingDeliveries();
    const { send } = capturingSend();
    const svc = createNotificationsService({ deliveries, send, sendPush: NOT_STUBBED_SEND_PUSH });

    const result = await svc.sendBookingCancellation(CANCELLATION_INPUT);

    expect(result).toEqual({ ok: true, recorded: true });
    expect(deliveries.rows).toHaveLength(1);
    expect(deliveries.rows[0]).toMatchObject({
      bookingId: 'b1',
      userId: 'u1',
      kind: 'cancellation',
      recipient: 'dana@example.com',
      outcome: 'sent',
    });
  });
});

describe('sendBookingCancellation — names the desk and the date (US-029/AC-02)', () => {
  it('composes a subject and body that both name the desk number and the formatted date (US-029/AC-02)', async () => {
    const deliveries = recordingDeliveries();
    const { send, messages } = capturingSend();
    const svc = createNotificationsService({ deliveries, send, sendPush: NOT_STUBBED_SEND_PUSH });

    await svc.sendBookingCancellation(CANCELLATION_INPUT);

    expect(messages).toHaveLength(1);
    expect(messages[0]!.subject).toContain('A-02');
    expect(messages[0]!.subject).toContain('Wed 9 Sep');
    expect(messages[0]!.body).toContain('A-02');
    expect(messages[0]!.body).toContain('Wed 9 Sep');
  });
});

describe('sendBookingCancellation — the AC-04/AC-05/AC-06 wording matrix (BR-001.20)', () => {
  const bySource = (cancellationSource: CancellationSource): BookingCancellationInput => ({
    ...CANCELLATION_INPUT,
    cancellationSource,
  });

  it('names no actor for a self-cancellation (US-029/AC-05)', async () => {
    const deliveries = recordingDeliveries();
    const { send, messages } = capturingSend();
    const svc = createNotificationsService({ deliveries, send, sendPush: NOT_STUBBED_SEND_PUSH });

    await svc.sendBookingCancellation(bySource('owner'));

    expect(messages[0]!.body).toBe('Your desk A-02 for Wed 9 Sep was cancelled. You can book another desk any time.');
  });

  it('names the office admin role, never an individual, for an admin cancellation (US-029/AC-04)', async () => {
    const deliveries = recordingDeliveries();
    const { send, messages } = capturingSend();
    const svc = createNotificationsService({ deliveries, send, sendPush: NOT_STUBBED_SEND_PUSH });

    await svc.sendBookingCancellation(bySource('admin'));

    expect(messages[0]!.body).toBe(
      'Your desk A-02 for Wed 9 Sep was cancelled by your office admin. You can book another desk any time.',
    );
    expect(messages[0]!.body).not.toMatch(/admin@|Dana|Priya|[A-Z][a-z]+ (Admin|Kumar|Singh)/);
  });

  it('names the office admin role but omits the rebooking invite and any mention of the account closing for the deactivation cascade (US-029/AC-06)', async () => {
    const deliveries = recordingDeliveries();
    const { send, messages } = capturingSend();
    const svc = createNotificationsService({ deliveries, send, sendPush: NOT_STUBBED_SEND_PUSH });

    await svc.sendBookingCancellation(bySource('deactivation_cascade'));

    expect(messages[0]!.body).toBe('Your desk A-02 for Wed 9 Sep was cancelled by your office admin.');
    expect(messages[0]!.body).not.toContain('book another desk');
    expect(messages[0]!.body.toLowerCase()).not.toContain('account');
    expect(messages[0]!.body.toLowerCase()).not.toContain('closed');
  });
});

describe('sendBookingCancellation — mandatory, unconditional (US-029/AC-08)', () => {
  it('has no parameter that could suppress the send — every call reaches the transport (US-029/AC-08)', async () => {
    const deliveries = recordingDeliveries();
    const { send, messages } = capturingSend();
    const svc = createNotificationsService({ deliveries, send, sendPush: NOT_STUBBED_SEND_PUSH });

    await svc.sendBookingCancellation(CANCELLATION_INPUT);

    expect(messages).toHaveLength(1);
  });
});

describe('sendBookingCancellation — a mail failure is recorded, never thrown (US-029/AC-10)', () => {
  it('resolves ok:false rather than rejecting when the transport is unavailable (US-029/AC-10)', async () => {
    const deliveries = recordingDeliveries();
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: false, error: 'transport_unreachable' }), sendPush: NOT_STUBBED_SEND_PUSH });

    const result = await svc.sendBookingCancellation(CANCELLATION_INPUT);

    expect(result).toEqual({ ok: false, error: 'transport_unreachable', recorded: true });
    expect(deliveries.rows[0]).toMatchObject({ outcome: 'failed', kind: 'cancellation' });
  });
});

describe('sendBookingConfirmation / sendBookingCancellation — never touch the claim-first path (US-030/impact-analysis regression proof)', () => {
  it('calls only insertDelivery — claimReminderSent and markDeliveryFailed are never reached for confirmation or cancellation', async () => {
    const deliveries = recordingDeliveries();
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: true }), sendPush: NOT_STUBBED_SEND_PUSH });

    // Both existing composers succeed without ever hitting the fakes' throwing claim/demote
    // stubs — if the kind === 'reminder' branch in recordAndSend were mis-scoped, either call
    // below would throw instead of resolving.
    await expect(svc.sendBookingConfirmation(CONFIRMATION_INPUT)).resolves.toMatchObject({ ok: true });
    await expect(svc.sendBookingCancellation(CANCELLATION_INPUT)).resolves.toMatchObject({ ok: true });
  });
});

describe('sendReminderEmail — sends to the owner alone, naming the desk and date (US-030/AC-01, AC-02)', () => {
  it('composes a subject/body naming the desk and formatted date, and records exactly one sent, reminder row (US-030/AC-01, US-030/AC-02)', async () => {
    const deliveries = claimingDeliveries();
    const { send, messages } = capturingSend();
    const svc = createNotificationsService({ deliveries, send, sendPush: NOT_STUBBED_SEND_PUSH });

    const result = await svc.sendReminderEmail(REMINDER_INPUT);

    expect(result).toEqual({ ok: true, recorded: true });
    expect(messages).toHaveLength(1);
    expect(messages[0]!.subject).toContain('A-02');
    expect(messages[0]!.subject).toContain('Thu 17 Sep');
    expect(messages[0]!.body).toContain('A-02');
    expect(messages[0]!.body).toContain('Thu 17 Sep');
    expect(deliveries.claimedRows).toEqual([
      {
        bookingId: 'b1',
        userId: 'u1',
        channel: 'email',
        kind: 'reminder',
        recipient: 'dana@example.com',
        outcome: 'sent',
        errorDetail: undefined,
      },
    ]);
  });
});

describe('sendReminderEmail — claims before it sends, and a second claim never sends again (US-030/AC-07)', () => {
  it('claims the delivery row FIRST, then calls the transport, on a successful first send', async () => {
    const deliveries = claimingDeliveries([true]);
    const { send, messages } = capturingSend();
    const svc = createNotificationsService({ deliveries, send, sendPush: NOT_STUBBED_SEND_PUSH });

    await svc.sendReminderEmail(REMINDER_INPUT);

    expect(deliveries.claimedRows).toHaveLength(1);
    expect(messages).toHaveLength(1);
  });

  it('never calls the transport when the claim reports already-sent — exactly one reminder per booking (US-030/AC-07)', async () => {
    const deliveries = claimingDeliveries([false]);
    const { send, messages } = capturingSend();
    const svc = createNotificationsService({ deliveries, send, sendPush: NOT_STUBBED_SEND_PUSH });

    const result = await svc.sendReminderEmail(REMINDER_INPUT);

    expect(messages).toHaveLength(0);
    expect(result).toEqual({ ok: true, recorded: true });
  });

  it('across two sequential calls simulating two runs of the same job, the transport is called exactly once (US-030/AC-07)', async () => {
    const deliveries = claimingDeliveries([true, false]);
    const { send, messages } = capturingSend();
    const svc = createNotificationsService({ deliveries, send, sendPush: NOT_STUBBED_SEND_PUSH });

    await svc.sendReminderEmail(REMINDER_INPUT);
    await svc.sendReminderEmail(REMINDER_INPUT);

    expect(messages).toHaveLength(1);
  });
});

describe('sendReminderEmail — a transport failure demotes the claimed row, never thrown (US-030/AC-10)', () => {
  it('calls markDeliveryFailed with the sanitized reason when the claimed sends fails', async () => {
    const deliveries = claimingDeliveries([true]);
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: false, error: 'transport_unreachable' }), sendPush: NOT_STUBBED_SEND_PUSH });

    const result = await svc.sendReminderEmail(REMINDER_INPUT);

    expect(result).toEqual({ ok: false, error: 'transport_unreachable', recorded: true });
    expect(deliveries.failed).toEqual([{ id: 'delivery-1', errorDetail: 'transport_unreachable' }]);
  });

  it('resolves recorded:false, never throws, when the demotion write itself fails', async () => {
    const deliveries = claimingDeliveries([true], { demotionThrows: true });
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: false, error: 'transport_rejected' }), sendPush: NOT_STUBBED_SEND_PUSH });

    const result = await svc.sendReminderEmail(REMINDER_INPUT);

    expect(result).toEqual({ ok: false, error: 'transport_rejected', recorded: false });
  });
});

// ---------------------------------------------------------------------------------------------
// US-032 — the push fan-out inside sendBookingConfirmation / sendBookingCancellation
// ---------------------------------------------------------------------------------------------

const SUB_A: PushSubscriptionRecipient = { endpoint: 'https://fcm.googleapis.com/fcm/send/sub-a', p256dh: 'p256dh-a', auth: 'auth-a' };
const SUB_B: PushSubscriptionRecipient = { endpoint: 'https://fcm.googleapis.com/fcm/send/sub-b', p256dh: 'p256dh-b', auth: 'auth-b' };

/**
 * A controllable fake covering both the flag/subscription reads `findPushRecipients` needs and
 * the push delivery lifecycle (`insertDelivery`, `deletePushSubscriptionByEndpoint`,
 * `markPushSubscriptionDelivered`) — plus a trivial always-claims `claimReminderSent` so
 * `sendReminderEmail` (US-032/AC-06) can be exercised against the SAME fake used for push
 * assertions. `rows`/`listCalled`/`deletedEndpoints`/`markedDelivered` are read back as plain
 * data, this file's own convention.
 */
function pushSendDeliveries(
  options: { optIn?: boolean; subscriptions?: PushSubscriptionRecipient[] } = {},
): NotificationsRepository & {
  rows: DeliveryRow[];
  listCalled: boolean;
  deletedEndpoints: string[];
  markedDelivered: string[];
} {
  const optIn = options.optIn ?? true;
  const subscriptions = options.subscriptions ?? [];
  const rows: DeliveryRow[] = [];
  const deletedEndpoints: string[] = [];
  const markedDelivered: string[] = [];
  const state = { listCalled: false };

  return {
    rows,
    deletedEndpoints,
    markedDelivered,
    get listCalled() {
      return state.listCalled;
    },
    async insertDelivery(row) {
      rows.push(row);
    },
    async claimReminderSent() {
      return { claimed: true, id: 'delivery-1' };
    },
    async markDeliveryFailed(): Promise<void> {
      throw new Error('markDeliveryFailed not stubbed — no test in this block demotes a reminder');
    },
    async getPushOptIn() {
      return optIn;
    },
    async setPushOptIn(): Promise<boolean> {
      throw new Error('setPushOptIn not stubbed — this fake only exercises the send path');
    },
    async upsertPushSubscription(): Promise<void> {
      throw new Error('upsertPushSubscription not stubbed — this fake only exercises the send path');
    },
    async deletePushSubscriptions(): Promise<void> {
      throw new Error('deletePushSubscriptions not stubbed — this fake only exercises the send path');
    },
    async listPushSubscriptions() {
      state.listCalled = true;
      return subscriptions;
    },
    async deletePushSubscriptionByEndpoint(endpoint) {
      deletedEndpoints.push(endpoint);
    },
    async markPushSubscriptionDelivered(endpoint) {
      markedDelivered.push(endpoint);
    },
  };
}

/** A controllable `sendPush` fake. `resultFor` maps an endpoint to its outcome, defaulting to a
 *  success for any endpoint not named. Calls are read back as plain data. */
function pushSendFake(resultFor: Record<string, { ok: true } | { ok: false; error: PushFailureReason }> = {}) {
  const calls: Array<{ endpoint: string; payload: string }> = [];
  return {
    calls,
    async send(subscription: PushSubscriptionRecipient, payload: string) {
      calls.push({ endpoint: subscription.endpoint, payload });
      return resultFor[subscription.endpoint] ?? { ok: true as const };
    },
  };
}

describe('sendBookingConfirmation — push fan-out (US-032/AC-01, AC-07)', () => {
  it('pushes to every opted-in subscription, naming the desk and the date, alongside the email (US-032/AC-01, US-032/AC-07)', async () => {
    const deliveries = pushSendDeliveries({ optIn: true, subscriptions: [SUB_A] });
    const { send } = capturingSend();
    const { calls, send: sendPush } = pushSendFake();
    const svc = createNotificationsService({ deliveries, send, sendPush });

    const result = await svc.sendBookingConfirmation(CONFIRMATION_INPUT);

    expect(result).toEqual({ ok: true, recorded: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.endpoint).toBe(SUB_A.endpoint);
    const payload = JSON.parse(calls[0]!.payload) as { title: string; body: string };
    expect(payload.body).toContain('A-01');
    expect(payload.body).toContain(formatShortDate(CONFIRMATION_INPUT.date));

    const pushRow = deliveries.rows.find((r) => r.channel === 'push');
    expect(pushRow).toMatchObject({ channel: 'push', kind: 'confirmation', outcome: 'sent', recipient: SUB_A.endpoint });
  });

  it('sends nothing, and never reads push_subscriptions, when the account is not opted in (US-032/AC-05)', async () => {
    const deliveries = pushSendDeliveries({ optIn: false, subscriptions: [SUB_A] });
    const { send } = capturingSend();
    const { calls, send: sendPush } = pushSendFake();
    const svc = createNotificationsService({ deliveries, send, sendPush });

    const result = await svc.sendBookingConfirmation(CONFIRMATION_INPUT);

    expect(result).toEqual({ ok: true, recorded: true });
    expect(calls).toHaveLength(0);
    expect(deliveries.listCalled).toBe(false);
  });
});

describe('sendBookingCancellation — push fan-out, the AC-03/AC-04 wording matrix (BR-001.20)', () => {
  const bySource = (cancellationSource: CancellationSource): BookingCancellationInput => ({
    ...CANCELLATION_INPUT,
    cancellationSource,
  });

  it('names no actor for a self-cancellation, and omits the rebook invite the email carries (US-032/AC-04)', async () => {
    const deliveries = pushSendDeliveries({ optIn: true, subscriptions: [SUB_A] });
    const { send } = capturingSend();
    const { calls, send: sendPush } = pushSendFake();
    const svc = createNotificationsService({ deliveries, send, sendPush });

    await svc.sendBookingCancellation(bySource('owner'));

    const payload = JSON.parse(calls[0]!.payload) as { title: string; body: string };
    expect(payload.body).toBe(`Your desk A-02 for ${formatShortDate(CANCELLATION_INPUT.date)} was cancelled.`);
    expect(payload.body).not.toContain('book another desk');
  });

  it('names the office admin role, never an individual, for an admin cancellation, naming the desk and the date (US-032/AC-02, US-032/AC-03)', async () => {
    const deliveries = pushSendDeliveries({ optIn: true, subscriptions: [SUB_A] });
    const { send } = capturingSend();
    const { calls, send: sendPush } = pushSendFake();
    const svc = createNotificationsService({ deliveries, send, sendPush });

    await svc.sendBookingCancellation(bySource('admin'));

    const payload = JSON.parse(calls[0]!.payload) as { title: string; body: string };
    expect(payload.body).toBe(`Your desk A-02 for ${formatShortDate(CANCELLATION_INPUT.date)} was cancelled by your office admin.`);
    expect(payload.body).not.toMatch(/admin@|Dana|Priya|[A-Z][a-z]+ (Admin|Kumar|Singh)/);
  });

  it('names the office admin role for the deactivation cascade too — the same wording as an admin cancellation (US-032/AC-03)', async () => {
    const deliveries = pushSendDeliveries({ optIn: true, subscriptions: [SUB_A] });
    const { send } = capturingSend();
    const { calls, send: sendPush } = pushSendFake();
    const svc = createNotificationsService({ deliveries, send, sendPush });

    await svc.sendBookingCancellation(bySource('deactivation_cascade'));

    const payload = JSON.parse(calls[0]!.payload) as { title: string; body: string };
    expect(payload.body).toBe(`Your desk A-02 for ${formatShortDate(CANCELLATION_INPUT.date)} was cancelled by your office admin.`);
  });
});

describe('sendBookingCancellation — push targets the owner alone, never the acting admin (US-032/AC-10)', () => {
  it('reads push recipients for the booking OWNER id (input.userId), the same id the email addresses (US-032/AC-10)', async () => {
    const deliveries = pushSendDeliveries({ optIn: true, subscriptions: [SUB_A] });
    const { send } = capturingSend();
    const { send: sendPush } = pushSendFake();
    const readUserIds: string[] = [];
    deliveries.getPushOptIn = async (userId: string) => {
      readUserIds.push(userId);
      return true;
    };
    const svc = createNotificationsService({ deliveries, send, sendPush });

    // CANCELLATION_INPUT.userId is documented as "the booking OWNER's id — always the
    // recipient, never the actor" (notifications.service.ts). There is no admin id anywhere in
    // BookingCancellationInput for the push to reach through.
    await svc.sendBookingCancellation(CANCELLATION_INPUT);

    expect(readUserIds).toEqual([CANCELLATION_INPUT.userId]);
  });
});

describe('recordAndSend / sendBookingConfirmation / sendBookingCancellation — push is additive, never a gate (US-032/AC-07, AC-08)', () => {
  it('still returns the successful EMAIL result when every push to the account fails (US-032/AC-07)', async () => {
    const deliveries = pushSendDeliveries({ optIn: true, subscriptions: [SUB_A] });
    const { send } = capturingSend();
    const { send: sendPush } = pushSendFake({ [SUB_A.endpoint]: { ok: false, error: 'push_unreachable' } });
    const svc = createNotificationsService({ deliveries, send, sendPush });

    const result = await svc.sendBookingConfirmation(CONFIRMATION_INPUT);

    expect(result).toEqual({ ok: true, recorded: true });
    const pushRow = deliveries.rows.find((r) => r.channel === 'push');
    expect(pushRow).toMatchObject({ outcome: 'failed', errorDetail: 'push_unreachable' });
    expect(deliveries.deletedEndpoints).toEqual([]);
  });

  it('still attempts the push, and reports the EMAIL failure, when the email itself fails (US-032/AC-07)', async () => {
    const deliveries = pushSendDeliveries({ optIn: true, subscriptions: [SUB_A] });
    const { calls, send: sendPush } = pushSendFake();
    const svc = createNotificationsService({
      deliveries,
      send: fixedSend({ ok: false, error: 'transport_unreachable' }),
      sendPush,
    });

    const result = await svc.sendBookingConfirmation(CONFIRMATION_INPUT);

    expect(result).toEqual({ ok: false, error: 'transport_unreachable', recorded: true });
    expect(calls).toHaveLength(1);
  });

  it('a subscription_gone push (404/410) writes the failed row and hard-deletes that one subscription by endpoint (US-032/AC-08)', async () => {
    const deliveries = pushSendDeliveries({ optIn: true, subscriptions: [SUB_A] });
    const { send } = capturingSend();
    const { send: sendPush } = pushSendFake({ [SUB_A.endpoint]: { ok: false, error: 'subscription_gone' } });
    const svc = createNotificationsService({ deliveries, send, sendPush });

    const result = await svc.sendBookingCancellation(CANCELLATION_INPUT);

    expect(result).toEqual({ ok: true, recorded: true }); // the EMAIL succeeded; the booking/cancellation is unaffected
    const pushRow = deliveries.rows.find((r) => r.channel === 'push');
    expect(pushRow).toMatchObject({ outcome: 'failed', errorDetail: 'subscription_gone' });
    expect(deliveries.deletedEndpoints).toEqual([SUB_A.endpoint]);
  });

  it('never throws even when findPushRecipients itself throws — the fan-out is wrapped end to end (US-032/AC-08)', async () => {
    const deliveries = pushSendDeliveries({ optIn: true });
    deliveries.getPushOptIn = async () => {
      throw new Error('connection refused');
    };
    const { send } = capturingSend();
    const { send: sendPush } = pushSendFake();
    const svc = createNotificationsService({ deliveries, send, sendPush });

    await expect(svc.sendBookingConfirmation(CONFIRMATION_INPUT)).resolves.toEqual({ ok: true, recorded: true });
  });
});

describe('sendBookingCancellation — one push per subscription per event (US-032/AC-09)', () => {
  it('sends once to each of two subscriptions for one cancellation, and records one delivery row each (US-032/AC-09)', async () => {
    const deliveries = pushSendDeliveries({ optIn: true, subscriptions: [SUB_A, SUB_B] });
    const { send } = capturingSend();
    const { calls, send: sendPush } = pushSendFake();
    const svc = createNotificationsService({ deliveries, send, sendPush });

    await svc.sendBookingCancellation(CANCELLATION_INPUT);

    expect(calls.map((c) => c.endpoint).sort()).toEqual([SUB_A.endpoint, SUB_B.endpoint].sort());
    expect(deliveries.rows.filter((r) => r.channel === 'push')).toHaveLength(2);
  });

  it('a cascade of three cancelled bookings sends three pushes to one subscription, one per booking (US-032/AC-09)', async () => {
    const deliveries = pushSendDeliveries({ optIn: true, subscriptions: [SUB_A] });
    const { send } = capturingSend();
    const { calls, send: sendPush } = pushSendFake();
    const svc = createNotificationsService({ deliveries, send, sendPush });

    await svc.sendBookingCancellation({ ...CANCELLATION_INPUT, bookingId: 'b1' });
    await svc.sendBookingCancellation({ ...CANCELLATION_INPUT, bookingId: 'b2' });
    await svc.sendBookingCancellation({ ...CANCELLATION_INPUT, bookingId: 'b3' });

    expect(calls).toHaveLength(3);
    expect(deliveries.rows.filter((r) => r.channel === 'push').map((r) => r.bookingId)).toEqual(['b1', 'b2', 'b3']);
  });
});

describe('sendReminderEmail — never fans out to push (US-032/AC-06, BR-001.16)', () => {
  it('never calls sendPush, and writes no push-channel delivery row, even for an opted-in account with a live subscription (US-032/AC-06)', async () => {
    const deliveries = pushSendDeliveries({ optIn: true, subscriptions: [SUB_A] });
    const { calls, send: sendPush } = pushSendFake();
    const svc = createNotificationsService({ deliveries, send: fixedSend({ ok: true }), sendPush });

    await svc.sendReminderEmail(REMINDER_INPUT);

    expect(calls).toHaveLength(0);
    expect(deliveries.rows.some((r) => r.channel === 'push')).toBe(false);
  });
});

describe('push failure logging — the endpoint never reaches a log line under the field name "recipient" (US-032/C5, security-standards.md)', () => {
  it('a failed push never logs the raw endpoint outside the redacted "endpoint" field', async () => {
    const deliveries = pushSendDeliveries({ optIn: true, subscriptions: [SUB_A] });
    const { send } = capturingSend();
    const { send: sendPush } = pushSendFake({ [SUB_A.endpoint]: { ok: false, error: 'push_rejected' } });
    const svc = createNotificationsService({ deliveries, send, sendPush });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await svc.sendBookingConfirmation(CONFIRMATION_INPUT);

      const logged = errorSpy.mock.calls.map((call) => String(call[0])).join('\n');
      // infra/logger redacts by field name; a field literally named "endpoint" is replaced with
      // "[redacted]" before the line is written, so the raw capability URL must not appear.
      expect(logged).not.toContain(SUB_A.endpoint);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
