# Security standards

Checked by the Architect persona in design notes and PR review (Gate 2); scanned by the
release pipeline (Gate 3). The trust model behind these rules is
[ADR-001](../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md): the browser
never talks to Supabase for data, so **every** rule in this system is enforced server-side.

## Non-negotiables

- **The service-role key.** It bypasses every Row Level Security policy in the project. It is
  read in exactly one module (`infra/supabase`), belongs to the server process, is never
  bundled into the browser, and never appears in a log line. A second file reading it is a
  blocker finding, not a style note
- **RLS is deny-all.** The database refuses everything by default; the server is the only
  thing with a key that gets past it. Do not add a permissive policy to make something work —
  that quietly moves a rule out of the server and into Postgres where no test is looking
- **Secrets:** never in code, commits, logs, or docs. Env via `.env` (gitignored);
  `.env.example` documents key _names_ only; CI uses GitHub Secrets
- **Config validation is a security control.** Configuration is read once at startup and the
  process **refuses to start** if anything required is missing or malformed (US-034/AC-04).
  `OFFICE_TIMEZONE` deliberately has no default: a fallback to UTC would make BR-001.14's
  named failure case the out-of-the-box behaviour
- **Input:** every external input validated at the boundary by a Zod schema that **rejects**
  unknown fields. Reject by default; never trust a value because "it comes from our UI"
- **Injection:** database access through the Supabase client's parameterized query builder
  only; no string-built SQL; no `eval` / dynamic `Function`
- **Dependencies:** additions need Architect + human approval; CI audit must be clean of
  high/critical, or the risk is human-accepted and logged
- **CORS:** explicit origins per environment, no `*` outside local dev

## Authentication and authorization

### Sign-in is the one unauthenticated route, and what protects it

Credentials go to `POST /api/auth/sign-in` on Express, never from the browser to Supabase Auth
([ADR-003](../../knowledge/decisions/ADR-003-express-mediated-sign-in.md)). Two properties are
load-bearing and must survive every future change to that endpoint:

- **Convergence.** An unknown email, a wrong password and `is_active = false` return one
  byte-identical body. There is no early `return res.status(401)` anywhere in the flow; every
  failure path produces the same value before a response is shaped. Three causes naturally
  produce three messages, and that is how the guarantee breaks by accident.
- **A minimum duration floor** on the rejected path (`domain/sign-in-failure-delay.ts`). The
  deactivated case does strictly more work than either rejection — Supabase *succeeds*, then we
  read the profile and revoke the session — so without a floor it is measurably slower and the
  identical body is undone by the clock.

**The floor is not a rate limiter**, and it will be claimed as one in review. It delays each
response and bounds nothing about concurrency; a hundred parallel attempts still run in
parallel. BRD-001 specifies no rate limit or lockout, and that gap is recorded rather than
closed. Sign-in is the only unauthenticated write endpoint in the system.

A session Supabase has already minted for an account we then refuse is **revoked server-side**
before the refusal returns. Leaving it alive hands a deactivated user a working refresh token.

### Every other route

Supabase Auth issues tokens; **Express decides what they permit.** One middleware on every
route except sign-in (architecture §5.1):

1. Verify the access token against Supabase
2. Load `user_profiles`. **No profile, or `is_active = false` → `401`.** This is what makes
   REQ-005 bite immediately rather than at token expiry
3. `last_seen_at` older than 30 days → `401` (NFR-009, US-003/AC-03). Otherwise refresh it,
   throttled to once an hour
4. `must_change_password = true` → `403` with a distinguishable code on every route except
   the password-change route and sign-out (REQ-029, BR-001.17)

**Authorization is a second, explicit middleware.** `requireAdmin` on every `/api/admin/*`
route (V-07). Roles come from `user_profiles.role`, which the server has already loaded —
**never from a JWT claim**, which goes stale the moment an admin changes somebody's role
(REQ-022). A new protected surface needs a security note in the story PR, and an ADR when the
trade-offs are real.

### The forced password change

V-15 requires the new password not to equal the administrator-set one, and Supabase exposes
no password comparison. The check is done by attempting a sign-in with the candidate password
before setting it: success means it is the current password, and the change is refused. The
administrator-set credential stays valid throughout, so a failure here cannot strand a new
starter (RISK-009).

## Data exposure

- Responses are explicit allowlists — shape what you return, never hand back a row
- Errors leak nothing: no stack traces, no Postgres messages, no constraint names
  ([`api-standards.md`](api-standards.md))
- **Logging redaction is a constraint on the logger, not a habit.** Never log a password, a
  token, the service-role key, or a push subscription's keys. RISK-005 specifically requires
  admin-set passwords to stay out of persistent logs

## Review prompts (Gate 2 review)

Where does user input enter, and what schema rejected the rest of it? Is anything trusted
because it came from our UI? Could this role check read a stale value? What does this response
return that it doesn't need to? If this endpoint were called twice concurrently, what
arbitrates — the code, or an index?
