# users

## Ownership (ADR-004 — read across, write within)

**Owns (may write):** `user_profiles`. US-020 is this module's **first slice, and it is
read-only** — `GET /api/admin/users`. `../README.md`'s ownership row already reserved this
module's future scope in writing, before this story existed: "Account CRUD, role,
activate/deactivate **and its cascade**, admin password reset, search." US-020 fills in the last
word only. US-023 through US-027 add the write routes — role change, deactivate/activate **and
its cascade**, admin-triggered password reset, and account edit — to this same module, not to
`bookings` or anywhere else. `../README.md`'s own rule is explicit: *"`users` owns the
deactivation cascade, not `bookings`. BR-001.18 makes cancelling the leaver's desks part of
deactivating the account — one act, one transaction, refusable as a whole."*

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
standing answer for every story that faces this — US-023 (an email edit touches both), US-025
(deactivation's cascade), and US-027 (an admin password reset) all apply it by name rather than
re-deriving it.

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

## The forward constraint

US-023 (Edit), US-024 (role change), US-025/US-026 (Deactivate/Activate and BR-001.18's
cascade), and US-027 (admin password reset) each add a route here, not to `bookings` or `desks`,
and each is a second application of `ADR-011`'s cross-system write rule. The row-menu items
US-020 renders disabled become live one at a time as each of these stories lands (design note §6,
`ADR-010-unbuilt-destination-controls.md`).

See `../README.md` for the module boundary this file must respect (`users` may import
`notifications`; nothing else).
