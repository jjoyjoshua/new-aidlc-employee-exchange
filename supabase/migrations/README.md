# Migrations

Schema history for the five tables in
[`inception/architecture/db-design.md`](../../inception/architecture/db-design.md).

Once migrations exist they are the truth and the design document is the explanation. Nothing
here yet — the first story that needs a table writes the first migration.

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
