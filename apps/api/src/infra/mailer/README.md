# mailer

Email dispatch (NFR-007). Provider not yet chosen — owner: IT (`app-architecture.md` §7 item 4).

Two rules that outlive the provider choice:

- **Dispatch happens after the transaction commits, never inside it.** Sending inside means a
  mail outage rolls back a good booking, and a transaction that later rolls back can still
  have sent a real email (`app-architecture.md` §4.1).
- **A failed send is logged and recorded in `notification_deliveries`**, because NFR-005 needs
  it queryable, not just greppable. It does not undo the booking the employee can already see.
