/**
 * Email dispatch (NFR-007). `config().MAIL_PROVIDER` is the only place a transport is chosen,
 * and `z.enum(['console'])` (config/index.ts) is the only place a provider is allowed to exist
 * — an unrecognised value refuses to boot rather than surprising the first caller (US-034/AC-04,
 * Architect design note §1.2).
 *
 * `console` is the only transport implemented. It is real, not a mock — it dispatches through
 * `infra/logger`, which is how mail is actually observed in local dev and demos — but it never
 * leaves the process. The real provider is `TBD (owner: IT)`, and adding one is a dependency
 * decision this story does not have grounds to make (US-034 decisions.md, D-01).
 *
 * Two rules that outlive the provider choice (README.md in this folder, app-architecture.md
 * §4.1, §5.5):
 *
 * - Dispatch happens after the caller's own transaction commits, never inside it. This module
 *   takes no transaction and opens none — that discipline belongs to the caller
 *   (`modules/notifications/notifications.service.ts`), not here.
 * - A failed send is reported as a short, bounded, code-based string, never the raw transport
 *   error, a response body, or a header. `infra/logger`'s redaction works by field NAME; a
 *   credential hiding inside a free-text failure reason would pass straight through it
 *   (Architect design note §4, F-5). Bounding what CAN be said, here, is what keeps a
 *   credential out of both the log line and `notification_deliveries.error_detail` downstream.
 */
import { config } from '../../config/index.js';
import { logger } from '../logger/index.js';

export interface MailMessage {
  to: string;
  subject: string;
  body: string;
}

/**
 * A closed set, not free text, and that is the point (Architect design note §4, F-5):
 * `infra/logger`'s redaction works by field NAME, so a credential hiding inside a free-text
 * failure reason would pass straight through it, into both the log line and
 * `notification_deliveries.error_detail`. A transport that fails maps its cause to one of
 * these before it ever leaves this module — there is no path by which a raw error, a response
 * body, or a header can reach a caller.
 */
export type MailFailureReason = 'transport_rejected' | 'transport_unreachable' | 'transport_unknown';

export type SendMailResult = { ok: true } | { ok: false; error: MailFailureReason };

/**
 * The console transport. Logs `to`/`subject` only — never `body`. The console transport writes
 * to the same stdout a log aggregator collects, so a message body would become persistent-log
 * content for every email ever sent (RISK-005's concern, one layer over from passwords).
 */
function sendViaConsole(message: MailMessage, from: string): SendMailResult {
  logger.info('mail sent (console transport — not actually delivered)', {
    from,
    to: message.to,
    subject: message.subject,
  });
  return { ok: true };
}

/**
 * `message.body` is never read here — see `sendViaConsole`. Kept on `MailMessage` because every
 * future real transport needs it; the console transport disciplines what happens to it now.
 */
export async function sendMail(message: MailMessage): Promise<SendMailResult> {
  const { MAIL_PROVIDER, MAIL_FROM_ADDRESS } = config();

  // `MAIL_PROVIDER` is a closed enum with one member today (config/index.ts). This switch has a
  // single case on purpose: the day a second transport lands, TypeScript's exhaustiveness check
  // on the enum is what forces this function to grow with it, rather than a runtime string
  // comparison nobody remembers to update.
  switch (MAIL_PROVIDER) {
    case 'console':
      return sendViaConsole(message, MAIL_FROM_ADDRESS);
    default: {
      const _exhaustive: never = MAIL_PROVIDER;
      return _exhaustive;
    }
  }
}
