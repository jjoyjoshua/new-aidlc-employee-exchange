# ADR-012 — Write ordering and compensation for cross-system *updates*

|             |                                                                          |
| ----------- | ------------------------------------------------------------------------ |
| **Status**  | proposed                                                                 |
| **Date**    | 2026-09-20                                                               |
| **Decider** | Joy Joshua (drafted by Architect persona)                                |
| **Serves**  | US-023; US-025, US-027 (forecast)                                        |
| **Extends** | [ADR-011](ADR-011-cross-system-write-compensation.md) — it does not supersede it |

## Context

[ADR-011](ADR-011-cross-system-write-compensation.md) settled how this product writes Supabase Auth
and its own Postgres when there is no shared transaction. It was written for **account creation**
(US-021), and its Decision item 2 spells out the compensation for that shape: mint the credential,
insert the profile, and on a failed insert hard-delete the credential nobody is using yet.

ADR-011 forecast US-023 by name three times (`:8`, `:16`, `:42`) as inheriting its general rule. It
did not write out US-023's compensation branch, because **update's shape is not create's**:

- Create either fully succeeds, or the second write's failure has a clean undo — deleting a
  credential nobody has used. Nothing observable was ever true.
- Update's first write can succeed and its second fail, leaving the two systems holding **different
  answers to the same question**, both of them served correctly by their own system. There is no
  "delete" that undoes a completed change.

And ADR-011's ordering rule does not reach the update case at all. Its item 1 says *"Order is fixed,
not decided"* because `user_profiles.id` cannot reference a row that does not yet exist. That is a
fact about **row creation**. On an update both rows already exist, the foreign key constrains
nothing, and the order becomes a real decision for the first time.

US-023 is where this lands first. The two acceptance criteria are served by **different systems**:

- **AC-05** — a changed email becomes the sign-in identifier — is decided by `auth.users.email`
  alone. `auth.service.ts:129` signs in through GoTrue with the typed address and `:137` then finds
  the profile **by id**, never by email.
- **AC-06** — notifications follow the new address — and every address the product displays are
  decided by `user_profiles.email` alone (`auth.service.ts:88-94`, `users.repository.ts`).

So a divergence is not stale data. It is two acceptance criteria disagreeing about which address is
this person's, and it is not possible to satisfy both while it lasts.

US-025 (deactivation and BR-001.18's cascade) and US-027 (an admin password reset) are each an update
across the same seam, and each would otherwise re-derive this from scratch.

## Decision

**For a cross-system *update*, we will write this application's own Postgres first and Supabase Auth
second — the reverse of creation — and on a failure of the second write we will compensate by
restoring the first write's remembered prior values, logging the outcome either way and never
surfacing the distinction to the caller.**

Concretely:

1. **The order is decided, not forced — and it reverses ADR-011's.** ADR-011 item 1 governs
   creation, where the foreign key admits no choice. For an update both rows exist and the foreign
   key is silent, so the order is chosen: **`user_profiles` first, Supabase Auth second.** See
   Rationale below for the four reasons.
2. **The compensation restores remembered values; it does not delete.** The service reads the current
   row before writing — a read it needs anyway to answer "did this field change?" and to build the
   response — and on a failure of the second write re-issues the same statement with the old values.
   **It restores every field the first write touched, not only the one that caused the failure**: the
   approved copy for a failed save says *"Nothing has changed"*, and a partial revert would make that
   false.
3. **`auth.admin.deleteUser` is not a compensation for an update, and calling it is a data-loss bug.**
   ADR-011 item 2's hard delete exists to undo a *creation*. `user_profiles.id` is
   `on delete cascade`, so calling it on an existing account destroys the profile row and everything
   keyed to it. An implementation that "re-provisions" an account to change one attribute is
   forbidden by this ADR, not merely discouraged.
4. **The compensation is logged, never thrown, never surfaced** — ADR-011 item 3, unchanged. The
   caller sees one undifferentiated failure whether or not the restore succeeded.
5. **This is still ADR-011 item 4, not an exception to it.** Item 4 forbids one operation healing
   *another* operation's debris. A restore undoes the **same request's own** write, inside that
   request. No later request adopts, deletes or repairs a divergence it finds; it refuses and logs,
   exactly as before.
6. **The residual is a divergence, not an orphan, and it is worse than ADR-011's in one way and
   better in another.** Worse: it is **observable by the person** — they sign in with one address
   while the product mails another — where ADR-011's orphan is invisible. Better: it **heals on the
   administrator's retry**, because the operation is idempotent in both systems, where an orphan
   needs the service-role key. It is closed by a distinctly worded, greppable log line and by the
   retry, not by new surfaces.
7. **A divergence also degrades US-004.** `auth.service.ts:228` and `:259` sign in using
   `user_profiles.email` while GoTrue arbitrates on `auth.users.email`. While the two disagree,
   V-15's "same as current" probe silently stops detecting anything and the post-change re-sign-in
   fails. This is why a divergence is compensated rather than tolerated, and why the log line must be
   findable.

## Rationale for the ordering

Four arguments, in descending weight.

1. **The residual mismatch is the safer one.** Profile-first leaves notifications going to the
   **corrected** address with the sign-in identifier lagging. Auth-first leaves notifications going
   to the **old, possibly mistyped** address — which is the exact harm REQ-019 exists to remove, and
   plausibly sends one person's booking mail to a stranger. Both heal on retry; the difference is
   what is true during the window.
2. **The ordinary failure should not be the one that needs compensating.** A
   `user_profiles_email_key` violation is an ordinary concurrent race. A GoTrue `email_exists` that
   this application's own table did not see is already an anomaly (ADR-011's orphan, or this ADR's
   own residual). Profile-first detects the ordinary case **before** any cross-system write.
3. **The compensating write belongs in the system we own.** A PostgREST `UPDATE` against our own
   database, just demonstrated reachable, with no side effects — versus a second write to a
   credential record in a system we do not own.
4. **Fewer credential writes is a safety property.** Every touch on the Auth record is surface for
   the re-provisioning mistake item 3 forbids. Profile-first makes exactly one on the happy path and
   none on the compensating path.

## Alternatives considered

| Option | Pros | Cons | Why rejected |
| ------ | ---- | ---- | ------------ |
| **Auth first, then the profile — ADR-011's create order, applied verbatim** | One order to remember across every story; a reviewer never has to ask which shape they are looking at | Its residual is the worse of the two (Rationale 1): notifications go to the old, possibly wrong address, defeating REQ-019's stated purpose and plausibly mailing one person's bookings to a stranger. It also puts the *commoner* race on the compensating path (Rationale 2) and compensates with a second credential write (Rationale 3, 4) | The consistency is real and is bought at the price of the harm the story exists to prevent. Named explicitly here so the reversal is a decision on the record, not an oversight |
| **Auth first, with no compensation — leave the divergence and log, as ADR-011 does for a create orphan** | Fewest writes; symmetrical with the orphan handling already in the codebase | ADR-011's orphan is a resource **nobody is using**. A divergence is a **live account** whose two halves disagree, observable by its owner, and it silently degrades US-004's V-15 check (Decision item 7). "Log and leave" is proportionate to an unused resource, not to a working account in an inconsistent state | The analogy to the orphan does not hold: the two residuals differ in kind, not in degree |
| **Retry the failed second write instead of compensating** | The happy path is preserved; no revert | A retry inside the request either succeeds quickly (in which case the failure was transient and the caller waits) or fails again (in which case it has bought a longer request and the same divergence). It also needs a retry budget, a backoff and a cap, none of which any story describes | Speculative machinery that does not remove the branch it is meant to replace — only delays it |
| **Re-provision: delete the Auth user and create a replacement with the new email** | One familiar code path; reuses ADR-011's create shape wholesale | `user_profiles.id` is `on delete cascade`, so this destroys the profile row and every booking keyed to it; it resets the password and re-marks the account administrator-set, sending an innocent user to the forced-change screen. US-023's own QA notes name this as the mistake the story is most likely to ship | Data loss and a credential reset in the name of changing one attribute. Forbidden by Decision item 3, not merely rejected |
| **A shared transaction across Supabase Auth and Postgres** | Removes the problem entirely | There is no distributed-transaction coordinator between GoTrue and this application's schema | Not available. A fact about the infrastructure, as ADR-011 already recorded |
| **An optimistic-concurrency guard on the profile update (`where email = :oldEmail`)** | Closes the read-then-write window, so a restore can never overwrite a concurrent edit; one line | No story describes two administrators editing one account at the same time, and US-018 built no such guard for the identical exposure on desks. It also needs its own refusal state and copy, which no approved screen has | Out of scope until a story asks. Named here so the next author sees it was considered rather than missed |
| **A background reconciliation job that finds and repairs diverged accounts** | Handles the residual without relying on a human reading a log line | ADR-011 rejected exactly this for the orphan case, on the grounds that a scheduled job is its own Complex surface with no story behind it. Nothing about update changes that argument, and this residual additionally heals on retry, which the orphan does not | Rejected for ADR-011's reasons, which apply here with more force, not less |

## Relationship to ADR-011

| ADR-011 | Status under this ADR |
| --- | --- |
| Item 1 — Auth first, forced by the foreign key | **Scoped to creation.** For an update, the FK is silent and the order is decided the other way (Decision item 1) |
| Item 2 — compensate the second write's failure by deleting what the first created, hard | **Extended.** Delete is creation's undo. Update's undo is a restore to remembered values (Decision items 2, 3) |
| Item 3 — logged, never thrown, never surfaced | **Inherited unchanged** (Decision item 4) |
| Item 4 — no operation heals another operation's debris | **Inherited unchanged.** A restore undoes the same request's own write (Decision item 5) |
| Item 5 — the residual is operational, closed by observability | **Inherited, with the residual re-characterised** (Decision items 6, 7) |

ADR-011 is **not superseded**. It remains the whole answer for creation, which is the only shape
US-021 has.

## Consequences

**Easier.** US-025 and US-027 each inherit a settled answer for the update shape rather than
re-deriving it, and can cite this ADR. The pattern — read current, write ours, write theirs, restore
ours on failure, log, never throw — is one shape to review rather than a new one per story.

**Harder.** Two orderings now exist in one module, and a reviewer must establish which shape a diff
is before judging it. The rule that tells them apart is short and mechanical: **does the operation
create a row that must reference another? Auth first. Does it change rows that both already exist?
Ours first.** `apps/api/src/modules/users/README.md` carries that sentence.

Every cross-system update also needs a read before its write — to remember what to restore — which is
one more round trip than a blind `UPDATE`. At `db-design.md`'s stated bound of "hundreds of accounts,
not millions", that is not a cost worth optimising.

**Follow-up work created.**

1. `apps/api/src/modules/users/README.md` gains the two-sentence rule above and the US-004
   consequence in Decision item 7.
2. ADR-011 gains one forward-pointing line naming this ADR as the update-shaped extension, so a
   reader starting from item 1 is not left believing "Auth first" is universal.
3. US-025 and US-027 apply this ADR by name in their own design notes.
4. If a divergence is ever observed in production more than incidentally, that is the trigger for a
   follow-up story proposing the operator repair path this ADR declines to build speculatively — the
   same trigger ADR-011 set for its orphan.
