/**
 * The one send path (US-034/AC-08). `bookings` and `users` call this; it calls neither
 * (`modules/README.md`'s named asymmetry). Every message story composes its own wording HERE,
 * inside this module (US-028's `sendBookingConfirmation`, US-029's `sendBookingCancellation`;
 * US-030 should add its own `send*` function the same way), then calls `recordAndSend` — the
 * caller never receives pre-written text to pass through. There is no second mail path,
 * enforced by `eslint.config.mjs`'s mailer boundary (FR-07).
 *
 * **`recordAndSend` is two paths behind one name, not one (US-030/D-01).** Confirmation and
 * cancellation, each caused by a one-time user action, are still send-then-record. The reminder
 * (`kind === 'reminder'`) is claim-then-send: the delivery row is inserted as `sent` FIRST, via
 * the reminder partial-unique index (`0006_notification_deliveries.sql:52-54`); only a
 * successful claim calls the transport, and a transport failure demotes the row to `failed`
 * rather than inserting a second one. An unclaimed row (the index already fired — a prior run,
 * or a retry) returns success without calling the transport at all — that is what makes
 * `app-architecture.md` §4.3's "a retry resends only what failed" true, and it is what AC-07
 * rests on. US-030 extends this function; it does not write a second one.
 *
 * `recordAndSend` takes no transaction and opens none (`app-architecture.md` §4.1 step 6) — a
 * caller invokes it once its OWN write has already committed.
 */
import type { OfficeDate } from '@desk-booking/contracts';
import { cancellationCopy, type CancellationSource } from '../../domain/cancellation-copy.js';
import { formatShortDate } from '../../domain/format-display-date.js';
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

export interface BookingConfirmationInput {
  bookingId: string;
  userId: string;
  /** The account's CURRENT email — read once by the caller (`bookings.router.ts`, from the
   *  already-loaded session), never re-fetched here (US-028/AC-06, D-02). */
  email: string;
  deskNumber: string;
  date: string;
}

export interface BookingReminderInput {
  bookingId: string;
  userId: string;
  /** The owner's CURRENT email — read once by the caller, never re-fetched here (same
   *  discipline as `BookingConfirmationInput.email`/`BookingCancellationInput.email`). */
  email: string;
  deskNumber: string;
  date: OfficeDate;
}

export interface BookingCancellationInput {
  bookingId: string;
  /** The booking OWNER's id — always the recipient, never the actor who cancelled it. */
  userId: string;
  /** The owner's CURRENT email — read once by the caller, never re-fetched here (US-029/D-02,
   *  D-03), the same discipline `BookingConfirmationInput.email` states. */
  email: string;
  deskNumber: string;
  date: OfficeDate;
  /** Who cancelled it, read back from `bookings.cancellation_source` — never inferred by
   *  comparing ids (US-029/AC-04, AC-05, AC-06). */
  cancellationSource: CancellationSource;
}

export function createNotificationsService({ deliveries, send }: NotificationsServiceDeps) {
  /**
   * Never throws (AC-07) and never silent (design note §2.2, F-4): a delivery-log write that
   * itself fails is logged in full, not swallowed by the same guard that protects the caller
   * from a mail failure. `recorded: false` is the "we know something happened and could not
   * write it down" signal — the log line below is then the last resort AC-05 actually needs.
   */
  async function recordAndSend(input: SendEmailInput): Promise<RecordAndSendResult> {
    if (input.kind === 'reminder') return recordAndSendClaimFirst(input);

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
  }

  /**
   * US-030/D-01, D-02. Claim first, send only on a successful claim. An unclaimed row (the
   * reminder partial-unique index already fired) is not a failure — it is the SAME booking's
   * reminder, already sent by an earlier call, and this resolves `{ ok: true, recorded: true }`
   * without touching the transport (AC-07).
   */
  async function recordAndSendClaimFirst(input: SendEmailInput): Promise<RecordAndSendResult> {
    const claim = await deliveries.claimReminderSent({
      bookingId: input.bookingId,
      userId: input.userId,
      channel: 'email',
      kind: input.kind,
      recipient: input.recipient,
      outcome: 'sent',
      errorDetail: undefined,
    });

    if (!claim.claimed) return { ok: true, recorded: true };

    const result = await send({ to: input.recipient, subject: input.subject, body: input.body });
    if (result.ok) return { ok: true, recorded: true };

    const safeError = safeFailureReason(result.error);
    logger.error('notification send failed', {
      kind: input.kind,
      bookingId: input.bookingId,
      recipient: input.recipient,
      reason: safeError,
    });

    try {
      await deliveries.markDeliveryFailed(claim.id, safeError);
      return { ok: false, error: safeError, recorded: true };
    } catch (updateError) {
      logger.error('notification delivery could not be demoted to failed', {
        kind: input.kind,
        bookingId: input.bookingId,
        recipient: input.recipient,
        sendError: safeError,
        updateError: updateError instanceof Error ? updateError.message : String(updateError),
      });
      return { ok: false, error: safeError, recorded: false };
    }
  }

  return {
    recordAndSend,

    /**
     * US-028. Composes the confirmation's wording — this module decides "what the message
     * should say" (`modules/README.md`), the caller hands over facts, not text (D-01). Every
     * booking that reaches `outcome.kind === 'ok'` gets exactly one call to this (US-028/AC-05);
     * there is no parameter here that could suppress it (AC-04 — booking emails are mandatory).
     */
    async sendBookingConfirmation(input: BookingConfirmationInput): Promise<RecordAndSendResult> {
      return recordAndSend({
        kind: 'confirmation',
        bookingId: input.bookingId,
        userId: input.userId,
        recipient: input.email,
        subject: `Your desk is booked — ${input.deskNumber} on ${input.date}`,
        body: `You're booked at desk ${input.deskNumber} on ${input.date}.`,
      });
    },

    /**
     * US-029. Composes the cancellation's wording the same way `sendBookingConfirmation` does —
     * this module decides what the message says, the caller hands over facts. Every one of the
     * three cancellation paths (US-011, US-015, US-025) that reaches `outcome.kind === 'ok'`
     * calls this exactly once per cancelled booking (AC-01, AC-03, AC-09); there is no parameter
     * here that could suppress it (AC-08). The actor-naming decision itself is `domain/`'s
     * (`cancellationCopy`, BR-001.20) — this function only assembles the string.
     */
    async sendBookingCancellation(input: BookingCancellationInput): Promise<RecordAndSendResult> {
      const dateLabel = formatShortDate(input.date);
      const { actorClause, includeRebookInvite } = cancellationCopy(input.cancellationSource);
      const rebookInvite = includeRebookInvite ? ' You can book another desk any time.' : '';
      const body = `Your desk ${input.deskNumber} for ${dateLabel} was cancelled${actorClause}.${rebookInvite}`;

      return recordAndSend({
        kind: 'cancellation',
        bookingId: input.bookingId,
        userId: input.userId,
        recipient: input.email,
        subject: `Your desk booking was cancelled — ${input.deskNumber} on ${dateLabel}`,
        body,
      });
    },

    /**
     * US-030. Composes the reminder's wording the same way the other two composers do. Calling
     * `recordAndSend({ kind: 'reminder', ... })` is what routes this through the claim-first
     * path above — this function itself has no idempotency logic of its own (AC-07 lives in
     * `recordAndSendClaimFirst`, not here).
     */
    async sendReminderEmail(input: BookingReminderInput): Promise<RecordAndSendResult> {
      const dateLabel = formatShortDate(input.date);
      return recordAndSend({
        kind: 'reminder',
        bookingId: input.bookingId,
        userId: input.userId,
        recipient: input.email,
        subject: `Reminder — your desk tomorrow, ${input.deskNumber} on ${dateLabel}`,
        body: `Reminder: you're booked at desk ${input.deskNumber} on ${dateLabel}. If you no longer need it, please cancel so somebody else can use it.`,
      });
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
