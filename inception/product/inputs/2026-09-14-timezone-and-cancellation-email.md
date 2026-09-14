# Input — 2026-09-14 — office timezone named, and cancellation-email wording decided

**Source:** Joy Joshua (PO/BA), in a `/manager` session on 2026-09-14 that reviewed the
delivery plan, followed by a `/ba` session the same day that grilled the consequences.

**Vehicle:** the delivery-plan pass flagged the unset office timezone as the item that
blocks go-live. Answering it surfaced that BRD-001 open question #14 was still open and
sits on the same delivery wave (notifications), so both were settled together.

Nothing here is an AI decision. Both values below were stated by the PO.

## A. The office timezone

`NFR-001` requires every booking date and the "today" boundary to use "the office local
timezone", and `BR-001.14` sends the reminder at "08:00 office local time" — but **no
requirement, anywhere, names the zone**. It was raised by the Architect as open question 1
in `inception/architecture/db-design.md` §6, owned by PO/IT, blocking REQ-006, REQ-028,
BR-001.14 and US-030. It was never a BRD open question, so BRD-001 carried the gap
silently.

> **Decision (Joy Joshua, PO/BA, 2026-09-14):** the office timezone is **`Asia/Kolkata`**.

Stated in session as "Asia/Kolkota"; corrected to the canonical IANA name `Asia/Kolkata`
before recording, and the correction accepted. The spelling matters because
`app-architecture.md` §5.4 makes `OFFICE_TIMEZONE` a required setting with no default and
refuses process start on a malformed value — a typo would present as a dead deployment.

### What this settles, beyond the value itself

India observes **no daylight saving time** and never has. The offset is a fixed **UTC+05:30**.

- 08:00 office local is permanently **02:30 UTC**, so the `BR-001.14` reminder job can run
  on a fixed UTC schedule without drifting twice a year.
- A UTC-only scheduler (GitHub Actions cron among them) is therefore sufficient. This was
  a live constraint on the deferred hosting choice (`app-architecture.md` §7 item 3) and is
  now not one.
- The offset is a **half-hour** one. Any code or configuration assuming whole-hour offsets
  will be thirty minutes wrong; using the IANA name throughout, as §5.4 already requires,
  avoids it.

None of the three points above is a new requirement. They are consequences recorded so the
architecture's open question can be closed against a reason, not just a value.

## B. Open question #14 — does the cancellation email name the actor?

`BR-001.20` makes the **push** alert say the office admin cancelled a booking the employee
did not cancel themselves, and states in its own scope limit that the **email** was never
decided. Push defaults to off (`REQ-026`), so email is the channel most employees actually
receive — meaning the undecided wording was the one reaching almost everyone.

> **Decision (Joy Joshua, PO/BA, 2026-09-14):** the cancellation **email** names the actor
> too, matching push. The wording names the **role**, not the individual — "your office
> admin", never "cancelled by Ravi Menon".

Naming the individual was offered and declined: it puts a named colleague in a message
about taking something away, and reaches every affected employee.

### B1 — the deactivation variant

Grilled in the same session: `BR-001.18` sends the same cancellation email when an account
is **deactivated**, but that person can no longer sign in (`REQ-005`). An email inviting
them to book another desk points at a door that is now locked, and the recipient is
typically a leaver.

> **Decision (Joy Joshua, PO/BA, 2026-09-14):** the deactivation-cascade email keeps the
> "cancelled by your office admin" wording but **omits the invitation to book again**.

Stating that the account has been closed was offered and declined: the system would be
announcing an HR outcome by email, possibly before a manager has spoken to the person.
