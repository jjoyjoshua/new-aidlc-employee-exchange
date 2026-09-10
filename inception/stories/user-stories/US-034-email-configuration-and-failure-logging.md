# US-034 — Transactional email is configured, not hard-coded, and failures are logged

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-034-email-configuration-and-failure-logging`) merging with every AC proven by a test named `... (US-034/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-005                                               |
| **Traces to**  | NFR-005, NFR-007                                       |
| **Priority**   | Must                                                   |
| **Estimate**   | 5 pts (AI draft — humans re-estimate)                  |
| **Depends on** | —                                                      |

## Story

As the person who has to operate this once it is live
I want the mail sender and service to be settings, and every failed send to be recorded
So that we can point it at the real mail service before go-live and find out when mail stops arriving.

## Acceptance criteria

### AC-01 The sender address is configuration

- **Given** the application
- **When** a transactional email is sent
- **Then** its sender address comes from configuration, and no sender address is compiled into the application (NFR-007)

### AC-02 The mail service is configuration

- **Given** the application
- **When** it sends mail
- **Then** the mail service and its credentials come from configuration, changeable per environment without a code change (NFR-007)

### AC-03 It starts with no production values, and says so

- **Given** a checked-out repository
- **When** the configuration is inspected
- **Then** the production sender address and mail service are absent or clearly placeholder — they are `TBD (owner: IT)` and required before go-live (NFR-007, BRD-001 open question #7)

### AC-04 A missing configuration fails loudly, not silently

- **Given** an environment with the mail configuration absent or incomplete
- **When** the application starts or first attempts a send
- **Then** the problem is reported clearly rather than mail being silently dropped

### AC-05 Every failed send is logged

- **Given** a send that fails — a rejected address, an unreachable service, a timeout, an authentication failure
- **When** it fails
- **Then** it is logged with enough to follow it up: what kind of message, which booking, the intended recipient, when, and why it failed (NFR-005, RISK-006)

### AC-06 A logged failure never contains a password

- **Given** any log entry from this path
- **When** it is written
- **Then** it contains no password and no mail credential (RISK-005's log-exposure concern, BR-001.12)

### AC-07 A failed send never loses the action that caused it

- **Given** a booking, cancellation or reminder whose email fails
- **When** the failure occurs
- **Then** the booking or cancellation stands and the failure is logged — mail is never allowed to roll back the act it was describing (NFR-005, and the shared basis of US-028/AC-07, US-029/AC-08, US-030/AC-10)

### AC-08 All three message types go through the same path

- **Given** the confirmation (US-028), cancellation (US-029) and reminder (US-030) emails
- **When** each is sent
- **Then** all three use this configuration and this failure logging — there is no second mail path with its own settings

## Edge cases

- **The production sender address and mail service are genuinely undecided** — BRD-001 open question #7 is resolved only in *approach*: configuration, not hard-coded. The values themselves are `TBD (owner: IT)` and must be settled before go-live. This story delivers the mechanism; it cannot deliver the values, and it must not invent them.
- No retry policy or dead-letter queue is specified in BRD-001. NFR-005 requires reliable sending and logged failures, not a retry mechanism. If `/architect` proposes retries, that is a design decision to record, not a requirement this story carries.
- No alerting or monitoring product is specified. NFR-005 says "logged for operational follow-up"; where those logs are watched is a DevOps question for `/devops`.
- The email **templates** are not this story's — each message story owns its own wording, and US-029/AC-04's wording is still undecided.

## QA notes

- AC-01 – AC-03 are best proven by a search of the source for a literal address or host as well as by a positive test that a changed setting changes the sender.
- AC-05 needs each failure mode induced separately: a rejected recipient and an unreachable service produce different causes, and both must be distinguishable in the log.
- AC-06 is a scan of the log output, not an inspection of the code that writes it.
- AC-07 is the same assertion the three message stories each make from their own side; here it is asserted once against the shared path.
- Data setup: a stubbed mail transport with controllable failure modes; an environment with the configuration deliberately absent for AC-04.

## API impacts

No endpoint. This is the mail transport, its configuration surface and its failure logging, which the three message stories then use. Shape is `/architect`'s and `/devops`' to settle between them — no OpenAPI contract exists in this repository yet.
