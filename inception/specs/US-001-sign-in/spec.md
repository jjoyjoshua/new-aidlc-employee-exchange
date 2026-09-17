# US-001 — Sign in with email and password

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                    |
| ----------------- | -------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-001-sign-in.md`  |
| **Traces to**     | REQ-001, REQ-002, REQ-005, NFR-003, V-01, V-07     |
| **Screen**        | SCR-001 — Sign in (states ST-01 – ST-05)           |
| **Covering ADRs** | ADR-001, ADR-002, ADR-003                          |
| **Tier**          | Complex                                            |
| **Status**        | draft                                              |
| **Updated**       | 2026-09-17                                         |

## Problem

Nothing exists. `apps/api` has a config validator, a logger, an error handler and an empty
Express app; `apps/ui` renders a placeholder. There is no database table, no migration, no wire
contract, no authentication of any kind, and no route in either application. Every one of the
other 33 stories sits behind a signed-in user, so this story builds the spine they all hang
from.

What the system must do instead: accept an email and a password at one Express endpoint, verify
them against Supabase Auth **server-side**, apply `user_profiles.is_active` before any token
reaches the browser, and return a session plus the acting user's role. It must make an unknown
email, a wrong password and a deactivated account indistinguishable in both body and
response-time band. It must refuse an Employee at an admin address on the server, not only in
the navigation. And it must establish the three things every later story reuses: the shared
contract package, the auth middleware chain, and the shared UI components.

The business case is in the story. This does not restate it.

## Functional requirements

Each `FR-##` is one testable behaviour, traced to the acceptance criterion it serves.

### Contract package (`libs/contracts`)

| ID    | Requirement                                                                                                                               | Priority | Serves        | Status      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------- | ----------- |
| FR-01 | `@desk-booking/contracts` exports Zod schemas for the sign-in request and response, the error body, and the union of stable `code` strings  | Must     | AC-01 – AC-07 | not started |
| FR-02 | Both applications import the **same schema objects**; TypeScript types are inferred from them with `z.infer`, never declared alongside      | Must     | AC-05         | not started |
| FR-03 | `error.code` is parsed as `z.string()` with the enum exported separately, so an unknown future code cannot crash an older tab               | Must     | AC-07         | not started |

### Persistence

| ID    | Requirement                                                                                                                                                 | Priority | Serves       | Status      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----------- |
| FR-04 | Migration `0001` creates the `user_role` enum and `user_profiles` per `db-design.md` §1.1, with `email citext`, unique on email, index on `(is_active, role)` | Must     | AC-01, AC-04 | not started |
| FR-05 | RLS is enabled deny-all on `user_profiles` in the same migration that creates it, with no permissive policy                                                   | Must     | ADR-001      | not started |

### Sign-in endpoint

| ID    | Requirement                                                                                                                                                               | Priority | Serves       | Status      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----------- |
| FR-06 | `POST /api/auth/sign-in` parses its body with `signInRequestSchema` — strict, email trimmed, password `min(1).max(200)` and never trimmed or case-folded                    | Must     | AC-05        | not started |
| FR-07 | The email is normalised — trimmed, then lower-cased — in our own code before the auth call and before any profile lookup                                                    | Must     | AC-01        | not started |
| FR-08 | Password verification runs server-side through Supabase Auth on the **anon key**, never the service-role key                                                                | Must     | AC-01, AC-02 | not started |
| FR-09 | A successful sign-in returns a session (access token, refresh token, expiry) and the user's id, email, full name, role and `mustChangePassword`, in camelCase               | Must     | AC-01, AC-02 | not started |
| FR-10 | An unknown email, a wrong password and `is_active = false` all converge on one rejected outcome and return a **byte-identical** `401 invalid_credentials` body              | Must     | AC-04        | not started |
| FR-11 | A rejected sign-in is held to a minimum total duration of `SIGN_IN_MIN_FAILURE_MS`; success and `400` are **not** padded                                                    | Must     | AC-04        | not started |
| FR-12 | A rejection whose own work exceeded the floor logs a warning — the operational signal that AC-04's band has stopped holding                                                 | Must     | AC-04        | not started |
| FR-13 | A deactivated account's GoTrue-minted session is revoked server-side before the refusal is returned                                                                         | Must     | AC-04        | not started |
| FR-14 | A Supabase Auth transport failure, timeout or 5xx returns `503 service_unavailable`, distinct from `500 internal_error`                                                     | Must     | AC-07        | not started |
| FR-15 | A `400 invalid_request` body is generic — it never echoes the submitted value or the Zod issue list                                                                         | Must     | AC-04        | not started |

### Session and guards

| ID    | Requirement                                                                                                                                                                              | Priority | Serves       | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----------- |
| FR-16 | `GET /api/auth/session` returns the acting user read from `user_profiles`, never from a JWT claim                                                                                          | Must     | AC-02, AC-03 | not started |
| FR-17 | `requireSession` performs steps 1–3 — bearer present, token verified, profile loaded and `is_active` checked — with distinct `401` codes `no_session`, `session_invalid`, `account_inactive` | Must     | AC-03        | not started |
| FR-18 | `requireSession` stamps `last_seen_at`. The 30-day comparison and hourly throttle are US-003's and exist here as a named, empty, commented seam                                            | Must     | AC-03        | not started |
| FR-19 | The `must_change_password` 403 is US-004's and exists here as a named, empty, commented seam                                                                                               | Should   | —            | not started |
| FR-20 | `requireAdmin` is mounted on the `/api/admin` **mount point**, never per route, so every future admin route inherits it before it is written                                               | Must     | AC-03        | not started |
| FR-21 | With an Employee token any `/api/admin/*` address returns `403 admin_only` carrying no data; an Admin token reaches `404 route_not_found`; no token returns `401 no_session`               | Must     | AC-03        | not started |
| FR-22 | `requireHttps` — in production a request whose `x-forwarded-proto` is `http` is refused or redirected, and responses carry `Strict-Transport-Security`                                     | Must     | AC-08        | not started |

### Browser

| ID    | Requirement                                                                                                                                                                                       | Priority | Serves       | Status      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----------- |
| FR-23 | `/sign-in` renders SCR-001 ST-01 — labelled email and password fields, a show/hide toggle, an enabled **Sign in**, and the static help text                                                         | Must     | AC-05        | not started |
| FR-24 | ST-02 — submit is validated in the browser with the **same** `signInRequestSchema`; the form carries `noValidate`; focus moves to the first invalid field; **no request is sent**                    | Must     | AC-05        | not started |
| FR-25 | ST-03 — the form is disabled while in flight behind an `AbortController`; exactly one request exists; the button keeps its label and gains a spinner in the button's label colour                    | Must     | AC-06        | not started |
| FR-26 | ST-04 — on `invalid_credentials` the password is cleared, the email kept, focus moves to the password field, and the alert is announced via `role="alert"`                                           | Must     | AC-04        | not started |
| FR-27 | ST-05 — on a transport failure, a timeout, any 5xx **or a failed response parse**, both fields keep their contents, **Try again** sits inside the alert, `Sign in` stays live below, focus does not move | Must     | AC-07        | not started |
| FR-28 | On success the session is handed to the browser Supabase client's `setSession`, then routed on role: `employee` to `/bookings`, `admin` to `/admin/bookings`                                         | Must     | AC-01, AC-02 | not started |
| FR-29 | `app-shell` renders role-dependent navigation; the admin navigation (Bookings, Desks, People) is present for an Admin                                                                               | Must     | AC-02        | not started |
| FR-30 | `RequireRole` with role `admin` redirects an Employee to `/bookings`. This is convenience; FR-21 is the guarantee                                                                                   | Must     | AC-03        | not started |
| FR-31 | One `apiClient` attaches the bearer, parses every response through its contract schema, and maps transport failures **and parse failures** to the same unavailable outcome                           | Must     | AC-07        | not started |
| FR-32 | Seven shared components — `text-field`, `password-field`, `button`, `alert`, `spinner`, `card`, `login-backdrop` — take every value from `tokens.css`, never a literal                               | Must     | AC-05        | not started |

## Non-functional requirements

| ID     | Requirement                                                                                                         | Serves         |
| ------ | ------------------------------------------------------------------------------------------------------------------- | -------------- |
| NFR-01 | `SIGN_IN_MIN_FAILURE_MS = 500` — a constant in code, not an env var; tests inject a small floor as an argument        | AC-04          |
| NFR-02 | The browser's request carries a 10 s timeout; exceeding it lands on ST-05                                             | AC-07          |
| NFR-03 | HTTPS is required in deployed environments; the password never appears in a URL                                       | NFR-003, AC-08 |
| NFR-04 | No password, token, or service-role key reaches any log line. A route that logs its request body is a blocker finding | RISK-005       |
| NFR-05 | Every screen delivered here holds at 360, 768 and 1280 with no horizontal page scroll                                 | NFR-004        |

## Technical constraints

- **ADR-003 binds the shape.** The browser never calls Supabase Auth to authenticate. Its
  Supabase client does exactly one thing: refresh the access token.
- **ADR-001 binds the data path.** The browser reads no table. All data comes from `/api/*`.
- **Six of the seven protected paths are touched** (`ai/standards/task-surfaces.md`):
  `apps/api/src/http/middleware/**`, `apps/api/src/infra/supabase/**`, `libs/contracts/**`,
  `supabase/migrations/**`, `eslint.config.mjs`, and — read-only — `inception/design/tokens.css`.
- **Role is read from `user_profiles.role`, never from a JWT claim.** REQ-022 changes roles under
  live sessions and a claim goes stale at that moment (`app-architecture.md` §5.1).
- **V-12's password policy is not applied at sign-in.** It governs *setting* a password.
  Enforcing it here would make a short attempt `400` and a wrong long attempt `401` — a
  distinguishable path that leaks the policy.
- **Shared component props and events are a Complex surface.** This story fixes them for the next
  nine screens. Design for SCR-010's reuse and nothing beyond it; no speculative props.
- **Wire casing is camelCase everywhere.** The database is snake_case and the mapping happens in
  the module's response builder. This is the first endpoint, so it sets the convention.

## Out of scope

- **`POST /api/auth/sign-out`** — US-002's. A route with no AC has no test to cite.
- **The 30-day session expiry and the hourly `last_seen_at` throttle** — US-003's. The column is
  created here; the comparison is not.
- **The `must_change_password` 403 gate** — US-004's. Consequence: between US-001 and US-004 an
  administrator-set credential is unrestricted, acceptable only because no protected screens
  exist yet. **US-004 must land before any booking story.**
- **The content of My bookings and All bookings** — US-010's and US-013's. This story delivers
  route stubs at both addresses and the shell's navigation, because AC-01, AC-02 and AC-03
  assert on them.
- **The other four database tables.** A migration for a table no code reads is untested schema.
- **The first-admin seed.** BRD-001 §8 names it and US-016/AC-01 assumes it, but **no `US-###`
  owns it**. An auto-created admin with a known credential is a security surface of its own.
  Tests create accounts through the Supabase admin API in a fixture; the bootstrap goes to `/ba`
  as a missing story.
- **Any rate limit or account lockout.** BRD-001 specifies none and this story does not invent
  thresholds. The failure-delay floor is **not** a rate limiter.
- **A headless UI library.** None of the seven components maps onto a headless primitive. The
  decision is due before SCR-002's cancel dialog (US-010/US-011).
