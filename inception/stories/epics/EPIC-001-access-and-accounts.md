# EPIC-001 — Access and accounts

> Approval = Gate 1 review of this file's PR, alongside the stories it groups.

|               |                                                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Traces to** | BRD-001 §3 workflows 1, 4, 10 · REQ-001, REQ-002, REQ-003, REQ-005, REQ-029 · NFR-003, NFR-009                                                 |
| **Stories**   | US-001, US-002, US-003, US-004                                                                                                                 |
| **Screens**   | SCR-001 (Sign in), SCR-010 (Set your password)                                                                                                 |
| **Priority**  | Must                                                                                                                                           |

## Goal

Get the right person into the product and nobody else, and make sure the password they end up using is one only they know. Every other epic sits behind this one, so it ships first.

## Stories

| Story  | Title                                                  | Priority | Traces to                          |
| ------ | ------------------------------------------------------ | -------- | ---------------------------------- |
| US-001 | Sign in with email and password                        | Must     | REQ-001, REQ-002, REQ-005, NFR-003 |
| US-002 | Sign out                                               | Must     | REQ-003                            |
| US-003 | Stay signed in for 30 days                             | Must     | NFR-009                            |
| US-004 | Replace an administrator-set password at first sign-in  | Must     | REQ-029                            |

## Out of scope (BRD-001 §10)

- Self-service forgot-password. Admin-initiated reset is US-027, in EPIC-003.
- A voluntary "change my password" option for a user who simply wants a new one.
- SSO or social login (BRD-001 §8).
- A "remember me" control — the 30-day session (US-003) already is remember-me (SCR-001 structural decisions).
