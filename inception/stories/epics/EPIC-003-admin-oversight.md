# EPIC-003 — Admin oversight

> Approval = Gate 1 review of this file's PR, alongside the stories it groups.

|               |                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------- |
| **Traces to** | BRD-001 §3 workflows 4, 6, 7 · REQ-004, REQ-005, REQ-011 – REQ-022, REQ-028, REQ-030 – REQ-033   |
| **Stories**   | US-013 – US-027                                                                                   |
| **Screens**   | SCR-005 (All bookings), SCR-006 (Desks), SCR-007 (Desk form), SCR-008 (People), SCR-009 (User form) |
| **Priority**  | Must — except US-022 (Should)                                                                     |

## Goal

Give the office administrator the three things they maintain: everybody's bookings, the desk inventory, and the user accounts. This is the largest epic in the release and the one RISK-001 warned about.

## Stories

| Story  | Title                                                    | Priority | Traces to                  |
| ------ | -------------------------------------------------------- | -------- | -------------------------- |
| US-013 | See every booking in the office                          | Must     | REQ-011, REQ-028           |
| US-014 | Filter all bookings by date, status and desk             | Must     | REQ-012, REQ-013, REQ-031  |
| US-015 | Cancel an employee's booking on their behalf             | Must     | REQ-014                    |
| US-016 | See the desk inventory and how many people hold each desk | Must    | REQ-017                    |
| US-017 | Add a desk                                               | Must     | REQ-015                    |
| US-018 | Correct a desk number                                    | Must     | REQ-016                    |
| US-019 | Take a desk out of service, and put it back               | Must     | REQ-017                    |
| US-020 | Find an account in the people list                       | Must     | REQ-032                    |
| US-021 | Create a user account                                    | Must     | REQ-004, REQ-018           |
| US-022 | Have the system suggest an initial password              | Should   | REQ-033                    |
| US-023 | Correct a person's name or email                         | Must     | REQ-019                    |
| US-024 | Change a person's role                                   | Must     | REQ-004, REQ-022           |
| US-025 | Deactivate an account and release the desks it holds     | Must     | REQ-005, REQ-020, REQ-030  |
| US-026 | Bring a deactivated account back                         | Must     | REQ-005, REQ-020           |
| US-027 | Reset somebody's password                                | Must     | REQ-021                    |

## Two deliberate opposites, neither a precedent

- Deactivating a **desk** with upcoming bookings is **hard-blocked** and cancels nothing (US-019, BR-001.9).
- Deactivating a **person** with upcoming bookings **always proceeds** and cancels all of them (US-025, BR-001.18).

BR-001.18's own note says this: a desk can wait, a revoked account cannot. Both stories restate it, because a developer who implements one and then the other will otherwise assume the first shape was the house style.

## Traceability gaps this epic surfaced

Two capabilities are in the approved design and in BRD-001's workflows, but have no numbered requirement of their own. Neither is invented here; both are flagged for the PO as new open questions rather than quietly given a REQ:

| Capability                                         | Where it lives now                                | Story  |
| -------------------------------------------------- | ------------------------------------------------- | ------ |
| Viewing the desk inventory itself                  | BRD-001 §3 workflow 6 + SCR-006; no REQ           | US-016 |
| Reactivating a deactivated account                 | SCR-008 ST-14, ST-15 ("Activate"); no REQ, and workflow 7 does not mention it | US-026 |

Both stories trace to the nearest governing requirement and say so in their own notes.

## Out of scope (BRD-001 §10)

- Search or filtering on the desk inventory — 30–100 desks sorted by number is scannable (SCR-006 open question 2). Revisit past ~100 desks.
- Desk booking by Admin accounts. An Admin who also needs a desk needs a second, Employee-role account.
- Admin copies of booking emails.
- Emailing a password to its owner (BR-001.12 — shown once on screen instead).
