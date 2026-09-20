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

## The forward constraint

This module's writes do not exist yet. US-023 (Edit), US-024 (role change), US-025/US-026
(Deactivate/Activate and BR-001.18's cascade), and US-027 (admin password reset) each add a
route here, not to `bookings` or `desks`. The four-item row menu US-020 renders is disabled at
every item for exactly this reason (design note §6, `ADR-010-unbuilt-destination-controls.md`):
none of those destinations exist in this module yet.

See `../README.md` for the module boundary this file must respect (`users` may import
`notifications`; nothing else).
