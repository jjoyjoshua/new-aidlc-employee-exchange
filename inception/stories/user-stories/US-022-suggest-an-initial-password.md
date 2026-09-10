# US-022 — Have the system suggest an initial password

> Approval = Gate 1 review of this file's PR. Delivery = the story PR (`feat/US-022-suggest-an-initial-password`) merging with every AC proven by a test named `... (US-022/AC-##)`.

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Epic**       | EPIC-003                                               |
| **Traces to**  | REQ-033, V-12, V-18                                    |
| **Priority**   | Should                                                 |
| **Estimate**   | 2 pts (AI draft — humans re-estimate)                  |
| **Depends on** | US-021                                                 |

## Story

As an office administrator creating an account
I want the system to produce a first password for me
So that I do not invent a weak one, or one I will misread aloud to the new starter.

## Acceptance criteria

### AC-01 Suggesting fills the field with a compliant password

- **Given** the create-person form
- **When** **Suggest a password** is used
- **Then** the password field is filled with a value satisfying all five rules of V-12, and the checklist shows every rule met (REQ-033, SCR-009 ST-09)

### AC-02 Ambiguous characters are excluded

- **Given** a generated password
- **When** its characters are inspected
- **Then** it contains none of `1`, `l`, `I`, `0` or `O` — the characters that get misheard and mistyped when a password is read aloud (REQ-033, V-18)

### AC-03 The result is visible to the administrator

- **Given** a generated password
- **When** it is placed in the field
- **Then** it is readable on screen, so the administrator can pass it on

### AC-04 Suggesting again produces a different password

- **Given** a generated password
- **When** **Suggest a password** is used again
- **Then** a different value replaces it

### AC-05 A generated password is still editable

- **Given** a filled field
- **When** the administrator types over it
- **Then** the entry is accepted or refused by the ordinary rules (US-021/AC-03) — generating does not lock the field

### AC-06 The generated password behaves exactly like a typed one

- **Given** an account created with a generated password
- **When** the new user signs in with it
- **Then** they are required to choose their own (BR-001.17, US-004/AC-01) — there is no distinction between a generated and a typed initial password anywhere after creation

## Edge cases

- Excluding five characters slightly reduces the character space. Length is the compensation; the generator should exceed the 8-character minimum comfortably rather than sit on it.
- The generated value must still satisfy V-12 *after* the exclusions — a generator that reaches for the "special character" rule and lands on an excluded character has failed both ACs.
- Nothing in BRD-001 asks for a suggest control on the **reset** path (US-027), where BR-001.12 has the system generate the password itself. If the PO wants the two paths to share one generator, that is sensible and worth stating; the walkthrough asks.
- **First of the Should items to consider dropping**, though it is cheap: without it an administrator invents passwords by hand, which RISK-005 already worries about.

## UI

Served by **SCR-009 — User form**, approved in design step 2. The **Suggest a password** control is part of the approved create form.

States exercised: **ST-01** create — default (the control's resting place) · **ST-09** create — all rules met (its result).

## QA notes

- AC-02 is the whole substance of V-18: generate a few hundred passwords in the test and assert none contains an excluded character. A single-sample test proves nothing about a random generator.
- Assert compliance with V-12 across the same sample, not once.
- AC-04 is a weak-but-useful assertion against a fixed or seeded value shipping by accident.
- Data setup: none beyond the create form.

## API impacts

Generation may be server-side or client-side; V-18 and V-12 must hold either way, and the value must never be logged. `/architect`'s call — no OpenAPI contract exists in this repository yet.
