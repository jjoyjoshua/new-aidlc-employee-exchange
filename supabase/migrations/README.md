# Migrations

Schema history for the five tables in
[`inception/architecture/db-design.md`](../../inception/architecture/db-design.md).

Once migrations exist they are the truth and the design document is the explanation.

| File                 | Table(s)              | Landed by |
| -------------------- | ---------------------- | --------- |
| `0001_user_profiles.sql` | `user_profiles`    | US-001    |
| `0002_desks.sql`         | `desks`             | US-006 (reads it; written by US-015/US-017) |
| `0003_bookings.sql`      | `bookings`          | US-006 (reads it; first written by US-007) |

`0002` and `0003` shipped together, whole — every constraint and both of `bookings`'s partial
unique indexes — although US-006 only reads. A table created without its constraints is a
different table (`inception/specs/US-006-see-desk-availability/design-note.md` §1.1).

Dev/test fixtures for `desks` do **not** live here. See `supabase/seed/desks.dev.sql` — deliberately
outside `migrations/` so it never runs against any environment automatically.

**Protected path: any change here is Complex** (`ai/standards/task-surfaces.md`), and a
migration that is not additive is escalated to the human rather than decided by a persona.

Two things the schema does that the application deliberately does not:

- **RLS is deny-all.** The database refuses everything by default; the server's service-role
  key is the only thing that gets past it (ADR-001). Do not add a permissive policy to make
  something work — that quietly moves a rule out of the server and into Postgres, where no
  test is looking.
- **Two partial unique indexes arbitrate booking.** One desk per day, one booking per
  employee per day. The insert is attempted without a preceding availability check and the
  index decides, because the database is the only thing that sees both concurrent requests
  (`app-architecture.md` §4.1, BR-001.1, V-04).
