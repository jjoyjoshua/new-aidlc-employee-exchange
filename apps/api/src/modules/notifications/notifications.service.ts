/**
 * The one send path (US-034/AC-08). `bookings` and `users` call this; it calls neither
 * (`modules/README.md`'s named asymmetry). Every future message story (US-028 confirmation,
 * US-029 cancellation, US-030 reminder) calls `recordAndSend` — there is no second mail path,
 * enforced by `eslint.config.mjs`'s mailer boundary (FR-07).
 *
 * **This function is send-then-record, and that is a documented seam, not a finished
 * guarantee (Architect design note §2.3, F-6).** It is correct for the confirmation and
 * cancellation paths, each caused by a one-time user action. The reminder run (US-030,
 * `app-architecture.md` §4.3) is triggered by a scheduler that retries and needs a **claim
 * before the send** — most likely inserting the `sent` row first and demoting it to `failed`
 * if the transport rejects, which is what makes §4.3's "a retry resends only what failed" true.
 * US-030 must extend this function, not write a second one, or AC-08 breaks.
 *
 * `recordAndSend` takes no transaction and opens none (`app-architecture.md` §4.1 step 6) — a
 * caller invokes it once its OWN write has already committed.
 */
import { logger } from '../../infra/logger/index.js';
import { sendMail, type MailFailureReason, type MailMessage } from '../../infra/mailer/index.js';
import { notificationsRepository, type NotificationKind, type NotificationsRepository } from './notifications.repository.js';

export interface NotificationsServiceDeps {
  deliveries: NotificationsRepository;
  send: (message: MailMessage) => ReturnType<typeof sendMail>;
}

export interface SendEmailInput {
  kind: NotificationKind;
  /** `undefined` for a message not about one booking specifically. Every message type this
   *  story's callers will use (US-028/029/030) has one. */
  bookingId: string | undefined;
  userId: string;
  recipient: string;
  subject: string;
  body: string;
}

export type RecordAndSendResult =
  | { ok: true; recorded: boolean }
  | { ok: false; error: MailFailureReason; recorded: boolean };

/** `MailFailureReason` closes this off at the type level (D-06), but nothing stops a
 *  misbehaving transport from returning something else at runtime — TypeScript has no runtime
 *  enforcement of a union. This is the actual gate: a value outside the known set is replaced
 *  with `'transport_unknown'` before it can reach a log line or `error_detail`, so the
 *  type-level guarantee is not merely a compile-time promise (design note §4, F-5). */
const KNOWN_MAIL_FAILURE_REASONS: ReadonlySet<string> = new Set([
  'transport_rejected',
  'transport_unreachable',
  'transport_unknown',
]);
function safeFailureReason(error: string): MailFailureReason {
  return KNOWN_MAIL_FAILURE_REASONS.has(error) ? (error as MailFailureReason) : 'transport_unknown';
}

export function createNotificationsService({ deliveries, send }: NotificationsServiceDeps) {
  return {
    /**
     * Never throws (AC-07) and never silent (design note §2.2, F-4): a delivery-log write that
     * itself fails is logged in full, not swallowed by the same guard that protects the caller
     * from a mail failure. `recorded: false` is the "we know something happened and could not
     * write it down" signal — the log line below is then the last resort AC-05 actually needs.
     */
    async recordAndSend(input: SendEmailInput): Promise<RecordAndSendResult> {
      const result = await send({ to: input.recipient, subject: input.subject, body: input.body });
      const outcome: 'sent' | 'failed' = result.ok ? 'sent' : 'failed';
      const safeError: MailFailureReason | undefined = result.ok ? undefined : safeFailureReason(result.error);

      if (safeError !== undefined) {
        logger.error('notification send failed', {
          kind: input.kind,
          bookingId: input.bookingId,
          recipient: input.recipient,
          reason: safeError,
        });
      }

      let recorded = true;
      try {
        await deliveries.insertDelivery({
          bookingId: input.bookingId,
          userId: input.userId,
          // This function IS the email path — channel is not an input (design note §2.1, F-12).
          channel: 'email',
          kind: input.kind,
          recipient: input.recipient,
          outcome,
          errorDetail: safeError,
        });
      } catch (insertError) {
        recorded = false;
        logger.error('notification delivery could not be recorded', {
          kind: input.kind,
          bookingId: input.bookingId,
          recipient: input.recipient,
          sendOutcome: outcome,
          sendError: safeError,
          insertError: insertError instanceof Error ? insertError.message : String(insertError),
        });
      }

      return safeError === undefined ? { ok: true, recorded } : { ok: false, error: safeError, recorded };
    },
  };
}

export type NotificationsService = ReturnType<typeof createNotificationsService>;

/** The real wiring — `infra/mailer`'s `sendMail` and the Supabase-backed repository. Test
 *  seam: `createNotificationsService` itself, called with fakes (bookings.service.spec.ts's
 *  convention), not this. */
export const notificationsService: NotificationsService = createNotificationsService({
  deliveries: notificationsRepository,
  send: sendMail,
});
