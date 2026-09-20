# users

## Ownership (ADR-004 — read across, write within)

**Owns (may write):** `user_profiles`. US-020 was this module's **first slice, and it was
read-only** — `GET /api/admin/users`. `../README.md`'s ownership row already reserved this
module's future scope in writing, before US-020 existed: "Account CRUD, role,
activate/deactivate **and its cascade**, admin password reset, search." US-021 (create) and
US-023 (edit, this section) fill in "CRUD" so far; US-024 (role change), US-025/US-026
(deactivate/activate **and its cascade**), and US-027 (admin password reset) still add their own
write routes to this same module, not to `bookings` or anywhere else. `../README.md`'s own rule is
explicit: *"`users` owns the deactivation cascade, not `bookings`. BR-001.18 makes cancelling the
leaver's desks part of deactivating the account — one act, one transaction, refusable as a
whole."*

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

## The forward constraint

US-024 (role change), US-025/US-026 (Deactivate/Activate and BR-001.18's cascade), and US-027
(admin password reset) each add a route here, not to `bookings` or `desks`. US-025 and US-027 are
each an UPDATE crossing the same Auth/profile seam US-023 just settled, and apply `ADR-012` by
name rather than re-deriving its ordering and compensation shape; a future story whose write
*creates* a row (none currently forecast) would instead apply `ADR-011`, unchanged. The row-menu
items US-020 renders disabled become live one at a time as each of these stories lands — **Edit
is the first, landed by US-023** (design note §6, `ADR-010-unbuilt-destination-controls.md`).

See `../README.md` for the module boundary this file must respect (`users` may import
`notifications`; nothing else).
