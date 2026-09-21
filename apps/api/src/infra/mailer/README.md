# mailer

Email dispatch (NFR-007, US-034). `sendMail(message)` picks its transport from
`config().MAIL_PROVIDER`; the sender is always `config().MAIL_FROM_ADDRESS`. Only `console` is
implemented — it logs and never actually delivers. The real provider is still not chosen —
owner: IT (`app-architecture.md` §7 item 4) — and `config()` refuses to boot with `console`
under `NODE_ENV=production`, so going live without one is a boot failure, not a quiet one.

**Importable only from `modules/notifications`** (`eslint.config.mjs`'s mailer boundary,
US-034/AC-08) — every message type sends through `notifications.service.ts`'s `recordAndSend`,
so there is exactly one mail path. That rule constrains importing this module, not sending mail
by some other means (a raw `fetch` to a provider's API would not be caught) — it is a build
failure for the mistake reviewers are most likely to miss, not a complete guarantee.

A failure's `error` is a **closed set** (`MailFailureReason`), never free text — a transport
maps its cause to one of a few known codes before it leaves this module. `infra/logger`
redacts by field name, and a credential hiding inside a free-text reason would pass straight
through that; a closed type makes "no credential in the failure reason" true by construction.

Two rules that outlive the provider choice:

- **Dispatch happens after the transaction commits, never inside it.** Sending inside means a
  mail outage rolls back a good booking, and a transaction that later rolls back can still
  have sent a real email (`app-architecture.md` §4.1). `sendMail`/`recordAndSend` take no
  transaction and open none — that discipline belongs to the caller.
- **A failed send is logged and recorded in `notification_deliveries`**, because NFR-005 needs
  it queryable, not just greppable. It does not undo the booking the employee can already see.
