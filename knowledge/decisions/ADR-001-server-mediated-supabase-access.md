# ADR-001 — All database access goes through Express; the browser never queries Supabase

|             |                                                                    |
| ----------- | ------------------------------------------------------------------ |
| **Status**  | proposed                                                           |
| **Date**    | 2026-09-14                                                         |
| **Decider** | Joy Joshua (drafted by Architect persona)                          |
| **Serves**  | BR-001.1, BR-001.9, BR-001.11, BR-001.18, BR-001.20, NFR-005, V-04, V-07, V-17, RISK-004, RISK-011 |

## Context

The stack is React in the browser, Express on the server, and Supabase for both
authentication and the database (decided by Joy Joshua, 2026-09-14).

Supabase is usable two ways, and they are genuinely different architectures rather than
styles. It can be a backend-as-a-service the browser queries directly, with Row Level
Security policies deciding who may read and write what; or it can be an ordinary Postgres
database that only a trusted server touches. The client libraries make the first path the
path of least resistance, and a great many Supabase projects take it.

BRD-001 approves 36 functional requirements, 20 business rules and 18 validations. Several
of those rules are not statements about a single row:

- **BR-001.11** forbids the last active admin being deactivated or demoted — a condition
  over the whole `user_profiles` table, evaluated before a write to one row of it.
- **BR-001.18** makes deactivating a user cancel every upcoming booking they hold *and* send
  a cancellation email for each, as one act that cannot half-happen.
- **BR-001.9** refuses a desk deactivation while confirmed bookings exist on it, and
  requires the count be reported.
- **BR-001.20** makes a notification's wording depend on who performed the cancellation.
- **REQ-023 / REQ-024 / NFR-005** require email on booking and cancellation, with every
  failed send logged.

Two further constraints bear on the choice. RISK-004 flags concurrent double-booking as a
high-impact risk and assigns it to architecture. And the Supabase service-role key bypasses
every RLS policy in the project, so wherever that key lives is, in effect, the security
boundary.

## Decision

**We will route every data access through the Express API.** The browser holds a Supabase
session and sends its access token to Express as a bearer token; Express verifies it, loads
the user's profile, applies the rules, and is the only party that talks to Postgres — using
the service-role key, which never leaves the server.

The browser's Supabase client is constructed with the anon key and used for exactly one
thing: refreshing the access token. It never reads or writes a table.

**Narrowed by [ADR-003](ADR-003-express-mediated-sign-in.md) on 2026-09-17.** This paragraph
used to say "signing in, and refreshing the access token". Credential submission now goes to
`POST /api/auth/sign-in` on Express, because Supabase Auth has no concept of
`user_profiles.is_active` and would issue a real token to a deactivated account — which
US-001/AC-04 forbids. Everything else in this ADR is unchanged.

Row Level Security stays enabled on every table with deny-all policies. It is defence in
depth against a leaked anon key, not the rule book.

## Alternatives considered

| Option                                                                  | Pros                                                                                                                                                  | Cons                                                                                                                                                                                                                                                                                    | Why rejected                                                                                                                                                          |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Browser queries Supabase directly; RLS is the rule book**             | Much less server code. Realtime subscriptions available for free. Fewer network hops. The fastest way to a working screen.                             | BR-001.18's cascade cannot be expressed as a policy at all — a policy permits or denies a write, it does not perform four others and send four emails. BR-001.11 needs a table-wide count inside a trigger. Rules end up split between SQL policies and server code, so "where is this rule?" has no single answer. Every rule is tested through Postgres rather than as a unit. | The rule set is the wrong shape for it. Roughly a third of the business rules span multiple rows or have side effects, and those are exactly the rules that must not be got wrong. |
| **Mixed: browser reads directly, writes go through Express**            | Removes the read round-trip on the two list-heavy screens (SCR-005 all bookings, SCR-003 availability). Keeps the dangerous half of the surface on the server. | Two authorization models that must agree: a read policy in SQL and an equivalent check in Express, for every resource. They drift, and the drift is invisible until someone sees data they should not. REQ-011's paging and REQ-031's filters would exist twice. | The cost is paid on the read side, which is not where the difficulty is. It doubles the authorization surface to save latency nobody has measured as a problem.        |
| **Server-mediated (chosen)**                                            | Every rule in one place, in ordinary TypeScript. Rules testable without a database. One authorization model. RISK-004 answered by a database constraint the server translates. The service-role key lives in exactly one module. | More code: every screen needs an endpoint. No free realtime. The server is on the critical path for reads as well as writes.                                                                                                                                    | —                                                                                                                                                                     |

## Consequences

**Easier**

- The rules have one home. "Where is BR-001.11 enforced?" has one answer, and it is a file a
  reviewer can read.
- Most acceptance criteria become unit tests against pure functions, with the date passed in
  rather than mocked. QA's AC-named tests do not need a database to prove a rule.
- Authorization is one middleware pair — session, then role — rather than a policy per table.
- The mandatory emails (BR-001.13) and the delivery log (NFR-005) sit naturally in the same
  transaction boundary as the work that triggers them.
- The service-role key is confined to one module, which makes its exposure reviewable rather
  than diffuse.

**Harder**

- Every screen needs endpoints written, validated and documented. This is the real cost, and
  it is paid across all 34 stories.
- No Supabase Realtime. REQ-036 (refresh a booking list when the tab regains focus) is the
  approved requirement here and does not need it — but if live updates are ever wanted, this
  decision is what stands in the way, and revisiting it would be a new ADR.
- The server must be running for the product to work at all. A static front end against a
  managed database would have had one fewer thing to deploy and keep up.
- Reads cost an extra hop. At one office with tens of desks this is not expected to matter;
  if a screen ever proves slow, the fix is an endpoint that returns what the screen needs,
  not a direct client.

**Follow-up work created**

- Enable RLS with deny-all policies on all five tables as part of the first migration, so the
  defence-in-depth claim is true from the start rather than retrofitted.
- A lint rule restricting construction of the Supabase client, and the reading of the
  service-role key, to `infra/supabase` — see `app-architecture.md` §3. A boundary that is
  only a convention is one refactor away from not existing.
- `ai/standards/api-standards.md` and `security-standards.md` currently describe a NestJS
  system and an `x-admin-key` guard that this design does not use. They need rewriting
  against this decision before the first story PR is reviewed.
