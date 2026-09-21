import { describe, expect, it } from 'vitest';
import { createRemindersService } from './reminders.service.js';
import type { RemindersRepository, ReminderCandidateRow } from './reminders.repository.js';
import type { NotificationsService, BookingReminderInput, RecordAndSendResult } from '../notifications/notifications.service.js';

const OFFICE_TIMEZONE = 'Asia/Kolkata';

/** Any instant that resolves to `officeDate` in Asia/Kolkata (UTC+5:30). */
function nowMsFor(officeDate: string): () => number {
  return () => Date.parse(`${officeDate}T12:00:00Z`);
}

function throwingBookings(): RemindersRepository {
  return {
    async listConfirmedBookingsForDate() {
      throw new Error('listConfirmedBookingsForDate not stubbed for this test');
    },
  };
}

function rowsForDate(rows: ReminderCandidateRow[]): RemindersRepository & { requestedDates: string[] } {
  const requestedDates: string[] = [];
  return {
    requestedDates,
    async listConfirmedBookingsForDate(date) {
      requestedDates.push(date);
      return rows;
    },
  };
}

function recordingNotifications(
  result: RecordAndSendResult = { ok: true, recorded: true },
): Pick<NotificationsService, 'sendReminderEmail'> & { calls: BookingReminderInput[] } {
  const calls: BookingReminderInput[] = [];
  return {
    calls,
    async sendReminderEmail(input) {
      calls.push(input);
      return result;
    },
  };
}

function candidate(overrides: Partial<ReminderCandidateRow> = {}): ReminderCandidateRow {
  return {
    id: 'b1',
    userId: 'u1',
    email: 'dana@example.com',
    deskNumber: 'A-02',
    bookingDate: '2026-09-17',
    ...overrides,
  };
}

describe('createRemindersService.runReminders — resolves tomorrow via the OFFICE date, never the server clock (US-030/AC-01, AC-03)', () => {
  it('a UTC instant that is already a different calendar day in the office zone still resolves tomorrow correctly (US-030/AC-01, US-030/AC-03)', async () => {
    // 19:30 UTC on 16 Sep is already 01:00 on 17 Sep in Asia/Kolkata (UTC+5:30) — the same
    // instant `booking-window.spec.ts`'s own officeToday test uses, one day earlier.
    const nowMs = () => Date.parse('2026-09-16T19:30:00Z');
    const bookings = rowsForDate([]);
    const notifications = recordingNotifications();
    const service = createRemindersService({ bookings, notifications, nowMs, officeTimezone: OFFICE_TIMEZONE });

    await service.runReminders();

    // Office "today" is already 2026-09-17 at this instant; tomorrow is 2026-09-18.
    expect(bookings.requestedDates).toEqual(['2026-09-18']);
  });
});

describe('createRemindersService.runReminders — no reminder run for a weekend booking date (US-030/AC-04, Monday edge case)', () => {
  it('skips the query entirely when tomorrow is a Saturday (US-030/AC-04)', async () => {
    const bookings = throwingBookings();
    const notifications = recordingNotifications();
    // 2026-09-18 is a Friday in Asia/Kolkata — tomorrow is Saturday 2026-09-19.
    const service = createRemindersService({
      bookings,
      notifications,
      nowMs: nowMsFor('2026-09-18'),
      officeTimezone: OFFICE_TIMEZONE,
    });

    const result = await service.runReminders();

    expect(result).toEqual({ kind: 'skipped', reason: 'weekend' });
  });

  it('skips the query entirely when tomorrow is a Sunday (US-030/AC-04)', async () => {
    const bookings = throwingBookings();
    const notifications = recordingNotifications();
    // 2026-09-19 is a Saturday — tomorrow is Sunday 2026-09-20.
    const service = createRemindersService({
      bookings,
      notifications,
      nowMs: nowMsFor('2026-09-19'),
      officeTimezone: OFFICE_TIMEZONE,
    });

    const result = await service.runReminders();

    expect(result).toEqual({ kind: 'skipped', reason: 'weekend' });
  });

  it('a Monday booking still gets its reminder on the SUNDAY run — BR-001.14 built exactly as written, confirmed with the human', async () => {
    // 2026-09-20 is a Sunday — tomorrow is Monday 2026-09-21, which is NOT a weekend date, so
    // the run proceeds and queries for it.
    const bookings = rowsForDate([candidate({ bookingDate: '2026-09-21' })]);
    const notifications = recordingNotifications();
    const service = createRemindersService({
      bookings,
      notifications,
      nowMs: nowMsFor('2026-09-20'),
      officeTimezone: OFFICE_TIMEZONE,
    });

    const result = await service.runReminders();

    expect(bookings.requestedDates).toEqual(['2026-09-21']);
    expect(result).toMatchObject({ kind: 'ran', date: '2026-09-21', attempted: 1, sent: 1, failed: 0 });
  });
});

describe('createRemindersService.runReminders — sends one reminder per listed booking (US-030/AC-01, AC-02)', () => {
  it('calls sendReminderEmail once per row, with that row\'s own desk, date and owner email', async () => {
    const rows = [
      candidate({ id: 'b1', email: 'dana@example.com', deskNumber: 'A-01' }),
      candidate({ id: 'b2', email: 'priya@example.com', deskNumber: 'B-02' }),
    ];
    const bookings = rowsForDate(rows);
    const notifications = recordingNotifications();
    const service = createRemindersService({
      bookings,
      notifications,
      nowMs: nowMsFor('2026-09-16'),
      officeTimezone: OFFICE_TIMEZONE,
    });

    const result = await service.runReminders();

    expect(notifications.calls).toEqual([
      { bookingId: 'b1', userId: 'u1', email: 'dana@example.com', deskNumber: 'A-01', date: '2026-09-17' },
      { bookingId: 'b2', userId: 'u1', email: 'priya@example.com', deskNumber: 'B-02', date: '2026-09-17' },
    ]);
    expect(result).toEqual({ kind: 'ran', date: '2026-09-17', attempted: 2, sent: 2, failed: 0 });
  });

  it('reports attempted: 0, sent: 0 for a working day with nothing confirmed', async () => {
    const bookings = rowsForDate([]);
    const notifications = recordingNotifications();
    const service = createRemindersService({
      bookings,
      notifications,
      nowMs: nowMsFor('2026-09-16'),
      officeTimezone: OFFICE_TIMEZONE,
    });

    const result = await service.runReminders();

    expect(result).toEqual({ kind: 'ran', date: '2026-09-17', attempted: 0, sent: 0, failed: 0 });
    expect(notifications.calls).toEqual([]);
  });
});

describe('createRemindersService.runReminders — one failed send never stops the batch (US-030/AC-10)', () => {
  it('the remaining bookings still get their reminder, and the run reports the failure count (US-030/AC-10)', async () => {
    const rows = [candidate({ id: 'b1' }), candidate({ id: 'b2' }), candidate({ id: 'b3' })];
    const bookings = rowsForDate(rows);
    let calls = 0;
    const notifications: Pick<NotificationsService, 'sendReminderEmail'> & { calls: string[] } = {
      calls: [],
      async sendReminderEmail(input) {
        calls += 1;
        notifications.calls.push(input.bookingId);
        if (input.bookingId === 'b2') throw new Error('transport exploded');
        return { ok: true, recorded: true };
      },
    };
    const service = createRemindersService({
      bookings,
      notifications,
      nowMs: nowMsFor('2026-09-16'),
      officeTimezone: OFFICE_TIMEZONE,
    });

    const result = await service.runReminders();

    expect(calls).toBe(3);
    expect(notifications.calls).toEqual(['b1', 'b2', 'b3']);
    expect(result).toEqual({ kind: 'ran', date: '2026-09-17', attempted: 3, sent: 2, failed: 1 });
  });
});

describe('createRemindersService.runReminders — stateless per invocation, no catch-up (US-030/AC-08, D-07)', () => {
  it('two calls with the SAME clock reading request the SAME date and send the SAME count both times — nothing here remembers a prior call (US-030/AC-08)', async () => {
    const bookings = rowsForDate([candidate({ id: 'b1' })]);
    const notifications = recordingNotifications();
    const service = createRemindersService({
      bookings,
      notifications,
      nowMs: nowMsFor('2026-09-16'),
      officeTimezone: OFFICE_TIMEZONE,
    });

    const first = await service.runReminders();
    const second = await service.runReminders();

    // No "already ran today" guard exists to make the second call behave differently — that
    // absence is what "one send at a time, not a catch-up" (BR-001.14) rests on. AC-07's own
    // idempotency (nothing double-emails) lives one layer down, in recordAndSend's claim —
    // this test is about the SERVICE holding no memory of the first call, not about the send
    // itself being deduplicated.
    expect(bookings.requestedDates).toEqual(['2026-09-17', '2026-09-17']);
    expect(first).toEqual(second);
  });
});

describe('createRemindersService — no push dependency exists to call (US-030/AC-09, FR-08)', () => {
  it('RemindersServiceDeps is satisfied by a fake implementing ONLY sendReminderEmail — there is no push-capable field for a runtime branch to reach (US-030/AC-09)', async () => {
    // Structural proof: this compiles and runs at all only because `notifications` is narrowed
    // to `Pick<NotificationsService, 'sendReminderEmail'>` (reminders.service.ts). A fake that
    // implemented a push method too would still work, but this one that implements NOTHING else
    // proves the dependency shape admits no push capability — there is no field to call even by
    // mistake.
    const bookings = rowsForDate([candidate({ id: 'b1' })]);
    const notifications = { async sendReminderEmail() { return { ok: true as const, recorded: true }; } };
    const service = createRemindersService({
      bookings,
      notifications,
      nowMs: nowMsFor('2026-09-16'),
      officeTimezone: OFFICE_TIMEZONE,
    });

    const result = await service.runReminders();

    expect(result).toMatchObject({ kind: 'ran', sent: 1 });
  });
});
