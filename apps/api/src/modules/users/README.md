# users

## Ownership (ADR-004 — read across, write within)

**Owns (may write):** `user_profiles`. US-020 was this module's **first slice, and it was
read-only** — `GET /api/admin/users`. `../README.md`'s ownership row already reserved this
module's future scope in writing, before US-020 existed: "Account CRUD, role,
activate/deactivate **and its cascade**, admin password reset, search." US-021 (create), US-023
(edit) and US-024 (role change, this module's first write to `role`) fill in "CRUD" and "role" so
far; US-025/US-026 (deactivate/activate **and its cascade**) and US-027 (admin password reset)
still add their own write routes to this same module, not to `bookings` or anywhere else.
`../README.md`'s own rule is explicit: *"`users` owns the deactivation cascade, not `bookings`.
BR-001.18 makes cancelling the leaver's desks part of deactivating the account — one act, one
transaction, refusable as a whole."*

**`listAccounts(q?)` (US-020/AC-01, AC-04; REQ-032).** Selects `id, full_name, email, role,
is_active` ordered `full_name` ASC, and — when `q` is present — applies a `.or()` filter built by
`search-filter.ts`'s `buildSearchFilter`, the ONE named pure function that escapes ILIKE
metacharacters (`\`, `%`, `_`) and then quotes the value for PostgREST's own filter grammar
(`"`, `\` escaped again). Search is **server-side**, a Gate 1 decision this story consumes rather
than re-derives: `inception/architecture/db-design.md:351` states, verbatim, "REQ-032's search on
name or email is left as a case-insensitive `LIKE` over `full_name` and `email` with no special
index" — written before this module existed, and it predates and overrides the story's own "as
`/architect` decides" wording. `user_profiles_is_active_role_idx`
(`supabase/migrations/0001_user_profiles.sql:52`) already exists and its own comment names this
story by id for the list's default ordering; **no migration and no new index were added here** —
a sequential scan over "hundreds of accounts, not millions" (`db-design.md:352`) is the
deliberate, written choice, and adding a trigram index now would be speculative generality.

**The explicit select list is load-bearing, not a style preference (ADR-004; design note §7).**
`adminUsersResponseSchema` (`libs/contracts/src/users.ts`) is deliberately **not** `.strict()` —
every response in this project is additive-safe by convention — so Zod will **not** strip an
accidental extra column on the way out. `user_profiles` also carries `must_change_password`,
`deactivated_at`, `push_opt_in` and `last_seen_at`
(`supabase/migrations/0001_user_profiles.sql:27-44`), and `must_change_password` in particular is
a targeting signal: it identifies every account currently holding an administrator-set password.
The ONLY things stopping any of those four columns from leaking are this repository's explicit
`select('id, full_name, email, role, is_active')` — never `select('*')` — and
`users.service.ts`'s explicit field-by-field mapping. Nothing schema-level enforces this; a route
test asserting the exact response body with `toEqual` (never `toMatchObject`) is what turns this
into a check rather than a convention (`admin.routes.spec.ts`).

**US-027 is `must_change_password`'s first re-armer.** Every writer before it only ever set the
flag `false` (`clearMustChangePassword`, `modules/auth/auth.repository.ts`, once a person chooses
their own password) — account creation gets `true` for free from the column default
(`insertProfile`'s own docblock, `users.repository.ts`, states this explicitly). `armMustChangePassword`
(`users.repository.ts`) is the first statement anywhere in this codebase that sets it back to
`true` on an account that is already active. It is unconditional and doubles as the reset
endpoint's existence check (design note §2.2, §2.3): there is no `already_armed` outcome, because
a plain `UPDATE` cannot see the pre-write state and a repeat has no side effect to double-fire.
**No compensating un-arm exists** if the follow-on Supabase Auth write then fails (D-06, design
note §2.4): the account's password is untouched on that branch, so the only residual is an armed
flag on an account whose credential did not change — which is what BR-001.17 already asks of a
person carrying this flag, not a divergence worth a second write to repair.

**`getSummaryCounts()` (US-020/AC-02, AC-06 — BR-001.11).** Selects `role, is_active` **only** —
no `id`, no `email`, no `full_name` — over the WHOLE table, unconditionally unfiltered: this
method takes no `q` parameter at all, so a future caller cannot pass one by mistake. It is the
one query in this module that touches every row in the table, and it carries **no PII
whatsoever** — a security property worth stating here, not merely achieving by omission. The four
counts (`total`, `employees`, `admins`, `deactivated`) are tallied in `users.service.ts` from
these rows via a plain in-memory loop, via `Promise.all` alongside `listAccounts` — never a
PostgREST aggregate. That choice is forced, not stylistic: an aggregate sits behind a server
setting this repository does not control, so no unit test could prove it ran, and
`db-design.md:352`'s own volume bound ("hundreds of accounts, not millions") means an in-memory
tally over a few hundred two-column rows needs no defence. `employees + admins === total`, and
`deactivated` counts rows **inside** that total, not a fourth bucket — the invariant
`users.service.spec.ts` asserts directly, because "count `total` over active rows only" passes
every fixture that happens to have nobody deactivated.

**Why the summary is a second, unfiltered read rather than derived from `users` in the same
response.** The moment `q` is non-empty, the browser holds a *subset* of the table, and AC-06
requires the summary to report the *whole* table's composition, unchanged — a well-meaning
"optimisation" that derives the counts from the filtered list would silently break the very
journey (finding another admin to promote before the last-admin refusal fires) the counts exist
to serve.

## `createAccount` (US-021/AC-01, AC-06, AC-08 — this module's first WRITE)

**Two systems, one write each, no shared transaction.** Creating an account means minting a
credential in Supabase Auth (`auth.users`, via the service-role admin API) and inserting a row
into this module's own `user_profiles`. `ADR-011-cross-system-write-compensation.md` is the
standing answer for *creation*; US-023's own `updateAccount` (below) faces the same no-shared-
transaction problem but on an UPDATE, where the order reverses — see `ADR-012` and the section
below. US-025 (deactivation's cascade) and US-027 (an admin password reset) are each an update
across this same seam and apply `ADR-012` by name rather than re-deriving it.

**The write order is FORCED, not chosen.** `user_profiles.id references auth.users(id) on delete
cascade` (`0001_user_profiles.sql:28`) means a profile row cannot exist before its Auth row.
Auth is always written first.

**On a profile-insert failure after the credential was minted, the service compensates with a
hard delete** (`usersAuthAdapter.deleteAccount`, `auth.admin.deleteUser(userId)` with no second
argument — a soft delete would leave the email occupied, exactly the harm being undone). The
cascade above makes one call sufficient. The compensation is logged, never thrown, and never
surfaced to the caller — a failure always looks like nothing happened (AC-11), regardless of
which of the two writes actually broke.

**What arbitrates a real concurrent duplicate is NOT `findByEmail`.** Two indexes do: GoTrue's
own uniqueness on `auth.users.email`, and this table's own `user_profiles_email_key`
(`0001_user_profiles.sql:48`) — the identical property `insertDesk` states for its own insert
(`desks.repository.ts:56-58`), and `security-standards.md`'s own Gate-2 review question ("what
arbitrates — the code, or an index?") applied here. `findByEmail` is a **message-composition
read**: it exists only to let AC-06/ST-04's refusal name the colliding account and say whether it
is deactivated, information neither index's own violation error carries. When a race slips past
it — the adapter's own `createAccount` reports `duplicate` even though the pre-check found
nothing — the service re-reads once more to tell a genuine concurrent success (found on the
second read) from an orphaned credential left by an earlier failed compensation (still absent on
the second read); the orphan case logs and refuses rather than deleting or adopting a resource it
did not create in that request (ADR-011).

**`modules/users` may not import `modules/auth`** (`eslint.config.mjs:16-22`,
`../README.md`'s own boundary). The Supabase Auth calls this write needs live in this module's
own `users.adapter.ts`, calling `infra/supabase` directly — not reused from `auth/auth.adapter.ts`,
which is off limits.

## `updateAccount` (US-023/AC-01, AC-02, AC-03, AC-05, AC-06, AC-07, AC-08 — this module's first UPDATE)

**Two systems again, but the order REVERSES from `createAccount` above — this is the rule
`ADR-012-update-compensation-across-systems.md` exists to state.** `user_profiles` is written
**first**, Supabase Auth **second**. `createAccount`'s Auth-first order is forced by the foreign
key needing a row to reference; on an **update** both rows already exist, the foreign key
constrains nothing, and the order becomes a genuine decision. The two-sentence rule that tells a
reviewer which shape a diff is: **does the operation create a row that must reference another?
Auth first. Does it change rows that both already exist? Ours first.**

**Why ours-first, concretely: the two ACs this write serves are answered by different systems.**
AC-05 (the new email becomes the sign-in identifier) is decided by `auth.users.email` alone
(`auth.service.ts:129,137` — sign-in calls GoTrue with the typed address, then finds the profile
**by id**, never by email). AC-06 (notifications, and every address this product displays) is
decided by `user_profiles.email` alone. A residual mismatch after a partial failure is therefore
not stale data — it is the two ACs disagreeing about which address is this person's — and
profile-first leaves the *safer* residual: the corrected address serves notifications while the
old one still signs in, rather than the reverse (which would mail a person's bookings to whoever
now holds their old, mistyped address). ADR-012's Rationale section has the other three
arguments.

**No Auth call at all when the normalised email is unchanged** — structurally, not by
arrangement. Most corrections are name-only, and this path never touches the credential system
(AC-07's own safety net: fewer Auth writes is less surface for the "re-provision on edit" mistake
this story's QA notes name explicitly).

**On a failure of the Auth write, after the profile write succeeded, the service compensates by
restoring the OLD `full_name` and `email` to `user_profiles`** — a plain re-issue of
`updateProfileDetails` with the remembered prior values, never a delete.
`usersAuthAdapter.deleteAccount` (`createAccount`'s own compensation) **must never be called from
this path**: `user_profiles.id`'s `on delete cascade` means calling it here would destroy the
profile row and every booking keyed to it, not merely undo an email change. Logged, never thrown,
never surfaced to the caller — the same discipline `createAccount`'s compensation uses.

**A divergence that outlives its own request degrades US-004, not only US-023.**
`auth.service.ts:228` and `:259` sign in and re-sign-in using `profile.email` while GoTrue
arbitrates on `auth.users.email`. While the two disagree, V-15's "same as current password" check
silently stops detecting anything. This is why a divergence is compensated rather than tolerated,
and why the compensation-failure log line is worded distinctly enough to grep for.

**AC-06 has no observable, end-to-end proof in this release.** `modules/notifications` is a
README and nothing else — no notification code exists to send an email or to assert against. What
proves AC-06 here is structural: `user_profiles.email` **is** the account's address (ADR-004:
`users` owns the table), the write above updates it, and any future notification code must read
the account's *current* address from this table at send time, never a value captured when a
booking was made. That constraint is binding on whoever builds `modules/notifications` next, not
merely a suggestion.

**`findByEmail(email, excludeId?)`'s `excludeId` is defence in depth, not why AC-03 holds.**
AC-03 (saving the account's own unchanged email is not a self-collision) is true because the
service never runs the duplicate check or either write at all when the normalised email matches
the stored one — the load-bearing guard. `excludeId` only protects a second time, if that guard is
ever weakened.

## `changeRole` (US-024/AC-01, AC-04, AC-07, AC-12 — this module's first write to `role`)

**A single-system write, unlike `createAccount`/`updateAccount` above.** `changeRole` never calls
Supabase Auth on any branch — `role` lives only in `user_profiles` — so `ADR-011`/`ADR-012`'s
cross-system compensation shapes do not apply here at all. One `nowMs()` reading, threaded to
`setRole`'s `updatedAt` exactly as `updateAccount` does its own clock reading.

**BR-001.11 ("never zero active admins") is enforced entirely by a database trigger, not by this
module.** `supabase/migrations/0004_last_active_admin_guard.sql` adds the schema's only trigger
(`db-design.md` §3's own forecast) — a plain `AFTER UPDATE OF role, is_active … FOR EACH ROW`
trigger, **not** the `CONSTRAINT TRIGGER … DEFERRABLE` shape that section originally named. The
Architect's design note for this story (`inception/specs/US-024-change-a-persons-role/
design-note.md` §2) found that the originally-described shape permits write skew — two admins
demoting each other in the same instant can both pass and both commit, leaving zero active admins,
exactly the case `db-design.md` §3 names as the threat and does not close. The fix, recorded in
`ADR-013-whole-table-invariants-under-concurrency.md`, is a transaction-scoped advisory lock
(`pg_advisory_xact_lock(1001011)`) taken as the trigger function's first statement, before it
checks the invariant.

**The trigger's `WHEN` clause is why AC-07 and AC-12 need no code in this module at all.** It fires
only on `old.is_active and old.role = 'admin' and not (new.is_active and new.role = 'admin')` — a
row that was already deactivated can never trip it (AC-12), and a deactivated admin is never
counted by the guard's own `exists` either (AC-07, since REQ-005 already keeps a deactivated
account from signing in). **`usersRepository.setRole` and `usersService.changeRole` add no
application-side count, on any branch — the trigger is the sole arbiter, and a diff adding one is a
review finding.**

**The refusal is signalled by a project-minted SQLSTATE, `Z0011`**, matched by `setRole` on
`error.code` alone — never a message match, unlike `updateProfileDetails`'s `23505` above, which
needs the constraint name because `23505` is raised by every unique index in the schema. `Z0011` is
raised by exactly one `raise` statement in the whole schema, so no second discriminator is needed.
The route maps `blocked` to `422 last_active_admin` with **no `details` payload** — every fact the
browser's approved copy needs (the account's own name) is already on the screen that sent the
request (`decisions.md` D-03).

**One residual, named rather than silently accepted.** `user_profiles.id references auth.users(id)
on delete cascade` means deleting the last active admin's Auth user would empty the admin
population without the trigger ever seeing it — the trigger has no `DELETE` branch. No product path
deletes an account (`db-design.md` §4 is categorical, and `ADR-012` item 3 makes
`auth.admin.deleteUser` a data-loss bug on any live account), so this is accepted, not fixed
(design note §2.5, open item 4).

**The proof that matters is a gated real-Postgres test, not the unit suite.** A recording fake can
be *told* that Postgres raised `Z0011`; it cannot discover whether Postgres actually would have,
and it certainly cannot reproduce two genuinely simultaneous transactions racing the same trigger.
`apps/api/src/modules/admin/admin.concurrency.spec.ts`, gated on `RUN_BOOKINGS_CONCURRENCY_TEST=1`,
has the five cases: the SQLSTATE assumption asserted directly against the raw rejected error, the
AC-07/AC-12 shapes, a negative control, and — the one that actually proves the design — two
`Promise.all`'d demotions of two real admin fixtures leaving exactly one active admin, never zero.
That case fails against the trigger `db-design.md` §3 originally described and passes against this
one.

**The people list's own admin count is NOT BR-001.11's count, and this module has no reason to make
them agree.** `tallySummary` above counts every `role = 'admin'` row regardless of `is_active`;
BR-001.11 counts only `is_active and role = 'admin'`. An office can show "2 admins" while the
trigger sees one, and a demotion the screen gave no way to anticipate is refused correctly. Do not
"fix" this by filtering the summary to active admins only — AC-02/AC-06's own worked example
(`"38 people · 36 employees, 2 admins · 1 deactivated"`) is the whole-table count, by design.

## `deactivateAccount`/`previewDeactivation` (US-025/AC-01–AC-07, AC-10–AC-14 — the deactivation cascade)

**Not a second Auth-crossing write.** The forward constraint below predicted `deactivateAccount`
would cross the `user_profiles`/Auth seam the way `updateAccount`/`createAccount` do — it does
not. Deactivating an account is a `user_profiles`-only flip (`is_active`, `deactivated_at`), plus
a cascade into `bookings`, and Supabase Auth is never called on any branch. `ADR-011`/`ADR-012` do
not apply here for the same reason `changeRole` above is exempt from them.

**The first cross-table transactional write anywhere in this codebase, and the first thing this
application calls through PostgREST's `/rpc/` path.** `supabase/migrations/
0005_deactivate_account_cascade.sql` adds one PL/pgSQL function, `deactivate_account_cascade`,
called via `.rpc()` from `usersRepository.deactivateAccount` — never orchestrated as two separate
repository calls, because two PostgREST round trips are two separate implicit transactions and
cannot deliver AC-12's "all or nothing." Architect design note:
`inception/specs/US-025-deactivate-an-account/design-note.md` §2.

**Four PostgREST argument names are a wire contract, spelled in exactly one place.**
`p_target_id`, `p_actor_id`, `p_now`, `p_today` — `usersRepository.deactivateAccount`'s own
`.rpc()` call is the only place in this codebase that names them. Renaming any one of them without
also amending the migration is a breaking change that surfaces as `PGRST202` at runtime, never at
typecheck (design note §2.1, §2.7). A future signature change must `drop function
deactivate_account_cascade(uuid, uuid, timestamptz, date)` before re-creating it — PostgREST
cannot disambiguate two overloads of the same name (`PGRST203`).

**Reachable at a public URL by default, and this migration closes that.** Postgres grants
`EXECUTE` on a new function to `PUBLIC`, and PostgREST publishes every function in the exposed
schema at `/rest/v1/rpc/<name>` — reachable with the anon key that ships in the browser bundle.
The migration ends with `revoke execute … from public, anon, authenticated; grant execute … to
service_role`. It was harmless before that line only because `user_profiles`/`bookings` carry
`force row level security` with no policies — a second control making a first mistake survivable,
not the same as not making it (design note §2.7, C1).

**No `EXCEPTION` block in the function, and none may ever be added.** BR-001.11's refusal is
`0004`'s existing trigger firing from inside this function exactly as it fires from a plain
`UPDATE` — its uncaught `Z0011` unwinds the whole function and rolls back both tables. Catching it
here would roll back to a savepoint and return a "clean" answer with the refusal silently gone,
losing AC-10 and AC-12 at once (design note §2.4, §2.8).

**No new trigger — `0004_last_active_admin_guard.sql` is unmodified, exactly as its own comment
forecast.** `is_active` is already in that trigger's `UPDATE OF role, is_active` event list and
`WHEN` clause; a second trigger here would be a review finding (`ADR-013` Decision item 4, D-04).
The reused `Z0011` SQLSTATE match (`LAST_ACTIVE_ADMIN_SQLSTATE`, the same constant `setRole` uses)
is the identical discipline: match the code, never the message.

**`STABLE`/`IMMUTABLE` breaks this function differently than it breaks `0004`'s trigger.**
ADR-013 already records that a `STABLE` trigger function silently restores write skew. PostgREST
additionally runs a `STABLE`/`IMMUTABLE` function inside a **read-only transaction**, so a
one-word slip here fails loudly instead (`25006`) — a different symptom for the same mistake
(design note §2.6).

**`previewDeactivation` and the cascade's `bookings` write both cross a module boundary
`app-architecture.md` §2 grants in writing, not merely tolerates.** *"`users` owns the
deactivation cascade, not `bookings`. BR-001.18 makes cancelling the leaver's desks part of
deactivating the account — one act, one transaction, refusable as a whole."* The **read**
additionally has ADR-004's own "read across, write within" precedent
(`desks.repository.ts`'s `countUpcomingConfirmedForDesk`); the cascade's **write** to `bookings`
is the exception this architecture decision names by id, and `modules/bookings/README.md` records
the other side of it.

**One residual this migration does not close.** A booking `INSERT`ed in the milliseconds around
the cascade's own `UPDATE` of `user_profiles` can survive its owner's deactivation — an `UPDATE`'s
predicate does not lock rows that do not yet exist, and a booking insert never touches
`user_profiles`, so advisory key `1001011` never sees it. The result is BR-001.18's own harm, one
stranded desk, recoverable only by an administrator cancelling it through US-015. Named here and
in the migration's own closing comment rather than fixed — closing it needs a `bookings`-side rule
BRD-001 does not state (design note §4.3, open item 2).

**AC-08 (cancellation email) and AC-09 (push alert) are not built here.** They were removed from
`US-025-deactivate-an-account.md` and moved to US-029/US-032, which already specify the identical
behaviour and cite this story by id (`decisions.md` D-01,
[`jjoyjoshua/new-aidlc-employee-exchange#59`](https://github.com/jjoyjoshua/new-aidlc-employee-exchange/issues/59)).
`deactivateAccount`'s repository-level `CancelledBookingRow[]` (id, desk id, desk number, booking
date, `cancellation_source`) exists so those stories can compose their copy from the same call
without a second query — the service reduces it to a plain count at its own boundary, and a future
caller wiring notifications must widen that boundary explicitly rather than find a dead field.

**`already_inactive` is a fourth outcome, not folded into `not_found`.** A target already inactive
when the cascade runs (a race, or a stale row-menu list) is reported by the repository as its own
kind — `not_found`'s approved 404 copy would be false about an account that plainly exists. The
**service** collapses it to `ok` with `cancelledCount: 0`, logged (design note §2.2, §3.2, D-05).

## `activateAccount` (US-026/AC-01–AC-08 — the exact inverse of `deactivateAccount`, and much simpler)

**No new migration.** `0004_last_active_admin_guard.sql`'s own closing comment forecast this:
reactivation's `WHEN` clause requires `old.is_active`, which is false by definition on every
`activateAccount` call, so the trigger function is never entered — not merely unlikely to fire, but
structurally unreachable from this write. Architect design note:
`inception/specs/US-026-reactivate-an-account/design-note.md` §2.

**A plain single-row `UPDATE`, not an RPC — deliberately unlike `deactivateAccount`.** This write
has one statement and no cross-table effect, so it follows `setRole`'s shape exactly: `is_active`
and `updated_at` only, `.maybeSingle()`, no `blocked` outcome (there is nothing for the trigger to
refuse) and no `already_active` outcome (a plain `UPDATE` cannot see the pre-write state, and
unlike the cascade, a repeat activation has no side effect to double-fire — design note §3).

**`deactivated_at` is never touched.** `0001_user_profiles.sql`'s own comment scopes that column to
"when REQ-020 last ran" — an audit stamp of the most recent deactivation, not a live state flag.
Nulling it on reactivation would erase that history for no requirement that asks for it
(`decisions.md` D-01, design note §4).

**No `requireActingAdmin`.** Nothing this write does needs attribution — the same position
`POST /users/:id/role` already takes, for the identical reason: no column exists to attribute to
(`decisions.md` D-03, design note §5).

## `push_opt_in` — the one column this module does NOT write (US-031)

**`user_profiles.push_opt_in` is written by `modules/notifications`, not by this module** — an
ADR-004 exception granted in writing at Gate 1, not a violation a reviewer should flag.
`app-architecture.md:89` names *opt-in* in the `notifications` row's Owns column, and the
alternative — a port from this module that `notifications` calls — is banned outright by
`eslint.config.mjs`'s `MAY_IMPORT.notifications = []` (`modules/notifications` may import
nothing). US-031 design note §4.6 has the full reasoning; the same shape US-025's cascade write
to `bookings` already takes from the other side.

**This module still owns every other column of `user_profiles`**, `push_opt_in` included in the
sense that no *other* module may touch it — the exception is narrow and singular, not a crack in
ADR-004's boundary. `users.repository.ts:80`'s own docblock reserves the column by name; this
section is that reservation stated from the other side.

## The forward constraint

US-027 (admin password reset) adds a route here, not to `bookings` or `desks`. It is an UPDATE
crossing the same Auth/profile seam US-023 settled, and applies `ADR-012` by name rather than
re-deriving its ordering and compensation shape; a future story whose write *creates* a row (none
currently forecast) would instead apply `ADR-011`, unchanged. The row-menu items US-020 renders
disabled become live one at a time as each story lands — **Edit landed first (US-023), the role
item second (US-024), the deactivate branch of the fourth item third (US-025), its activate branch
fourth (US-026)** — only Reset password remains
(design note §6, `ADR-010-unbuilt-destination-controls.md`).

See `../README.md` for the module boundary this file must respect (`users` may import
`notifications`; nothing else).
