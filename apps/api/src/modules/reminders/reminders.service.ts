/**
 * US-030. The run's own logic — which date, whether to run at all, and one send per booking.
 *
 * No catch-up, no history of past invocations (D-07, AC-08): the correctness a production
 * deployment needs comes from a scheduler calling this once daily, not from state kept here.
 */
import { addDays, isWeekend, type OfficeDate } from '@desk-booking/contracts';
import { officeToday } from '../../domain/booking-window.js';
import { logger } from '../../infra/logger/index.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { RemindersRepository } from './reminders.repository.js';

export interface RemindersServiceDeps {
  bookings: RemindersRepository;
  /** Narrowed to the one function this service calls — structurally, there is no push-capable
   *  dependency anywhere in this module for AC-09 to worry about (FR-08). */
  notifications: Pick<NotificationsService, 'sendReminderEmail'>;
  nowMs: () => number;
  officeTimezone: string;
}

export type ReminderRunResult =
  | { kind: 'skipped'; reason: 'weekend' }
  | { kind: 'ran'; date: OfficeDate; attempted: number; sent: number; failed: number };

export function createRemindersService({ bookings, notifications, nowMs, officeTimezone }: RemindersServiceDeps) {
  return {
    /**
     * US-030/AC-01, AC-03. `tomorrow` is derived from `officeToday(nowMs(), officeTimezone)`,
     * never the server's own local clock or a UTC assumption — the same discipline every other
     * date rule in this codebase follows. AC-04/the Monday edge case: only the BOOKING date's
     * weekend status is checked, never the run date's, so a Monday booking's reminder still
     * fires on a Sunday run.
     */
    async runReminders(): Promise<ReminderRunResult> {
      const today = officeToday(nowMs(), officeTimezone);
      const tomorrow = addDays(today, 1);

      if (isWeekend(tomorrow)) return { kind: 'skipped', reason: 'weekend' };

      const rows = await bookings.listConfirmedBookingsForDate(tomorrow);

      let sent = 0;
      let failed = 0;
      for (const row of rows) {
        try {
          await notifications.sendReminderEmail({
            bookingId: row.id,
            userId: row.userId,
            email: row.email,
            deskNumber: row.deskNumber,
            date: row.bookingDate,
          });
          sent += 1;
        } catch (error) {
          failed += 1;
          logger.error('reminder send threw unexpectedly', {
            bookingId: row.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return { kind: 'ran', date: tomorrow, attempted: rows.length, sent, failed };
    },
  };
}

export type RemindersService = ReturnType<typeof createRemindersService>;
