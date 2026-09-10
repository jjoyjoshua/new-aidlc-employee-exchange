# EPIC-004 — Notifications

> Approval = Gate 1 review of this file's PR, alongside the stories it groups.

|               |                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| **Traces to** | BRD-001 §3 workflows 8, 9 · REQ-023 – REQ-027 · NFR-006                                               |
| **Stories**   | US-028, US-029, US-030, US-031, US-032                                                                |
| **Screens**   | SCR-004 (Settings) — the opt-in control only; the messages themselves have no screen                  |
| **Priority**  | Must                                                                                                  |

## Goal

Tell the employee what happened to their desk. Email always — on book, on cancel, and the morning before (BR-001.13, BR-001.14). Browser push only if they asked for it (BR-001.15), and never for reminders (BR-001.16).

## Stories

| Story  | Title                                                   | Priority | Traces to        |
| ------ | ------------------------------------------------------- | -------- | ---------------- |
| US-028 | Get a confirmation email when my booking is made        | Must     | REQ-023          |
| US-029 | Get a cancellation email when my booking is voided      | Must     | REQ-024          |
| US-030 | Get a reminder email the day before                     | Must     | REQ-025          |
| US-031 | Turn browser push alerts on or off                      | Must     | REQ-026, NFR-006 |
| US-032 | Get a push alert when a booking is made or cancelled    | Must     | REQ-027          |

## The open question that lands in this epic

BRD-001 open question **#14** is unresolved, and it is US-029's AC-04. When somebody other than the owner cancels a booking, the **push** alert names the office admin (BR-001.20) — but nothing was decided about the **email**. Push defaults to off (REQ-026), so most employees only ever receive the email: the version that does not explain itself.

US-029 carries that as a TBD (owner: Joy Joshua). The story can be started; it cannot be finished until the wording is decided.

## Out of scope (BRD-001 §10)

- SMS and native mobile-app push.
- Push for day-before reminders — email only (BR-001.16).
- Opting out of the mandatory booking emails.
- Admin copies of any booking email (decided 2026-09-07, open question #10).
- Emailing passwords or account credentials.
- Notifying the holders when a desk they booked is renamed (BR-001.19, RISK-012).
