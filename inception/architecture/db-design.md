# Database design — BRD-001 Employee Desk Booking

> Gate 1 architecture deliverable. Advisory and non-blocking: no story, screen or gate waits on it.
> Approval = the human reviewing + merging this document's PR.

|              |                                                                               |
| ------------ | ----------------------------------------------------------------------------- |
| **Author**   | Architect persona (AI draft) with Joy Joshua                                  |
| **Sources**  | `inception/product/requirements/BRD-001-employee-desk-booking.md` (approved)  |
| **Platform** | Supabase (PostgreSQL 15+) — see [`app-architecture.md`](./app-architecture.md) |
| **Decides**  | RISK-004 (double-booking), BR-001.5 note (Completed stored or derived)         |

**This is a design, not a second copy of the code.** Once migrations exist they are the
source of truth and this becomes history. It is written now so the team builds against one
shared shape.

## 0. Platform assumptions

The data lives in Supabase Postgres. Two consequences run through everything below:

- **`auth.users` is Supabase's, not ours.** It holds the email, the password hash and the
  refresh tokens. We never write to it with SQL — only through the Supabase admin API from
  the server. Our own tables live in `public` and point at it.
- **Row Level Security is defence in depth, not the rule book.** Every request goes through
  Express ([ADR-001](../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md)),
  which holds the service-role key. RLS is still enabled on every table with deny-all
  policies, so a leaked anon key reads nothing. The business rules are in Express.

---

## 1. Entities

### 1.1 `user_profiles`

Everything the product knows about a person that Supabase Auth does not. One row per
account, created in the same operation as the `auth.users` row it extends.

| Column                 | Type          | Null | Default | Why it exists                        |
| ---------------------- | ------------- | ---- | ------- | ------------------------------------ |
| `id`                   | `uuid`        | no   | —       | PK, and FK to `auth.users.id`        |
| `email`                | `citext`      | no   | —       | REQ-032 search; BR-001.10 uniqueness |
| `full_name`            | `text`        | no   | —       | REQ-018, REQ-019, REQ-032            |
| `role`                 | `user_role`   | no   | —       | REQ-004, REQ-022                     |
| `is_active`            | `boolean`     | no   | `true`  | REQ-005, REQ-020, US-026             |
| `must_change_password` | `boolean`     | no   | `true`  | REQ-029, BR-001.17                   |
| `push_opt_in`          | `boolean`     | no   | `false` | REQ-026, BR-001.15, US-031/AC-01     |
| `last_seen_at`         | `timestamptz` | no   | `now()` | NFR-009 / US-003/AC-02, AC-03        |
| `created_at`           | `timestamptz` | no   | `now()` | audit                                |
| `updated_at`           | `timestamptz` | no   | `now()` | audit                                |
| `deactivated_at`       | `timestamptz` | yes  | `null`  | audit — when REQ-020 last ran        |

`user_role` is a Postgres enum: `('employee', 'admin')`. REQ-004 gives exactly one role, so
this is a column, not a join table. Adding a third role later is a migration, which is the
correct amount of friction for a change that would touch every authorization check.

**Why `email` is stored here as well as in `auth.users`.** REQ-032 requires finding an
account by name _or_ email, paged and sorted alongside `full_name`, `role` and `is_active`.
Supabase's admin API lists users but does not join to our columns, so serving that screen
from `auth.users` means fetching every account and filtering in memory. The copy is written
in the same server-side operation that writes `auth.users` (REQ-018, REQ-019), never
separately. `auth.users.email` remains the authority for signing in; this column is a
queryable projection of it. The cost is a sync discipline enforced in one module — see
`app-architecture.md` §2.

**Why `must_change_password` is ours and not Supabase's.** Supabase Auth has no
"credential was set by somebody else" concept. BR-001.17 needs exactly that, plus the
guarantee that the administrator-set password keeps working until the replacement succeeds.
A boolean we own, checked by the session middleware on every request, gives both: the flag
is set to `true` by account creation (REQ-018) and by admin reset (REQ-021), and cleared
only by a successful password change (REQ-029). Nothing about the Supabase credential
changes until that moment, so abandoning the step cannot lock anyone out.

**Why `last_seen_at` is ours too.** NFR-009 and US-003/AC-03 specify 30 days from _last
use_, not from sign-in. Supabase's own inactivity timeout is a project setting on paid
plans; depending on it would make an approved requirement a function of the billing tier.
Because every request already passes through Express, the server stamps this column and
rejects a session whose last use is older than 30 days. Writing it on every request would
be a write per read, so it is throttled: updated only when the stored value is more than an
hour old. The window is 30 days; an hour of imprecision is immaterial.

### 1.2 `desks`

The bookable inventory. 30–100 rows in practice (BR-001.4).

| Column        | Type          | Null | Default | Why it exists               |
| ------------- | ------------- | ---- | ------- | --------------------------- |
| `id`          | `uuid`        | no   | —       | PK                          |
| `desk_number` | `text`        | no   | —       | REQ-007, REQ-015, BR-001.4  |
| `is_active`   | `boolean`     | no   | `true`  | REQ-017, BR-001.7           |
| `created_at`  | `timestamptz` | no   | `now()` | audit                       |
| `updated_at`  | `timestamptz` | no   | `now()` | REQ-016 — when last renamed |

`desk_number` is stored in its normalized form only: trimmed and upper-cased before the
write, so `a-01 ` never reaches the table (BR-001.8). A `CHECK` enforces the stored shape
(§3), which means a normalization bug surfaces as a rejected write rather than as a desk
nobody can book.

The zone an employee sees on SCR-003 is the first character of `desk_number`. It is **not**
a column: BR-001.4 makes the letter part of the identifier, so a separate `zone` column
would be a second place for the same fact to disagree with itself.

### 1.3 `bookings`

The reservation. The only table with meaningful concurrency.

| Column                | Type                  | Null | Default     | Why it exists              |
| --------------------- | --------------------- | ---- | ----------- | -------------------------- |
| `id`                  | `uuid`                | no   | —           | PK                         |
| `user_id`             | `uuid`                | no   | —           | FK → `user_profiles.id`    |
| `desk_id`             | `uuid`                | no   | —           | FK → `desks.id`            |
| `booking_date`        | `date`                | no   | —           | REQ-006, REQ-008, NFR-001  |
| `status`              | `booking_status`      | no   | `confirmed` | BR-001.5                   |
| `created_at`          | `timestamptz`         | no   | `now()`     | REQ-023, audit             |
| `cancelled_at`        | `timestamptz`         | yes  | `null`      | REQ-010, REQ-014           |
| `cancelled_by`        | `uuid`                | yes  | `null`      | FK → `user_profiles.id`    |
| `cancellation_source` | `cancellation_source` | yes  | `null`      | BR-001.20, US-032/AC-03–04 |

`booking_status` is the enum `('confirmed', 'cancelled')` — **two values, not three.**
`cancellation_source` is `('owner', 'admin', 'deactivation_cascade')`.

**`booking_date` is a `date`, never a timestamp.** NFR-001 makes every date boundary office
local. A `timestamptz` would store an instant and re-derive the calendar day from whatever
timezone the reader happens to use, which is exactly the bug NFR-001 exists to prevent. A
`date` has no timezone to get wrong. The office's own "today" is computed once, on the
server, from the configured office timezone (`Asia/Kolkata`, NFR-001) and compared against this
column as a date.

**Why `cancellation_source` and `cancelled_by` are both here.** BR-001.20 requires the push
notification **and, since 2026-09-14, the cancellation email** to name the office admin when
somebody other than the owner cancelled. The composer needs to know _that_ it was somebody
else (`cancellation_source`), and the audit trail needs to know _who_ (`cancelled_by`).
`cancelled_by` alone is not enough: comparing it to `user_id` cannot distinguish the
deactivation cascade from an ordinary admin cancel — both are performed by an admin against
somebody else's booking — and the two produce different wording in BR-001.20's own examples.

That distinction now carries more weight than when it was written. US-029 splits the email
into three cases by exactly these three enum values: `owner` names no actor (AC-05), `admin`
names the role (AC-04), and `deactivation_cascade` names the role **and** omits the
invitation to rebook (AC-06). A composer keyed on `cancelled_by <> user_id` would collapse
the last two and send a deactivated user an invitation to book a desk they can no longer
reach. **Key the email composer on `cancellation_source`, never on a comparison of ids.**

**Completed is derived, never stored.** BR-001.5's note leaves this to architecture; the
decision is to derive it:

```sql
CASE
  WHEN status = 'confirmed' AND booking_date < <office today> THEN 'completed'
  ELSE status::text
END
```

exposed as a view, `bookings_with_status`, that every read goes through. The reasons:

- A stored third value needs a nightly job to move rows into it, and a booking sitting in
  the wrong status between midnight and the job's run is a visible defect (REQ-028 says the
  transition happens when the date has passed, not when a job notices).
- That job would be the only writer that changes status without a user acting, so every
  concurrency and idempotency question around it is pure cost.
- Derivation cannot drift. A stored value can.

The cost is that filtering by **Completed** (REQ-013, REQ-028) is a predicate on
`booking_date` and `status` rather than an equality test. That is one index (§5), and it is
cheaper than a job.

### 1.4 `push_subscriptions`

One row per browser the employee opted in from. A person with a laptop and a phone has two.

| Column            | Type          | Null | Default | Why it exists           |
| ----------------- | ------------- | ---- | ------- | ----------------------- |
| `id`              | `uuid`        | no   | —       | PK                      |
| `user_id`         | `uuid`        | no   | —       | FK → `user_profiles.id` |
| `endpoint`        | `text`        | no   | —       | the Web Push URL        |
| `p256dh`          | `text`        | no   | —       | Web Push encryption key |
| `auth`            | `text`        | no   | —       | Web Push auth secret    |
| `user_agent`      | `text`        | yes  | `null`  | operator diagnosis only |
| `created_at`      | `timestamptz` | no   | `now()` | audit                   |
| `last_success_at` | `timestamptz` | yes  | `null`  | operator diagnosis only |

**The opt-in flag is on `user_profiles`, not here.** US-031/AC-04 makes the setting belong
to the account, and US-032/AC-05 requires no push when the flag is off _whatever the browser
state_. Treating "has a subscription row" as the opt-in would conflate a revoked browser
permission with a deliberate opt-out, and would lose the setting the moment the last device
unsubscribed. Both are checked before sending: flag first, then subscriptions.

Rows here are the only ones in the schema that are **hard-deleted** — when the push service
answers `404` or `410` the subscription is gone and keeping it is noise.

### 1.5 `notification_deliveries`

Every attempt to notify somebody, and how it went. NFR-005 and US-034/AC-05 require failed
sends to be found; the reminder run (REQ-025) additionally needs to know what it already
sent.

| Column         | Type                   | Null | Default | Why it exists             |
| -------------- | ---------------------- | ---- | ------- | ------------------------- |
| `id`           | `uuid`                 | no   | —       | PK                        |
| `booking_id`   | `uuid`                 | yes  | `null`  | FK → `bookings.id`        |
| `user_id`      | `uuid`                 | no   | —       | FK → `user_profiles.id`   |
| `channel`      | `notification_channel` | no   | —       | NFR-005, NFR-006          |
| `kind`         | `notification_kind`    | no   | —       | REQ-023, REQ-024, REQ-025 |
| `recipient`    | `text`                 | no   | —       | the address/endpoint used |
| `outcome`      | `delivery_outcome`     | no   | —       | NFR-005                   |
| `error_detail` | `text`                 | yes  | `null`  | US-034/AC-05              |
| `provider_ref` | `text`                 | yes  | `null`  | provider message id       |
| `attempted_at` | `timestamptz`          | no   | `now()` | US-034/AC-05              |

Enums: `notification_channel` is `('email', 'push')`; `notification_kind` is
`('confirmation', 'cancellation', 'reminder')`; `delivery_outcome` is `('sent', 'failed')`.

**This table does two jobs, deliberately.** It is the failure log NFR-005 asks for, and it
is what makes the reminder run safe to trigger twice — a partial unique index on
`(booking_id, kind)` for sent reminders (§3) means a second run inserts nothing and sends
nothing. Splitting it into a log and a separate idempotency table would give two records of
the same event that can disagree.

**It holds no message body and no password.** RISK-005 keeps admin-set passwords out of
persistent logs, and `recipient` plus `kind` is enough to answer "did Dana get told?".

---

## 2. Relationships

Stated so a non-engineer can check them:

- A **user profile** extends exactly one **Supabase auth user**, and every auth user has
  exactly one profile. They are created and deleted together; the profile's id _is_ the
  auth user's id, so they cannot drift apart.
- A **user** holds many **bookings**, over time. A **booking** belongs to exactly one user.
- A **desk** carries many **bookings**, over time. A **booking** is for exactly one desk.
- On any one working day, a **desk** has at most one _confirmed_ booking, and a **user**
  holds at most one _confirmed_ booking. Both are enforced by the database, not by the
  application (§3).
- A **booking** may record the **user** who cancelled it. That is a second, optional link
  from booking to user, separate from the owner.
- A **user** may have several **push subscriptions** — one per browser they turned alerts on
  in — or none.
- A **booking** has many **notification delivery** records: a confirmation, possibly a
  reminder, possibly a cancellation, on one or two channels each. A delivery record belongs
  to one user and, except where a future notification is not about a booking, to one booking.

---

## 3. Keys and constraints

Every constraint below names the business rule behind it. A constraint with no rule is a
guess, and there are none here.

### Primary keys

All five tables use a `uuid` primary key generated by the database. `user_profiles.id` is
additionally a foreign key to `auth.users.id` with `ON DELETE CASCADE` — Supabase owns that
row's life, and a profile for a deleted auth user would be an account nobody can sign into
and nobody can see.

### Uniqueness

| Constraint                                                                                              | Rule it enforces                                                             |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `user_profiles.email` unique (`citext`, so case-insensitive)                                            | BR-001.10, V-10 — email is the sign-in identifier                            |
| `desks.desk_number` unique                                                                              | BR-001.4, BR-001.8, V-08 — desks must be unambiguous                         |
| `push_subscriptions.endpoint` unique                                                                    | one row per browser; re-subscribing updates rather than duplicates           |
| `bookings` partial unique on `(desk_id, booking_date) WHERE status = 'confirmed'`                       | **V-04, RISK-004** — two people cannot hold the same desk on the same day    |
| `bookings` partial unique on `(user_id, booking_date) WHERE status = 'confirmed'`                       | **BR-001.1, V-05** — one desk per employee per day                           |
| `notification_deliveries` partial unique on `(booking_id, kind) WHERE kind = 'reminder' AND outcome = 'sent'` | REQ-025 — exactly one reminder per booking, however often the run is triggered |

**The two booking indexes are the answer to RISK-004.** The risk register hands
double-booking to architecture, and the honest answer is that an application check cannot
solve it: two requests that both read "A-01 is free" and then both insert will both succeed,
whatever the code in between looks like. A partial unique index makes the second insert fail
at the database, and Express turns that failure into the `409` the screen already specifies.
The indexes are _partial_ because a cancelled booking must not keep the desk reserved —
`WHERE status = 'confirmed'` means cancelling frees the slot immediately, which is precisely
BR-001.2's cancel-then-book.

### Check constraints

| Constraint                                                       | Rule it enforces                                                        |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `desks.desk_number ~ '^[A-Z]-[0-9]{2}$'`                         | BR-001.4, V-16 — exactly one upper-case letter, hyphen, two digits      |
| `EXTRACT(ISODOW FROM bookings.booking_date) BETWEEN 1 AND 5`     | BR-001.3, V-03 — no weekend bookings, ever, by any path                 |
| `(bookings.status = 'cancelled') = (cancelled_at IS NOT NULL)`   | a cancelled booking always records when; a confirmed one never does     |
| `bookings.status = 'cancelled'` implies `cancellation_source IS NOT NULL` | BR-001.20 — the push composer can always tell who cancelled    |

The weekend check is deliberately at the database and not only in validation. BR-001.3 has
no exceptions in this release, and the admin paths, the seed data and any future import all
write through it.

### Foreign keys and delete behaviour

`bookings.user_id`, `bookings.desk_id`, `bookings.cancelled_by` and
`notification_deliveries.*` are all `ON DELETE RESTRICT`. Nothing in this product deletes a
user or a desk (§4), so a delete that would orphan history is a bug, and RESTRICT surfaces
it as one. `push_subscriptions.user_id` is `ON DELETE CASCADE`: a subscription without an
account is unreachable noise.

### The one rule that needs a trigger

**BR-001.11 — never zero active admins.** This cannot be an index or a check, because it is
a condition over the whole table rather than over one row. Express enforces it before
acting, but two admins deactivating each other in the same instant would both read "two
active admins" and both proceed. The likelihood is tiny and the consequence is a locked-out
organization, so the rule is additionally a constraint trigger on `user_profiles`, fired
after any change to `role` or `is_active`, which raises if no active admin remains. Express
catches that and returns the refusal SCR-008 already specifies.

This is the only trigger in the design. Every other rule is either a single-row constraint
or genuinely belongs in the service layer.

---

## 4. Lifecycle

**Nothing in this schema is ever deleted except push subscriptions.**

| Entity                    | Created                                                        | Changed                                                                                                                                                        | Ends                                                                                                                       |
| ------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `user_profiles`           | Admin creates an account (REQ-018), or the first-admin seed    | Name, email, role (REQ-019, REQ-022); `is_active` both ways (REQ-020, US-026); `must_change_password` set by reset, cleared by change (REQ-021, REQ-029)        | Deactivated, never deleted — REQ-020 and US-026 make it reversible, and past bookings must keep an owner                   |
| `desks`                   | Admin adds one (REQ-015)                                       | Number (REQ-016, BR-001.19); `is_active` both ways (REQ-017)                                                                                                   | Deactivated, never deleted — BR-001.7 retires it from booking while keeping its history                                    |
| `bookings`                | Employee books (REQ-008)                                       | Status to `cancelled` once, with actor and source (REQ-010, REQ-014, BR-001.18)                                                                                | Never deleted. **Completed** is a derived reading of an unchanged row, not an end state                                    |
| `push_subscriptions`      | Employee opts in from a browser (REQ-026)                      | `last_success_at`                                                                                                                                              | **Hard-deleted** on opt-out, or when the push service reports the endpoint gone                                            |
| `notification_deliveries` | Every send attempt (REQ-023–025, REQ-027)                      | Never                                                                                                                                                          | Never deleted by the application. Roughly two rows per booking; a retention policy is an operations call — open question 4 |

**What deactivation means, precisely, and why it differs between users and desks.**
BR-001.18 and BR-001.9 are deliberately opposite shapes, and the schema has to serve both:

- Deactivating a **user** flips `is_active` and, in the same transaction, sets every
  confirmed booking of theirs dated today or later to `cancelled` with
  `cancellation_source = 'deactivation_cascade'`. It is never blocked.
- Deactivating a **desk** flips `is_active` and nothing else — and is refused outright if
  any confirmed booking dated today or later exists on it. The schema deliberately provides
  no cascade here; the count SCR-006 shows before the attempt is a query, not a column.

**Reactivation restores the account, never the bookings.** US-026/AC-03 keeps the role, and
AC-04 leaves the cancelled bookings cancelled, which the schema gets for free: `role`
survives deactivation untouched, and a `cancelled` row is terminal. US-026/AC-05 leaves
`must_change_password` alone, which also falls out of touching only `is_active`.

---

## 5. Indexes beyond the constraints

| Index                                     | Serves                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `bookings (user_id, booking_date DESC)`   | REQ-009 employee list, its 30-day window and _load older_; REQ-034 most-recent desk        |
| `bookings (booking_date DESC, status)`    | REQ-011 admin list paged by 50, REQ-012 and REQ-013 filters                                |
| `bookings (desk_id, booking_date)`        | REQ-007 availability for a date, REQ-031 desk filter, BR-001.9 the blocking count          |
| `user_profiles (is_active, role)`         | BR-001.11's count, and the people list's default ordering                                  |

REQ-032's search on name or email is left as a case-insensitive `LIKE` over `full_name` and
`email` with no special index. At one office — hundreds of accounts, not millions — that is
a sequential scan of a small table, and adding a trigram index before there is a measurable
problem is exactly the speculative generality this design avoids. It is called out here so
that the decision was made rather than overlooked.

---

## 6. Open questions

These are **not** for the Architect to answer. Each needs the BA, the PO or IT.

| #   | Question                                                                                                                                                                                                                                                                                                                                      | Owner    | Blocks                              | Status |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------- | ------ |
| 1   | **What is the office's timezone?** NFR-001 makes every date boundary, and BR-001.14's 08:00 reminder, office-local — but no requirement names the zone. It is a configuration value with no value, and an unset one silently becomes UTC, which BR-001.14 explicitly calls a failure. Needs an IANA zone (e.g. `Asia/Kolkata`) before the first booking is stored. **See the note below — detecting it from the browser was proposed and does not serve REQ-025.** | PO / IT  | REQ-006, REQ-028, BR-001.14, US-030 | **Resolved 2026-09-14** — **`Asia/Kolkata`**, now named in NFR-001 (BRD-001 open question 15, PR 23). Fixed UTC+05:30, no DST |
| 2   | **Does the cancellation email name the actor, as the push does?** This was BRD-001 open question #14. It decides nothing in the schema — `cancellation_source` is already stored — but it decides the email template, and it reaches everyone rather than only push opt-ins.                                                          | PO / BA  | US-029, US-030                      | **Resolved 2026-09-14** — **yes**, BR-001.20 now covers both channels and names the role, never the individual (BRD-001 open question 14, PR 23). No schema change: `cancellation_source` already carries all three cases |
| 3   | **Is a deactivated user's live session ended immediately?** REQ-005 stops a deactivated user _signing in_. NFR-009 gives a 30-day session. This design rejects every request from an inactive account at the middleware, so the effect is immediate — but the requirements never state it, and the opposite reading is defensible from the text alone. Confirm so it can be tested. | PO / BA  | REQ-005, REQ-020, US-025            | **Open** |
| 4   | **How long is notification history kept?** NFR-005 requires failures be logged for operational follow-up; nothing says for how long. Not urgent — growth is small — but nobody has been asked.                                                                                                                                                 | IT / DevOps | NFR-005                          | **Open** |

Questions 1 and 2 were answered on 2026-09-14 and are recorded in BRD-001 (open questions 15
and 14 respectively). Questions 3 and 4 remain open and can be resolved during delivery;
neither blocks a booking being written.

**What question 1's answer settles beyond the value.** `Asia/Kolkata` is a fixed UTC+05:30
with no daylight saving, so 08:00 office local is permanently 02:30 UTC. The reminder job
(`app-architecture.md` §4.3) therefore needs no zone-aware scheduler, which removes a
constraint that would otherwise have narrowed the deferred hosting choice. The offset is a
**half-hour** one: any code or configuration assuming whole-hour offsets will be thirty
minutes wrong, which is avoided by using the IANA name throughout as §5.4 already requires.

**What question 2's answer does not change.** The email now names the actor, and the
deactivation cascade takes different copy from an ordinary admin cancel (US-029/AC-06). Both
were already representable: `cancellation_source` is `('owner', 'admin', 'deactivation_cascade')`,
and those three values map one-to-one onto US-029/AC-05, AC-04 and AC-06. The note below on
why `cancelled_by` alone is insufficient is what makes this work — it was written for the
push channel and now carries the email too. **No migration, no new column.**

### Note on question 1 — why the timezone cannot come from the browser

Detecting the timezone from the user's device was proposed (Joy Joshua, 2026-09-14) and is
recorded here because it is a reasonable instinct that does not survive contact with two
approved requirements. **Resolved 2026-09-14 in favour of a single configured value**
(`Asia/Kolkata`); the reasoning is kept because it is the reason the setting is configured
rather than detected, and anyone proposing detection again will arrive at this same question.

- **REQ-025 has no user.** The day-before reminder runs on a schedule at 08:00 with nobody
  signed in and no browser open. There is no device to read a timezone from, so a
  device-derived zone cannot serve a Must requirement at all.
- **The product is for hybrid workers, who book from home.** §1 of BRD-001 describes people
  reserving a desk *before coming in*. The device's location is therefore frequently not the
  office. If "today" came from the device, an employee booking from another timezone would
  get a different 30-day window (REQ-006), a different set of weekdays (BR-001.3 — a
  Saturday in one zone is a Friday in another, and the `ISODOW` check in §3 would be testing
  a different day from the one they saw), and a different answer to whether a booking is
  still cancellable (BR-001.6). Two employees would disagree about what today is, for the
  same office.
- **NFR-002 is one office.** The timezone is a property of that office, not of whoever is
  looking at it.

The shape that does work, and which is now the decided one: the office
timezone is a single configured value, and browser detection is used — if wanted — only as
a convenience to *pre-fill* that setting during setup, for an admin to confirm. Displaying a
booking's time in the viewer's own local time is a separate, harmless presentation choice
that changes no date boundary.
