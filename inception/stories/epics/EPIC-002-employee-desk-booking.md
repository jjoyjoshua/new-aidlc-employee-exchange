# EPIC-002 — Employee desk booking

> Approval = Gate 1 review of this file's PR, alongside the stories it groups.

|               |                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Traces to** | BRD-001 §3 workflows 1, 2, 3, 5 · REQ-006 – REQ-010, REQ-017, REQ-028, REQ-034 – REQ-036 · NFR-001                 |
| **Stories**   | US-005, US-006, US-007, US-008, US-009, US-010, US-011, US-012                                                     |
| **Screens**   | SCR-003 (Book a desk), SCR-002 (My bookings)                                                                       |
| **Priority**  | Must — except US-008 and US-009 (Could) and US-012 (Should)                                                        |

## Goal

The product's reason to exist: an employee reserves a specific desk before coming in, sees what they hold, and gives it back when plans change. One desk per person per working day (BR-001.1), changed by cancel-then-book (BR-001.2).

## Stories

| Story  | Title                                                   | Priority | Traces to        |
| ------ | ------------------------------------------------------- | -------- | ---------------- |
| US-005 | Choose a booking date inside the window                 | Must     | REQ-006, NFR-001 |
| US-006 | See desk availability for the chosen date               | Must     | REQ-007, REQ-017 |
| US-007 | Book an available desk                                  | Must     | REQ-008          |
| US-008 | See which desk I booked last                            | Could    | REQ-034          |
| US-009 | Be offered the next free days when everything is taken  | Could    | REQ-035          |
| US-010 | View my own bookings, past and upcoming                 | Must     | REQ-009, REQ-028 |
| US-011 | Cancel my own booking                                   | Must     | REQ-010          |
| US-012 | Come back to a booking list that is still true          | Should   | REQ-036          |

## Out of scope (BRD-001 §10)

- More than one desk per employee per day.
- In-place desk swap without cancelling first (BR-001.2).
- Weekend booking (BR-001.3); public holidays are not excluded at all (BRD-001 §8, RISK-002).
- Booking a desk for somebody else, and booking by an Admin account.
- Seeing **who** holds a taken desk — resolved 2026-09-07 as no names (SCR-003 conflict 1).

## Drop order if the release tightens

US-008, then US-009 (both Could), then US-012 (Should). US-005 – US-007, US-010 and US-011 are the epic: without any one of them there is no product.
