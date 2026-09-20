# US-024 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-024 — Change a person's role](../../stories/user-stories/US-024-change-a-persons-role.md) |
| **Screen**   | SCR-008 **ST-08, ST-09, ST-12 – ST-15** (row-menu route) · SCR-009 **ST-05** (edit-form route). **Not frame-verified** — see open item 5 |
| **Tier**     | Complex — **persistence** (the schema's first and only trigger), **contract** (a new write route), **trust** (a new admin-only write surface, plus a client-side session mutation). Any one carries it (§0) |
| **Author**   | Architect persona (AI draft), 2026-09-20 |
| **Rests on** | ADR-001, ADR-002, ADR-004, ADR-009, ADR-010, ADR-012, and the US-018 / US-019 / US-020 / US-021 / US-023 design notes — **one new ADR, `ADR-013`** (§7) |

**Advisory.** The human's GitHub review is the authority. `spec.md`, `impact-analysis.md`,
`implementation-plan.md`, `decisions.md` and `traceability.md` stay DEV's.

**Written after Gate D1**, per `ai/gates/delivery.md`'s own ordering, because the plan deferred
exactly one thing to this note: *"Step 2's exact trigger SQL and error-signal shape"*. §8 therefore
amends an approved plan rather than constraining an unwritten one — and it amends more of it than
the plan anticipated.

**The verdict, in one line each:**

- **The trigger the architecture describes does not hold under concurrency, and the plan's own
  verification step would have caught it only after the code was written.** *"Raise if no active
  admin remains"*, evaluated inside the writing transaction, is the textbook **write-skew** anomaly:
  two demotions of two *different* rows take no conflicting row locks, each sees the other's admin
  still active, and both commit. `db-design.md` §3's *"two admins deactivating each other in the same
  instant"* is precisely the case its own proposed shape does **not** close (§2.1). **blocker.**
- **`DEFERRABLE` does not fix it either, and that is the most likely wrong answer to reach for.**
  Deferring to commit time shortens the window; it does not close it, because the check still runs
  before the checking transaction's own commit is visible to the other (§2.2).
- **The fix is one line: a transaction-scoped advisory lock, taken as the trigger function's first
  statement.** `pg_advisory_xact_lock` — the `_xact_` variant specifically, because Supabase's pooler
  runs in transaction mode and a session-scoped lock would outlive the request (§2.3). This is the
  whole subject of **ADR-013**.
- **A plain `AFTER` trigger, not a `CONSTRAINT TRIGGER`.** Once the lock does the serialising,
  deferral buys exactly one thing — a single transaction that demotes before it promotes — and no
  code path in this system issues two role writes in one transaction, because PostgREST gives each
  request its own. The ordering constraint it would relax is *"promote somebody first"*, which is the
  product's own approved remedy (AC-05). I am superseding the word "constraint" in `db-design.md` §3
  deliberately, not by accident (§2.2).
- **The `WHEN` clause is where AC-07 and AC-12 stop being code and become structure.** Fire only on
  `old.is_active and old.role = 'admin' and not (new.is_active and new.role = 'admin')`. A
  *deactivated* admin's row can never satisfy `old.is_active`, so it can never trip the guard
  (AC-12), and it is never counted by the `exists` either (AC-07). Promotions and reactivations never
  take the lock at all, because neither can reduce the count (§2.4).
- **The error signal is a project-minted SQLSTATE, `Z0011`, matched on `error.code` alone — and the
  asymmetry with `updateProfileDetails` is the point.** That method needs two matches because `23505`
  is raised by *every* unique index in the schema, so the index name disambiguates. `Z0011` is raised
  by exactly one `raise` statement in the whole schema. A second match on the message would make the
  refusal depend on prose a future migration could reword (§3.1, §3.2).
- **The plan's Step 2 verification is factually wrong, and the correction is good news.** It states
  *"No automated integration test exists in this repo against a real Postgres instance (confirmed: no
  `*.spec.ts` opens a live database connection)"*. Two do:
  `apps/api/src/modules/bookings/bookings.repository.concurrency.spec.ts` and
  `apps/api/src/modules/admin/admin.concurrency.spec.ts`, gated on
  `RUN_BOOKINGS_CONCURRENCY_TEST=1`, the second of which already has `user_profiles` fixtures. The
  concurrency edge case and the SQLSTATE assumption both become **automated gated tests**, not pasted
  manual output (§3.5). **major.**
- **`markUpdated` cannot serve AC-11, and its own docblock says so.** `use-users.ts:126` spreads
  `summary` through **unchanged**, on purpose, because US-023 moved no counts. US-024 moves two. Step
  7's *"calls `markUpdated`"* would ship a role change whose admin count never moves — and
  `apps/ui/src/lib/use-users.ts` is **absent from `impact-analysis.md`'s Files table** entirely (§4.1).
  **major.**
- **The summary line's `admins` is not BR-001.11's count, and nothing on the screen is.**
  `users.service.ts:98` counts every admin row, active or not; BR-001.11 counts active ones only. The
  refusal is therefore unpredictable from anything the browser holds — which is the strongest
  available argument **for** D-03, and an argument against any future "disable the menu item"
  optimisation (§4.3).
- **D-01 and D-02 are both correctly in `decisions.md`; neither is an ADR.** But **D-01 has a hole**:
  it settles what happens when the role change is *blocked* and says nothing about the role change
  *succeeding* while the following `PATCH` fails — a partial save for which SCR-009's approved copy
  says the opposite of the truth (§6.1). **major.**
- **Step 1 is already done.** `last_active_admin` (`error.ts:81`), `roleChangeRequestSchema`
  (`users.ts:128`), `userIdParamsSchema` (`:118`) and tests for all of them
  (`error.spec.ts:112`, `users.spec.ts:224-243`) landed in this same story's working tree before
  this note was written. Step 1 is a verification step with an empty diff (§6.2).
- **AC-04 already has a test citing it that does not prove it** — `error.spec.ts:112` asserts an enum
  member. `ai/gates/delivery.md`'s *"a citation alone is not proof"* row applies; say in the PR which
  test is AC-04's real proof (§6.2).

---

## 0. The tiering — confirmed

| Surface | What it is here |
| --- | --- |
| **Persistence** | `supabase/migrations/**` is a protected path and **every migration is Complex by convention** (`ai/standards/task-surfaces.md:28`, `:41`). This one adds the **only trigger in the entire design** (`db-design.md` §3), and `0002_desks.sql:21-22` already points forward to it by name |
| **Contract** | A **new write route**, `POST /api/admin/users/:id/role` — `task-surfaces.md:41`'s *"a new write operation"*, Complex outright |
| **Trust** | A new admin-only write surface, and — separately — the browser's own session `role` becomes locally mutable for the first time (§4.4) |

**Not a contract-package change**, despite what Step 1 says. Everything `libs/contracts` needs is
already there (§6.2). A story crossing the Contract surface with a **zero-line diff in
`libs/contracts/`** is worth one sentence in the PR.

**Not a new guard.** `requireAdmin` mounts once at `/api/admin` (`http/app.ts`), and
`require-admin.ts`'s own docblock records that role is read **fresh from `user_profiles` on every
request**, never from a JWT claim. AC-13's production diff is empty; its test is not (§4.4 has the
security consequence this fact carries for D-02).

**Not `requireActingAdmin`.** That middleware exists for *attribution* — `bookings.cancelled_by`.
`user_profiles` has no actor column for a role change, and this story adds none. `deactivated_at`
exists but is REQ-020's, i.e. US-025's.

**Not an index change.** `user_profiles_is_active_role_idx` (`0001_user_profiles.sql:52`) already
exists and its own comment names this rule: *"BR-001.11's 'is there still an active admin' count"*.
It is what serves §2's `exists`.

---

## 1. What this story actually is

**One `UPDATE`, one whole-table invariant, and no transaction in the application layer to enforce it
with.** Everything hard about US-024 is in the second and third clauses, and §2 is all of it.

| AC | Where it is answered |
| --- | --- |
| **AC-01** either direction | §3.2 (`setRole`), §3.4 (`updated_at`) |
| **AC-02** confirmation names what is gained or lost | Browser copy only; **not frame-verified** (open item 5) |
| **AC-03** the new role takes effect | Inherited — `require-admin.ts` re-reads `role` per request. Plus §4.4 for the acting admin's own tab |
| **AC-04** the only active admin is refused | **§2** at the rule, **§3.1/§3.2** on the wire, §4.2 on screen |
| **AC-05** the refusal routes to the fix | Browser only |
| **AC-06** no override | Structural: `setRole` takes no force flag and the route parses `roleChangeRequestSchema` (`.strict()`, `role` only). §5 makes any bypass a review finding |
| **AC-07** active admins only | **§2.4** — structural, in the `exists` predicate *and* the `WHEN` clause. No service code |
| **AC-08** one rule, two doors | §3.2 — both doors call the same `setRole`. §6.1 is the one place they legitimately differ |
| **AC-09** nothing shown as changed until it has | Browser only (`inFlight` ref, `use-admin-cancel-dialog.ts`'s shape) |
| **AC-10** a failure says nothing changed | §3.2's `throw` on any unrecognised error, and **§6.1's hole** |
| **AC-11** row and admin count both update | **§4.1** — the finding `markUpdated` will silently swallow |
| **AC-12** a deactivated person's role still changes | **§2.4** — structural, same `WHEN` clause as AC-07 |
| **AC-13** admin only | Inherited (§0), proven at the real mount |
| **Edge case** — concurrent demotions | **§2.1 – §2.3**, proven by **§3.5**'s gated test |

---

## 2. The trigger

### 2.1 Row locks do not protect a whole-table invariant — this is write skew

`db-design.md` §3 states the rule and the risk correctly:

> *"two admins deactivating each other in the same instant would both read 'two active admins' and
> both proceed… the rule is additionally a constraint trigger on `user_profiles`, fired after any
> change to `role` or `is_active`, which raises if no active admin remains."*

The first half is right. **The second half does not close the case the first half names**, and the
reason is worth writing out because it is counter-intuitive:

| | T1 — demote admin A | T2 — demote admin B |
| --- | --- | --- |
| 1 | `UPDATE … WHERE id = A` → row lock on **A** | |
| 2 | | `UPDATE … WHERE id = B` → row lock on **B** |
| 3 | trigger: `exists (active admin)?` → sees its own A = employee, **B still admin** → **pass** | |
| 4 | | trigger: sees its own B = employee, **A still admin** → **pass** |
| 5 | `COMMIT` | `COMMIT` |

**Zero active admins.** Nothing blocked at step 2, because the two statements lock **different
rows** and therefore never conflict. Each transaction's check reads a predicate the other is
concurrently invalidating, and neither can see the other's uncommitted write. This is the classic
**write-skew** anomaly — whose canonical textbook statement is, almost word for word, *"at least one
doctor must remain on call"*.

Read Committed permits it. So does Repeatable Read: PostgreSQL's snapshot isolation detects
write-write conflicts on the **same row**, and this is a conflict on a **predicate**. Only
`SERIALIZABLE` detects it, and PostgREST gives us no per-request isolation control (§ADR-013
alternatives).

**Moving the check into the application would be strictly worse**, and `db-design.md` already
rejected it for the same reason. The trigger is the right place. It just needs one more line.

### 2.2 `CONSTRAINT TRIGGER … DEFERRABLE` is not the fix — and a plain trigger is what we want

Deferring the check to commit time moves rows 3 and 4 of the table above to just before row 5. The
window narrows from milliseconds to microseconds. **It does not close**, because a deferred check
still runs before its own transaction commits, and therefore still cannot see the other's write. A
narrower race is still a race, and this one locks an organisation out of its own administration.

Once §2.3's lock does the serialising, ask what deferral still buys. Exactly one thing: a **single
transaction** that demotes the last admin and promotes a replacement, in that order, would succeed
where a non-deferred trigger raises on the first statement.

- **No code path in this system issues two role writes in one transaction.** Every repository call is
  its own PostgREST round trip, each its own implicit transaction — the property US-019 §6 recorded
  and nothing has changed since.
- **US-025's cascade does not need it either.** `app-architecture.md` §4.2 puts the `is_active` flip
  and the booking cancellations in one transaction, but the booking writes do not touch
  `user_profiles`, so the guard fires once and sees a settled picture (§4 below).
- **The constraint it imposes is the product's own remedy.** With a plain trigger the rule is
  *"promote before you demote"* — which is literally what AC-05's primary action tells the
  administrator to do.

**Recommendation: a plain `AFTER UPDATE … FOR EACH ROW` trigger.** It fails on the statement that
caused it, which is easier to attribute than an error arriving from `COMMIT`; it needs no
`DEFERRABLE` semantics a reader must then reason about; and it does not invite the false belief that
deferral is what makes the rule safe.

**This supersedes the word "constraint" in `db-design.md` §3 and in `error.ts:79`'s comment.** Per
`ai/roles/architect.md`, the Inception architecture is *"a starting shape, not a standing
contract"* — once this migration lands, **it** is the DB design for this rule. Fix `error.ts:79`'s
comment in this PR (§6.2, F7); `db-design.md` is history and may be left, but say so in the PR rather
than leaving a reviewer to wonder.

### 2.3 The serialisation — one line, and why `_xact_`

```sql
perform pg_advisory_xact_lock(1001011);
```

Taken as the **first** statement of the trigger function, before the `exists`. Its effect on the
§2.1 table: T2 blocks at step 4 until T1 commits, then takes a fresh snapshot, sees A **committed**
as an employee and its own B as an employee, and raises. **Exactly one demotion survives**, which is
what the edge case requires.

Four things about that line, each a decision:

- **`pg_advisory_xact_lock`, never `pg_advisory_lock`.** The `_xact_` variant releases at
  transaction end, automatically, including on rollback. The session variant would survive the
  request and leak across Supabase's **transaction-mode** connection pooler, where a pooled backend
  serves the next request — an unreleased lock would deadlock the application permanently. This is
  not a stylistic preference.
- **It serialises only the dangerous direction.** §2.4's `WHEN` clause means the trigger — and
  therefore the lock — fires only on writes that *remove* an active admin. Promotions, reactivations,
  and every `updateProfileDetails` name/email write take no lock at all. At `db-design.md`'s stated
  bound of *"hundreds of accounts, not millions"*, the contended path is a handful of writes a year.
- **Deadlock exposure, named rather than waved at.** The lock is acquired *after* the statement's own
  row lock, so a transaction updating **two** rows could hold row A and wait for the advisory lock
  while another holds it and waits for row A. No path in this codebase updates two `user_profiles`
  rows in one statement, and PostgREST's `.eq('id', …)` cannot. If one is ever added, it must take
  the advisory lock **before** its `UPDATE`. Put that sentence in the migration.
- **The key is this project's first advisory lock**, so the migration declares it as a registry:
  `1001011`, read as BR-**001**.**11**. Any future advisory lock picks a different number and adds a
  line to that comment.

### 2.4 The `WHEN` clause — where AC-07 and AC-12 become structural

```sql
when (
  old.is_active and old.role = 'admin'
  and not (new.is_active and new.role = 'admin')
)
```

Read it as: *fire only when this row **was** an active admin and no longer is.* Every AC in the
neighbourhood falls out of it, and **none of them needs service-layer code**:

| Case | `WHEN` | Result |
| --- | --- | --- |
| Demote the only active admin (**AC-04**) | fires | `exists` finds none → refused |
| Demote an active admin, another deactivated admin exists (**AC-07**) | fires | the deactivated row fails `is_active` in the `exists` → refused |
| Demote/deactivate a **deactivated** admin (**AC-12**) | does not fire — `old.is_active` is false | permitted, as it must be: a row that was not counted cannot reduce the count |
| Change a deactivated person's role either way (**AC-12**) | does not fire | permitted |
| **Promote** anyone | does not fire — `old.role` is not `admin` | permitted, and takes no lock |
| **Reactivate** an admin (US-025/US-026) | does not fire — `old.is_active` is false | permitted; can only increase the count |
| Self-demotion with another active admin (edge case) | fires | passes. BR-001.11 guards the count, never the identity — the trigger has no notion of "who is acting" and must not acquire one |
| `updateProfileDetails` (US-023) | not even considered — `UPDATE OF role, is_active` excludes it | untouched |

**Keep both the column list and the `WHEN`.** `UPDATE OF role, is_active` means the trigger is not
considered at all when neither column appears in the `SET` list — that is what keeps US-023's write
path byte-for-byte unaffected. `UPDATE OF` fires on a column being *assigned*, even to its current
value; the `WHEN` clause is what narrows assignment to actual transition.

**AC-07 is the half of BR-001.11 a naive implementation fails, and the plan's Step 4 is right that no
service code should attempt it.** *"No in-app admin count — the trigger is the sole arbiter"* is the
correct instruction and should be kept verbatim. Endorsed.

### 2.5 What the trigger deliberately does not cover

- **No `INSERT` trigger.** An insert can only add rows; it cannot reduce the count.
- **No `DELETE` trigger, and this leaves one honest residual.** `user_profiles.id references
  auth.users (id) on delete cascade` (`0001_user_profiles.sql:28`), so deleting the last active
  admin's Auth user would silently empty the admin population. **No product path deletes an
  account** — `db-design.md` §4 is categorical, and ADR-012 item 3 makes `auth.admin.deleteUser`
  a data-loss bug on any live account. The one caller in this repository is the gated concurrency
  suite's own fixture cleanup, which creates employees. Adding a `DELETE` branch would buy a guard
  against a path that does not exist and would make that test cleanup conditionally fail. **Named
  here so the absence reads as a decision** — open item 4 if the human disagrees.
- **No maximum-admin rule.** BRD-001 states none; `spec.md` already scopes it out.

### 2.6 The snapshot dependency — do not mark the function `STABLE`

The fix works because the trigger function is **`VOLATILE`** (PL/pgSQL's default): under Read
Committed, each SQL command inside a volatile function takes a **fresh snapshot**, so the `exists`
issued *after* the advisory lock is released sees the other transaction's committed write. A
`STABLE` or `IMMUTABLE` marking would pin the calling statement's snapshot and silently reintroduce
§2.1's anomaly **with the lock still in place and apparently working**.

That is a one-word change with no test that would catch it. It belongs in the migration comment, and
it does.

### 2.7 RLS — it fails closed, which is the right direction

`user_profiles` has `force row level security` and **no policies** (`0001_user_profiles.sql:56-59`).
The function runs `SECURITY INVOKER` (the default), so its `exists` executes as whoever is writing.
Per ADR-001 that is always the service role, which has `BYPASSRLS` — `FORCE` does not override the
role attribute.

**`SECURITY DEFINER` is deliberately not used.** It buys nothing under ADR-001 and costs a
`search_path` hardening obligation. If a future path ever writes this table as a role *without*
`BYPASSRLS`, the guard sees an empty table and refuses **every** demotion — noisy, wrong, and
**safe**. Fail-closed is the correct direction for this rule; say so in the migration so the failure
is diagnosable.

---

## 3. The error signal and the repository match

### 3.1 A project-minted SQLSTATE — `Z0011`

```sql
raise exception 'BR-001.11: this change would leave the office with no active administrator'
  using errcode = 'Z0011';
```

**Why a custom `ERRCODE` rather than the default and a message match.** The default `raise
exception` produces `P0001` (`raise_exception`) — the SQLSTATE of **every** unstructured `raise` any
future migration or function adds. Matching on it would force the repository to disambiguate on
prose, and prose is the one part of this migration a later author will edit without thinking.

**Why `Z0011` specifically.** The SQL standard reserves SQLSTATE classes beginning `0`–`4` and
`A`–`H`; classes beginning `5`–`9` and `I`–`Z` are implementation-defined. PostgreSQL's own
implementation-defined classes are `53`, `54`, `55`, `57`, `58`, `72`, `F0`, `HV`, `P0`, `XX`.
**`Z0` is used by neither PostgreSQL nor PostgREST** (which reserves the `PT` prefix for HTTP-status
override and mints its own `PGRST…` codes). The trailing `0011` is a deliberate echo of BR-001.11.

**Why the HTTP status PostgREST picks is irrelevant.** Nothing in this application reads it.
supabase-js hands the repository a `PostgrestError` whose `code` is the SQLSTATE and whose `message`
is the raised text, and the route composes its own `422` from the repository's `blocked` outcome.
Do **not** reach for a `PT422` code to steer PostgREST — it would couple the migration to a transport
detail no code consults.

**The one assumption, and it is proven rather than asserted.** That a custom SQLSTATE survives
PostgREST and supabase-js into `error.code` **is not verifiable from this environment**. It is
exactly the class of assumption `bookings.repository.concurrency.spec.ts`'s own docblock was written
about — *"a fake told 'no error' proves nothing"* — and §3.5's gated test asserts the **raw** error
object, so a wrong assumption fails with a clear cause instead of a mis-mapped refusal.

### 3.2 `usersRepository.setRole` — the mirror of `updateProfileDetails`, and where it differs

```ts
/**
 * The SQLSTATE `user_profiles_require_active_admin()` raises (migration
 * `0004_last_active_admin_guard.sql`). A PROJECT-MINTED code in the implementation-defined class
 * `Z0`, raised by exactly ONE statement in the whole schema — which is why the match below needs
 * no second discriminator, unlike `updateProfileDetails`'s `23505` (design note §3.1).
 *
 * Deliberately NOT in `libs/contracts`: this is a database detail, not a wire contract. The wire
 * contract is `ERROR_CODES.last_active_admin`, which the ROUTE composes from `blocked`.
 */
const LAST_ACTIVE_ADMIN_SQLSTATE = 'Z0011';

export interface SetRoleInput { id: string; role: UserRole; updatedAt: Date }

export type SetRoleOutcome =
  | { kind: 'ok'; profile: ProfileDetailsRow }
  /** US-024/AC-04, AC-07 (BR-001.11, V-11). The DATABASE refused it, inside the writing
   *  transaction, under §2.3's serialisation. Never an in-app count. */
  | { kind: 'blocked' }
  | { kind: 'not_found' };

/**
 * US-024/AC-01, AC-04, AC-07, AC-12. Names `role` and `updated_at` and NOTHING else — never
 * `is_active`, never `deactivated_at` (US-025's), never `must_change_password`. The input type
 * has no index signature, so anything else is unrepresentable, the discipline
 * `UpdateProfileDetailsInput` already states.
 *
 * `.maybeSingle()`, never `.single()`: `.single()` turns zero rows into a thrown Postgres error
 * and loses the 404 (`updateDeskNumber`'s own stated reason, inherited through
 * `updateProfileDetails`).
 *
 * No `23505` branch, and its ABSENCE is deliberate: this write does not touch `email`, so
 * `user_profiles_email_key` cannot fire. Copying `updateProfileDetails`'s duplicate branch would
 * add an outcome a reader would then have to disprove (`setDeskActive`'s precedent).
 */
setRole(input: SetRoleInput): Promise<SetRoleOutcome>;
```

```ts
async setRole({ id, role, updatedAt }) {
  const { data, error } = await supabase()
    .from('user_profiles')
    .update({ role, updated_at: updatedAt.toISOString() })
    .eq('id', id)
    .select('id, full_name, email, role, is_active')
    .maybeSingle();

  if (!error) return data ? { kind: 'ok', profile: data as ProfileDetailsRow } : { kind: 'not_found' };
  if (error.code === LAST_ACTIVE_ADMIN_SQLSTATE) return { kind: 'blocked' };
  throw new Error(`role change failed: ${error.message}`);
}
```

**The shape is `updateProfileDetails`'s, three lines for three branches, in the same order.** The one
structural difference is the question DEV asked, and it is worth stating in the PR:
`updateProfileDetails` needs `code === '23505'` **and** `message.includes('user_profiles_email_key')`
because `23505` is raised by every unique index in the schema and only the index name says which
rule spoke. `Z0011` is raised by one `raise` statement. **One match, and adding a message match
would make the refusal weaker, not stronger** — it would re-couple a business outcome to prose.

The third line is AC-10's server half: **anything unrecognised throws**, becomes a bare `500`, and
the browser folds it into "nothing changed". A `blocked` that is not BR-001.11 is unreachable by
construction.

### 3.3 The unit-test fakes — four cases, and one of them is a negative

`users.repository.spec.ts`'s existing fake already records `update` and `maybeSingle` and already
takes `{ code?: string; message: string }`. No fake change is needed — `.eq()` and `.select()` are
recorded too. Four tests:

| Fake response | Expected | Proves |
| --- | --- | --- |
| `{ data: row, error: null }` | `{ kind: 'ok', profile: row }`; recorded `update` is **exactly** `{ role, updated_at }` | AC-01, and that nothing else is written |
| `{ data: null, error: null }` | `{ kind: 'not_found' }` | the 404 branch survives `.maybeSingle()` |
| `{ data: null, error: { code: 'Z0011', message: 'BR-001.11: …' } }` | `{ kind: 'blocked' }` | **AC-04, AC-07** — the mapping's logic |
| `{ data: null, error: { code: 'P0001', message: 'BR-001.11: this change would leave the office with no active administrator' } }` | **throws** | the negative that matters: we match the **code**, not the prose. Delete the code check and this test is the one that fails |

The fourth is the test a reviewer should be able to break on purpose. Without it, a later
"defensive" message match would pass everything.

### 3.4 `updated_at` — set it, unlike US-019, like US-023

`0001_user_profiles.sql:41` creates `updated_at` with **no trigger** and **no narrowing comment**.
That is the opposite of `desks.updated_at`, whose comment scopes it in writing to *"when the desk was
last renamed"* — which is why US-019 §5.3 refused to set it and why a developer who has read that
note might refuse here too. **Do not.** `db-design.md` §4's lifecycle row for `user_profiles` groups
*"Name, email, role (REQ-019, REQ-022)"* as one "Changed" bucket, and US-023 is already its first
writer.

**Thread `nowMs()` through the service, exactly as US-023 did** — `UsersServiceDeps` already carries
it (`users.service.ts:22-25`), so this is zero wiring and no `composition.ts` change. The repository
reads no clock. `implementation-plan.md` Steps 3 and 4 both write `setRole(id, role)` and
`changeRole(id, role)` with no `updatedAt`; amend both (§8 C6).

### 3.5 The proof that has to be real Postgres — and it can be automated

`implementation-plan.md` Step 2's Verify says:

> *"No automated integration test exists in this repo against a real Postgres instance (confirmed: no
> `*.spec.ts` opens a live database connection) — this is manual evidence, pasted into the PR."*

**That is wrong.** Two files exist, both gated on `RUN_BOOKINGS_CONCURRENCY_TEST=1`:

- `apps/api/src/modules/bookings/bookings.repository.concurrency.spec.ts` — the convention's origin,
  and its docblock states this story's exact problem: *"it cannot prove the assumption that logic
  depends on: that a real unique-violation error surfaced through supabase-js actually carries
  SQLSTATE `23505`"*.
- `apps/api/src/modules/admin/admin.concurrency.spec.ts` — which already imports `usersRepository`
  and already has `createAccountWithProfile` / `cleanUp` fixtures that create and delete real
  `user_profiles` rows.

**Add a US-024 `describe.runIf(RUN)` block to `admin.concurrency.spec.ts`.** It belongs there for the
reason that file's own docblock gives: it will need `usersRepository` and real Auth fixtures
together, and `modules/admin` is where this repository composes across modules.

Five cases:

| # | Case | Asserts |
| --- | --- | --- |
| 1 | demote the only active admin | `{ kind: 'blocked' }`, **and the raw rejected error's `code` is `Z0011`** — the §3.1 assumption, asserted directly, per `bookings.repository.concurrency.spec.ts`'s stated discipline |
| 2 | two admins, one deactivated; demote the active one (**AC-07**) | `blocked` |
| 3 | two active admins; `Promise.all` of two demotions (**edge case**) | **exactly one `ok` and one `blocked`**, then a direct read asserting the table holds exactly **one** active admin. This is the test §2.1 exists for, and it **fails** against a trigger without §2.3's lock |
| 4 | two active admins; demote one (**negative control**) | `ok` — proves the guard does not over-block |
| 5 | a deactivated admin, another active admin; demote the deactivated one (**AC-12**) | `ok` |

**The fixture problem, named because it will otherwise waste an afternoon.** The `exists` is over the
**whole table**, so these tests must control the entire admin population — and a disposable Supabase
project already has a seeded first admin. The block must: create its own admin fixtures **first**,
then demote every pre-existing active admin (legal, because a fixture admin is active by then), run
the assertions, and restore them in `finally`. Demoting the pre-existing admin before creating a
fixture one would be refused by the very rule under test.

**Case 3 is the whole design's proof, and the thing most likely to be dropped for being awkward.**
Note it in the PR as such.

---

## 4. The browser seam

### 4.1 `markUpdated` cannot serve AC-11 — **major**

`use-users.ts:126`:

```ts
// `summary` is spread through UNCHANGED — no count moves for a name/email correction.
```

and its docblock (`:20-22`) states the same thing as a deliberate difference from `markAdded`,
written by US-023's own design note. **US-024 moves two counts.** `implementation-plan.md` Step 7's
*"calls `markUpdated` + a toast on success"* would ship a role change whose summary line never
changes — failing AC-11 and the assertion US-020/AC-06 exists to make meaningful, while every
existing test stays green.

**Add `markRoleChanged(account: AdminUser)`** beside it, with the summary delta spelled out:

```ts
const summary = {
  ...current.summary,
  // total and deactivated are UNCHANGED: the population did not change and neither did
  // anyone's active state. Only the role bucket moves, and it moves both ways at once.
  employees: current.summary.employees + (account.role === 'employee' ? 1 : -1),
  admins:    current.summary.admins    + (account.role === 'admin'    ? 1 : -1),
};
```

Three properties to assert, each a bug if got wrong by copying a neighbour:

- **`total` and `deactivated` do not move** — copying `markAdded`'s `total + 1` inflates the
  population on every promotion.
- **The delta applies to a deactivated account too.** `users.service.ts:98` counts **every** admin
  row regardless of `is_active`, so AC-12's role change on a deactivated person **does** move
  `admins`/`employees`. A `if (account.isActive)` guard here would be wrong and plausible.
- **`employees + admins === total` stays true**, the invariant `markAdded`'s docblock names and the
  service's own tests assert server-side.

Re-sorting is unnecessary — `byFullName` order cannot change — but harmless; reusing
`markUpdated`'s body plus the summary delta is fine, as long as the docblock says why this one does
what that one refuses to.

**`apps/ui/src/lib/use-users.ts` is missing from `impact-analysis.md`'s Files table.** Add it (§8 C7).
Note the path: `apps/ui/src/lib/`, not `screens/people/`.

### 4.2 The refusal, and why the browser must not predict it

The row menu's role item stays **live** for every account, including the only active admin.
`AccountRowMenu.tsx`'s item stops being `aria-disabled` per ADR-010 — this is that control's
destination arriving — and it does **not** acquire a new disabled state for the last admin. Three
reasons:

1. **AC-06.** The refusal is a refusal, and a disabled control is a warning that the administrator
   cannot interrogate.
2. **§4.3** — the browser cannot compute the predicate anyway.
3. **ADR-010's own rule**: a control ships disabled until its destination exists. It exists now.

`RoleChangeDialog` stays **one mounted `Dialog`** switching body and footer on `outcome`, for
US-019 §8.2's reason, unchanged: `Dialog.tsx` refocuses its opener on unmount, so swapping components
between ST-08 and ST-09 bounces focus out to the row and back. `DeskDeactivateDialog.tsx` is the
shape; the plan already says so and is right.

### 4.3 The summary line's `admins` is **not** BR-001.11's count

`users.service.ts:98`: `if (row.role === 'admin') admins += 1;` — unconditional on `is_active`.
BR-001.11 counts `is_active and role = 'admin'`.

So an office showing **2 admins** may have **one** active admin, and the demotion of the other will
be refused by a rule the screen gives no way to anticipate. This is:

- **The strongest argument for D-03**, and a better one than the one `decisions.md` gives. D-03 says
  the browser already knows everything ST-09's sentence needs. It knows the *name*; it does not know
  the *fact*. What makes D-03 right is that the **server's refusal itself is the assertion** — the
  `last_active_admin` code is the fact, and the name is only interpolation. **Endorsed, with that
  correction to the rationale.**
- **An argument against any future optimisation** that disables the menu item or pre-warns from the
  summary line. A note in `apps/api/src/modules/users/README.md` — Step 10 already touches it.

### 4.4 D-02 is safe, and the reason is worth writing down

`require-admin.ts`'s own docblock records that the caller's role is read **fresh from
`user_profiles` on every request**, never from a JWT claim. So a client-side patch of
`useAuth().user.role` can change **what the browser renders** and can never change **what the server
permits**. That single fact is what keeps D-02 a UI decision rather than a trust decision, and it is
why it is correctly in `decisions.md` and not in an ADR (§6.1).

Two constraints on the implementation, both cheap:

- **The patch only ever narrows.** Self-promotion is unreachable — the acting caller is already an
  admin, so the only self-change is a demotion. `impact-analysis.md` already claims this property;
  make it a test rather than a claim.
- **Assert the redirect, not the state.** The plan's Step 9 Verify already says this
  (*"a test asserting `RequireRole` redirects immediately after a self-demotion, no reload"*) and
  it is the right assertion.

---

## 5. What this story must NOT build

- **No second trigger, ever.** US-025 depends on this one (§ next section).
- **No application-side admin count** on any path — not as a pre-check, not as a "friendlier"
  message, not to disable a control. The trigger is the sole arbiter, `implementation-plan.md` Step 4
  says so, and a diff adding one is a review finding.
- **No force/override parameter** anywhere: not on `roleChangeRequestSchema`, not on `setRole`, not
  as a query string. AC-06.
- **No `details` payload on the `422`** (D-03).
- **No change to `http/app.ts` or `http/middleware/**`.** AC-13 is inherited; a diff there is a
  review finding.
- **No `deactivated_at`, `is_active` or `must_change_password` write.** US-025/US-027's.
- **No `DELETE`/`INSERT` branch on the trigger** (§2.5).
- **No `SECURITY DEFINER`** (§2.7).
- **No `data-refresh.ts` change** — this screen is not on it and does not join it, as US-019 through
  US-023 each recorded.
- **No session revocation, and no push to a *different* administrator's open tab.** `spec.md`'s Out
  of scope is right: that tab's next round trip is refused by `requireAdmin` regardless.

---

## 6. Advisory review of the rest of the package

### 6.1 `decisions.md` — D-01, D-02, D-03

**D-02 — correctly a decision, not an ADR.** §4.4 is why: because the server re-reads role per
request, the client-side patch cannot widen any permission, so it is a rendering choice inside one
screen plus one context method. An ADR is for *"a choice that changes the shape of the system"*, and
this one is invisible outside the browser. **No ADR. No change to D-02** beyond citing §4.4's
security argument in its rationale, which makes it much stronger than "latency".

**D-01 — correctly a decision, not an ADR, but it has a hole. major.**

Role-first is right, and for the reason given. But D-01 answers *"what if the role change is
blocked?"* and is silent on *"what if the role change **succeeds** and the `PATCH` then fails?"* —
which leaves the account with a **new role and an uncorrected name**, while SCR-009 ST-08's approved
copy says *"Nothing has changed."* That sentence is now false, and AC-10/FR-08 require it to be true.

This is structurally the same problem ADR-012 was written for — first write commits, second write
fails, no transaction — one level up, between two endpoints instead of two systems. **It does not
need a new ADR**; it needs D-01 to state its residual and the plan to choose one of:

1. **State the partial success in copy.** Needs a sentence SCR-009 does not have → a Gate 1
   `change-request`, not a delivery decision. **This is the honest route** and the one US-023 §4.3
   took for an analogous gap.
2. **Compensate**, ADR-012-style: revert the role on a `PATCH` failure. Cheap to write, and the
   revert itself can be refused by BR-001.11 (promote-then-revert on an account that became the last
   admin in between), so it needs its own failure branch. Disproportionate.
3. **Do not submit both from one action.** The form's role radios route to the same
   `RoleChangeDialog` as the row menu — one door, one request, AC-08 satisfied more literally than
   before. Contradicts SCR-009 ST-05's in-form refusal, so also a Gate 1 question.

**Recommendation: (1), routed to the human.** Whatever is chosen, D-01's Rationale must name the
residual — open item 2.

**D-03 — endorsed, with a better rationale** (§4.3). `decisions.md` should say the refusal *code* is
the assertion and the name is interpolation, rather than "the caller already knows".

### 6.2 `spec.md` and `implementation-plan.md` — findings

| # | Rating | Finding |
| --- | --- | --- |
| **F1** | **blocker** | **FR-02** and **Step 2** both describe a trigger that *"evaluat[es] at the moment of the write under concurrency"*. That is the naive shape and it does not hold (§2.1). FR-02 must name the serialisation; Step 2's Files cell must name the advisory lock and the `WHEN` clause |
| **F2** | **major** | **Step 2's Verify is factually wrong** about integration tests (§3.5). Replace pasted manual output with a gated `admin.concurrency.spec.ts` block — five cases, case 3 being the one that would fail against the naive trigger |
| **F3** | **major** | **Step 7's `markUpdated`** cannot move the admin count; `markRoleChanged` is needed and `apps/ui/src/lib/use-users.ts` is missing from `impact-analysis.md` (§4.1) |
| **F4** | **major** | **D-01's partial-success hole** (§6.1) |
| **F5** | **minor** | **Step 1 is already landed** in this story's own working tree. `error.ts:81`, `users.ts:118`, `users.ts:128`, `error.spec.ts:112-115`, `users.spec.ts:224-243` all exist. Step 1 becomes *"verify, do not re-add"*, with an empty diff. A duplicate `roleChangeRequestSchema` would be a review finding |
| **F6** | **minor** | **`updated_at` is not in Steps 3 or 4.** `setRole(id, role)` → `setRole({ id, role, updatedAt })`; `changeRole` threads `nowMs()` (§3.4) |
| **F7** | **minor** | **`error.ts:79`'s comment says "constraint trigger"**, which §2.2 supersedes. One-word fix in this PR. `db-design.md` §3 is Inception history and may stand — say which in the PR |
| **F8** | **minor** | **AC-04 already has a test citing it that does not prove it** (`error.spec.ts:112` asserts an enum member). `ai/gates/delivery.md`'s *"a citation alone is not proof"* row applies. Name AC-04's real proofs — the gated DB test and the route test — explicitly in the PR's AC→evidence table, and tell QA |
| **F9** | **nit** | `apps/api/src/modules/users/README.md` (Step 10) should carry §4.3's distinction, §2.3's lock, §2.5's residual and §3.1's SQLSTATE — it is where the next author will look before US-025 |
| **F10** | **nit** | Step 5 should state that **`requireActingAdmin` is not used**, so its absence reads as a decision (§0) |

**Everything else in Steps 1–11 is sound.** In particular: Step 4's *"no in-app admin count — the
trigger is the sole arbiter"* is the single best sentence in the plan; the verb sub-resource in
`spec.md`'s Technical constraints is what `api-standards.md` requires, by its own worked example;
`422`, not `409`, is right (`app-architecture.md` §5.3 — *"the rule says no"*); and the Rollback
section's note that US-025 must not land before this trigger exists is exactly right.

---

## 7. One new ADR — `ADR-013`

**Warranted.** Not for the endpoint (ordinary), not for the error code (a mapping), and not for the
migration (an executable contract, which the charter says should carry ordinary decisions without
ceremony). For **§2.3**: how this system enforces an invariant that is a predicate over a whole table
when it has no transaction boundary of its own and no per-request isolation control.

Three tests, all met:

1. **A real trade-off with real rejected alternatives**, at least four of them viable enough to have
   been chosen by a competent author (`SERIALIZABLE`, `SELECT … FOR UPDATE`, `LOCK TABLE`, deferral,
   and doing nothing).
2. **It contradicts an accepted design document.** `db-design.md` §3 names a shape that does not hold.
   The charter forbids contradicting a design silently.
3. **It is inherited, not local.** US-025 and US-026 write `is_active` through this identical guard,
   and `app-architecture.md` §4.2 names BR-001.11's trigger inside their transaction. Without the
   ADR, each would re-derive §2.1 from scratch or, more likely, not notice it.

Written as `knowledge/decisions/ADR-013-whole-table-invariants-under-concurrency.md`, alongside this
note.

---

## 8. Constraints the implementation must satisfy

| # | Constraint | Severity |
| --- | --- | --- |
| C1 | The trigger function takes `pg_advisory_xact_lock` as its **first** statement, before the `exists` (§2.3) | **blocker** |
| C2 | A plain `AFTER UPDATE OF role, is_active … FOR EACH ROW`, **not** a `CONSTRAINT TRIGGER`, with §2.4's `WHEN` clause verbatim (§2.2, §2.4) | **blocker** |
| C3 | The function is **not** marked `STABLE`/`IMMUTABLE` and **not** `SECURITY DEFINER` (§2.6, §2.7) | **blocker** |
| C4 | `setRole` matches `error.code === 'Z0011'` **only** — no message match — and throws on everything else (§3.2) | **blocker** |
| C5 | The gated concurrency block lands with case 3 (two simultaneous demotions) and case 1's **raw-error** assertion. Step 2's "manual evidence" claim is removed (§3.5) | **blocker** |
| C6 | `setRole` writes `updated_at` from one `nowMs()` reading threaded through the service; Steps 3 and 4 amended (§3.4) | **major** |
| C7 | `markRoleChanged` moves `employees`/`admins` and leaves `total`/`deactivated` alone, including for a **deactivated** account; `use-users.ts` added to `impact-analysis.md` (§4.1) | **major** |
| C8 | D-01 states the role-succeeded-details-failed residual and the plan chooses one of §6.1's three routes (§6.1) | **major** |
| C9 | No application-side admin count on any path; no force/override parameter anywhere (§5) | **major** |
| C10 | Step 1 becomes verification-only; no duplicate schema or enum member is added (§6.2 F5) | **minor** |
| C11 | `error.ts:79`'s "constraint trigger" corrected; the PR states whether `db-design.md` §3 is left as history (§6.2 F7) | **minor** |
| C12 | AC-04's real proof is named in the PR's AC→evidence table, not `error.spec.ts:112` (§6.2 F8) | **minor** |
| C13 | `users/README.md` records §2.3, §2.5, §3.1 and §4.3 before US-025 starts (§6.2 F9) | **minor** |
| C14 | D-03's rationale corrected to "the refusal code is the assertion" (§4.3, §6.1) | **nit** |
| C15 | Step 5 states that `requireActingAdmin` is deliberately not used (§0) | **nit** |

---

## 9. Open items for the human

| # | Item | Owner |
| --- | --- | --- |
| 1 | **§2.2.** Superseding `db-design.md` §3's "constraint trigger" with a plain trigger plus an advisory lock, recorded in ADR-013. Confirm `db-design.md` is left as Inception history rather than amended | Joy Joshua |
| 2 | **§6.1.** D-01's partial-success hole. Recommendation: route the missing SCR-009 copy to Gate 1 as a `change-request` rather than invent a sentence | Joy Joshua / BA |
| 3 | **§3.1.** That a custom SQLSTATE survives PostgREST into `error.code` is **not verifiable from this environment**. §3.5 case 1 proves it against a real project — until it runs, `blocked` has a unit-test proof and no integration one | DEV |
| 4 | **§2.5.** The trigger does not cover `DELETE`, so a cascade from `auth.users` could empty the admin population. No product path does it and ADR-012 item 3 forbids the one call that would. Confirm the residual is accepted | Joy Joshua |
| 5 | **Header.** SCR-008 ST-08/ST-09 and SCR-009 ST-05 were not read off the Figma frames by this note's author (the connector was unauthorized in that session) — DEV separately confirmed the frames against the written spec earlier in this story's own session and found no discrepancy | resolved — see `change-log.md` |
| 6 | **§3.5.** The gated suite must control the whole admin population, which means temporarily demoting the project's seeded admin within the test, restored in `finally`. Confirm the disposable-project rule in `bookings.repository.concurrency.spec.ts`'s docblock is understood to cover that | DEV |
