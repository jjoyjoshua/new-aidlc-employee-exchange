# ADR-011 — Write ordering and compensation across Supabase Auth and Postgres

|             |                                                                          |
| ----------- | ------------------------------------------------------------------------ |
| **Status**  | proposed                                                                 |
| **Date**    | 2026-09-20                                                               |
| **Decider** | Joy Joshua (drafted by Architect persona)                                |
| **Serves**  | US-021; US-023, US-025, US-027 (forecast)                                |

## Context

`user_profiles.id` is `references auth.users (id) on delete cascade` (`supabase/migrations/0001_user_profiles.sql:28`). Every account this product creates lives partly in Supabase Auth (the credential, in `auth.users`) and partly in this application's own Postgres schema (the profile, in `user_profiles`) — two systems, no shared transaction between them.

US-021 is the first story to write both in one request: mint a credential via `auth.admin.createUser`, then insert the matching `user_profiles` row. Nothing stops the second write from failing after the first has already succeeded — a database outage, a dropped connection, a deploy landing mid-request. When that happens, an `auth.users` row exists with no `user_profiles` row behind it: an account that cannot sign in (`auth.service.ts` refuses a sign-in whose profile lookup returns nothing) but that permanently occupies its email address, because GoTrue enforces uniqueness on `auth.users.email` independently of this application's own table.

This is not a one-story problem. `apps/api/src/modules/users/README.md` already names three more stories that write both systems in one request: US-023 (correcting a person's email changes it in both places), US-025 (deactivation, plus BR-001.18's cascade), and US-027 (an admin password reset, an Auth-only write whose failure must leave the profile untouched). Each would otherwise re-derive this ordering and compensation rule from scratch, and the alternatives below are ones a future author will plausibly reach for again without this record.

## Decision

**We will write Supabase Auth before `user_profiles` — an order the foreign key forces, not a per-story choice — and on a subsequent-write failure, we will best-effort compensate by deleting what the first write created, hard (never soft), logging the outcome either way and never surfacing the distinction to the caller.**

Concretely:

1. **Order is fixed, not decided.** `user_profiles.id` cannot reference a row that does not yet exist. Any story writing both systems writes Auth first.
2. **A failure on the second write triggers a compensating delete of the first.** For account creation, `auth.admin.deleteUser(userId)` with `shouldSoftDelete` left at its default `false` — a soft delete leaves the row and the email still occupied, which is exactly the harm being undone. The FK's `on delete cascade` means one call is sufficient; there is no second compensating write to forget.
3. **The compensation is logged, never thrown.** Whether the compensating delete itself succeeds or fails, the operation's caller receives one undifferentiated failure. A compensation that throws would turn a handled failure into a different, worse one.
4. **No operation heals another operation's debris.** A later request that detects an inconsistent cross-system state (a credential with no profile, or vice versa) refuses and logs; it does not delete or adopt a resource it did not create in that request. Self-healing on a later attempt was considered for US-021 and rejected: the common cause of the inconsistency is a concurrent request still mid-flight, so deleting or adopting the orphaned resource is destructive on exactly the race it is meant to handle, and there is no cheap way to locate an orphan by email in the first place (`GoTrueAdminApi.listUsers` takes no email filter).
5. **The residual risk is operational, not a security hole, and is closed by observability, not new surfaces.** An account created this way but left in the orphaned state becomes uncreatable through the product until a human with the service-role key clears it — it cannot sign in and carries no role. A greppable log line and this ADR's own record are the fix; a cleanup screen or a background reconciliation job are new surfaces with no story behind them and are explicitly out of scope until one exists.

## Alternatives considered

| Option | Pros | Cons | Why rejected |
| ------ | ---- | ---- | ------------ |
| **A shared transaction across Supabase Auth and Postgres** | Would remove the whole problem | Supabase Auth (GoTrue) and this application's Postgres schema are two separate systems with no distributed-transaction coordinator between them | Not available. Not a design choice — a fact about the infrastructure |
| **Self-heal an orphan on a later create attempt for the same email** | No compensating write needed at creation time; the next attempt "just works" | The common cause of the inconsistent state is a concurrent request still completing its second write, not a truly abandoned resource — healing it deletes or adopts a resource mid-use by another request. Also mechanically expensive: locating an orphaned `auth.users` row by email requires paging the entire admin user list, since it takes no email filter | Destructive on the race it exists to handle, and there is no cheap way to implement it even if it were safe |
| **Adopt the existing `auth.users` row** (set its password to the newly submitted one, then insert the profile) | Avoids a delete entirely | An account-takeover primitive: it hands whoever calls the create endpoint control of a credential the product did not mint for them, resting on an invariant ("nothing else creates auth users") that is true today only by inspection and enforced nowhere | Trust violation greater than the operational cost it avoids |
| **Leave the orphan in place, do nothing** | Simplest | The email is permanently uncreatable through the product with no path to recovery short of direct database/Auth-console access, and no record exists of why | Silent, unrecoverable, and undiscoverable without this ADR's own log line |
| **A background reconciliation job that periodically finds and deletes orphaned `auth.users` rows** | Handles the residual risk without relying on a human noticing a log line | A new scheduled job is its own Complex-tier surface (`ai/standards/task-surfaces.md`) with no story, AC, or design behind it; this system's only other scheduled job (the day-before reminder) sets a precedent this would follow, not lead | Out of scope until a story asks for it; the residual risk is small enough that observability is proportionate |

## Consequences

**Easier.** US-023, US-025 and US-027 each inherit a settled answer to "what order, and what happens on partial failure" rather than re-deriving it, and can cite this ADR instead of repeating the reasoning. The compensating-delete pattern (mint, try the second write, delete on failure, log, never throw) is one shape to review for correctness rather than a new one per story.

**Harder.** Every cross-system write now carries an explicit compensating branch, which is more code than assuming the second write always succeeds. A reviewer must check that the delete call uses the hard-delete default and that no story maps a race-condition duplicate straight to "already exists" without first checking whether the resource behind it actually completed (the mistake this ADR's own worked example, US-021/A3, calls out by name).

**Follow-up work created.**

1. `apps/api/src/modules/users/README.md` gains a line pointing at this ADR as the module's standing answer to cross-system writes, so US-023/US-025/US-027 find it without re-reading US-021's design note.
2. US-023, US-025 and US-027 each apply this ADR by name in their own design notes rather than re-deriving it.
3. If the residual risk (§ Decision, item 5) is ever observed in production more than incidentally, that is the trigger for a follow-up story proposing the cleanup path this ADR declines to build speculatively now.
