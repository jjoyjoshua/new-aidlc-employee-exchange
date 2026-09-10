# Input — 2026-09-10 — decisions taken in design and never codified in BRD-001

**Source:** the ten approved screen specs in `inception/design/screens/`, all merged
to `main` (PRs #3–#18). Every decision below was taken by **Joy Joshua (PO/BA)** on the
date stated in the quoted row, and recorded in a design PR the PO approved and merged.

**Vehicle:** a cross-screen consistency sweep run by `/ba` on 2026-09-10, comparing
BRD-001 (29 REQs, 8 NFRs, 17 business rules, 15 validations) against all ten screen
specs and the traceability manifest, before Discovery step 3 (stories).

## How this arose

Not from a customer request, and not from a new decision. During design, the UX persona
repeatedly found business rules that BRD-001 did not carry. Each was raised as a numbered
row in that screen's **Conflicts and open questions** table, decided by the PO, and marked
resolved — several with an explicit instruction that the BA must now write the decision
into BRD-001.

**Six of those instructions were never carried out.** The design was approved and merged
on the strength of decisions that exist only inside design files. A story sliced from
BRD-001 alone would not carry them, so they would not be built and would not be tested.

A further set of behaviours reached the approved screens with no requirement at all and
without ever being raised as a BA action.

Nothing in this file is a new decision. It is transcription.

## A. Instructions to the BA, recorded in approved design specs, not carried out

### A1 — Deactivating a user cancels their upcoming bookings

`SCR-008-people.md`, Conflicts row 1:

> **What happens to a deactivated user's upcoming bookings?** REQ-020 stops sign-in;
> nothing addresses their reservations. A leaver keeps a desk booked every Tuesday for
> three weeks and cannot cancel it themselves (REQ-010 requires signing in) — so desks
> sit reserved and empty until an Admin notices.
>
> **Resolved 2026-09-07 (Joy Joshua, PO/BA) — deactivation cancels them.** Deactivate
> immediately and cancel every Confirmed booking dated today or later in the same act;
> the admin sees the list and count first (ST-06); each cancellation emails the owner
> (REQ-024). **New rule — `/ba` must add it to BRD-001**

Same file, Purpose section:

> A third rule was added on 2026-09-07 (Joy Joshua, PO/BA, pending codification in
> BRD-001): **deactivating a user also cancels their upcoming bookings.** [...] This is
> deliberately the opposite shape from desk deactivation, where BR-001.9 blocks rather
> than cancels; the difference is that a desk can wait and a revoked account cannot.

### A2 — Desk numbers have an enforced format

`SCR-007-desk-form.md`, Conflicts row 1:

> **Is there an enforced format for a desk number?** BR-001.4 gives `A-01` as an example
> and BR-001.8 requires uniqueness; nothing requires a shape. But SCR-003 groups 30–100
> desks into zones by the letter prefix, so free text makes that grouping unreliable —
> one desk typed `Window seat 3` and a zone is meaningless.
>
> **Resolved 2026-09-07 (Joy Joshua, PO/BA) — yes: `^[A-Z]-\d{2}$`.** One upper-case
> letter, a hyphen, two digits. Also closes SCR-003 row 2 and fixes the field length at 4.
> **New rule — `/ba` must add it to BR-001.4 in BRD-001**; the accepted limits are 26
> zones, 99 desks per zone, and no non-conforming desk label

Same file, Conflicts row 2:

> **Resolved 2026-09-07 (Joy Joshua, PO/BA) — exactly 4 characters.** Settled by row 1's
> format.

Same file, Purpose: lower case is accepted as typed and normalised up, so `a-01` becomes
`A-01` while `a-1` is refused.

### A3 — Session lifetime

`SCR-001-sign-in.md`, Conflicts row 2:

> How long does a session last, and is it extended by use? Nothing in BRD-001 says.
>
> **Resolved 2026-09-07 (Joy Joshua, PO/BA) — 30 days, extended by use.** Right for a
> low-sensitivity internal tool, and it keeps a password prompt out of the cancellation
> path. **New non-functional requirement — `/ba` must add it to BRD-001**; the accepted
> risk is that a lost unlocked phone can book and cancel desks

### A4 — Admins can filter all bookings by desk

`SCR-005-all-bookings.md`, Conflicts row 1:

> The desk filter is not in REQ-012 or REQ-013, but BR-001.9's blocked-deactivation route
> needs it to be usable.
>
> **Resolved 2026-09-07 (Joy Joshua, PO/BA) — keep the filter.** BR-001.9's
> blocked-deactivation route is unusable without it. **`/ba` should widen REQ-011 (or
> REQ-012) to cover filtering by desk**, so the screen traces to a requirement rather
> than to this decision

### A5 — Renaming a booked desk is permitted, and silent

`SCR-006-desks.md`, Conflicts row 3:

> Can a desk's number be edited while it has upcoming bookings? REQ-016 permits editing
> "subject to uniqueness validation" and says nothing about bookings. An employee holding
> a booking for A-01 that silently becomes A-99 arrives at a desk that no longer exists
> by that name — and no email is sent for an edit.
>
> **Resolved 2026-09-07 (Joy Joshua, PO/BA) — allowed, with a warning.** SCR-007 ST-02
> states how many people hold the desk and that they will not be told, then lets the edit
> proceed [...] Emailing affected employees was rejected as a fourth transactional email.
> **Clarifies REQ-016 — `/ba` should record that renaming is permitted and silent**

### A6 — A cancellation push alert names the office admin as the actor

`SCR-004-settings.md`, Conflicts row 1:

> When an Admin cancels an employee's booking (REQ-014), REQ-027 sends that employee a
> push notification. Does it say an admin did it? A push that reads "Your booking was
> cancelled" when the employee did not cancel it is alarming and unexplained.
>
> **Resolved 2026-09-07 (Joy Joshua, PO/BA) — name the actor.** The alert says the office
> admin cancelled it, e.g. *"Your desk for Tue 9 Sep was cancelled by your office admin."*
> [...] **Clarifies REQ-027 — `/ba` should record the agreed wording**; also covers the
> cancellations triggered by deactivating a user (SCR-008 row 4)

`SCR-008-people.md`, Conflicts row 4:

> **Resolved 2026-09-07 (Joy Joshua, PO/BA) — say why.** These use the same actor-naming
> copy agreed on SCR-004 [...] **Folded into the same `/ba` change as SCR-004 row 1**

## B. Behaviours in the approved design with no requirement, never raised as a BA action

Each is real, drawn, and built as hi-fi frames. None was flagged for codification.

| # | Behaviour | Where | Note |
| - | --------- | ----- | ---- |
| B1 | **Search the people list by name or email** | SCR-008 layout, `search-field`, ST-03, ST-16 | Load-bearing: BR-001.11's refusal (ST-07, ST-09) offers **Make someone an admin**, which "focuses the search field ready for a name". The safeguard's only recovery route runs through an unrequirement'd control |
| B2 | **Suggest a password** generator on user create | SCR-009 ST-01, ST-09, structural decisions | Produces a V-12-compliant value in one action and avoids ambiguous glyphs (`1`/`l`/`I`, `0`/`O`) because it is dictated. Rationale given: otherwise "`Password1!` on every account" |
| B3 | **Booked ahead** count per desk row | SCR-006 layout, ST-01 | Raised as SCR-006 row 1 and resolved *keep the count*, with no BRD change requested. It is the exact quantity BR-001.9 tests, shown before the block fires |
| B4 | **"Your usual"** hint on the last-booked desk | SCR-003 layout, structural decisions | "**Accepted 2026-09-07 (Joy Joshua, PO/BA)** — derived from her own booking history, so no new data and no new stored preference." Explicitly noted as "not in any requirement" |
| B5 | **Next two working days with desks free**, offered when a date is fully booked | SCR-003 ST-04; Conflicts row 3 | Resolved *keep the suggestions*; feasibility left as an `/architect` question, with a stated degradation to "Try another day" if the lookahead proves expensive |
| B6 | **Bounded history and paging** — employee history shows the last 30 days then **Show more**; admin bookings page at 50 with no date floor | SCR-002 row 1; SCR-005 row 3 | Both marked "clarifies; no BRD change", so REQ-009 and REQ-011 still read as unbounded lists |
| B7 | **Refresh the booking list when the window regains focus** | SCR-002 row 2 | The agreed mitigation for an admin cancelling a booking while the employee has the screen open. Marked "no new requirement" |

## C. Cross-screen inconsistency found by the sweep

Not a BRD gap — a copy asymmetry between two screens, both serving BR-001.17.

- **SCR-009** (create) warns the administrator: *"Give this password to them yourself — it
  isn't emailed. They'll be asked to change it when they first sign in."*
- **SCR-008 ST-10 / ST-11** (reset) says the password is shown once and is not emailed,
  but **never says the user will be forced to replace it**.

BR-001.17 covers creation (REQ-018) and reset (REQ-021) identically, and SCR-010 sits
behind both. The administrator performing a reset is not told the credential they are
handing over is about to be replaced. **Routes to `/ux`** as a copy change on SCR-008; no
BRD change.

## D. Decision recorded only in a design file

`SCR-005-all-bookings.md`, Conflicts row 2:

> **Can an Admin book a desk for themselves?** [...] **Resolved 2026-09-07 (Joy Joshua,
> PO/BA) — admins do not book, and that is intended.** [...] Recorded here so the gap is
> not rediscovered as a bug.

BRD-001 §10 does not list it. Implied by the actor table and by REQ-006–REQ-008 granting
booking to an Employee, but never stated.

## E. Not decided — carried forward as an open question

A6 settles the wording of the **push** alert (REQ-027) when an admin cancels. Nothing was
decided about whether the **cancellation email** (REQ-024) also names the actor, on either
the admin-cancel path (REQ-014) or the new deactivation-cascade path (A1). The email is
the unconditional channel (BR-001.13), so it reaches employees who never opted in to push
— which is most of them, since push defaults to off (REQ-026).

Raised as BRD-001 open question #14. Owner: PO/BA.
