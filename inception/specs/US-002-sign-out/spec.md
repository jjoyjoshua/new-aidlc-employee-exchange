# US-002 — Sign out

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                    |
| ----------------- | -------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-002-sign-out.md` |
| **Traces to**     | REQ-003                                            |
| **Screen**        | The shell's account menu on SCR-002, SCR-004, SCR-005; destination SCR-001 ST-01; SCR-010 for AC-04 (link itself is US-004's — see Out of scope) |
| **Covering ADRs** | ADR-001, ADR-002, ADR-003 — no new ADR (design note §8) |
| **Tier**          | Complex                                            |
| **Status**        | draft                                              |
| **Updated**       | 2026-09-18                                         |

## Problem

Nothing ends a session today. `auth.adapter.ts` already holds a server-side revocation
primitive (`revokeSession`, built for US-001's deactivated-account refusal), but no route calls
it on request, `AppShell` has a nav and an outlet and no account menu, and the browser has no
mechanism to forget a session it never actually stores (`getAccessToken` returns `undefined`
unconditionally today).

What the system must do instead: end a session **server-side** on request — not merely clear
the browser's copy of it — from a control reachable by keyboard on every signed-in screen, and
do so even for a user who is mid-way through a forced password change. Going back in the browser
after signing out must show no personal or office data. None of this needs a new contract, a
migration, or an edit to the auth middleware chain — the design note's central finding is that
sign-out is architecturally the odd one out: every other route acts on behalf of a session,
this one ends one, and mounting it inside the chain that guards *acting* would be backwards.

The business case is in the story. This does not restate it.

## Functional requirements

Each `FR-##` is one testable behaviour, traced to the acceptance criterion it serves.

### Sign-out endpoint

| ID    | Requirement                                                                                                                                  | Priority | Serves       | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----------- |
| FR-01 | `POST /api/auth/sign-out` is mounted on `authRouter`, unguarded — it runs **no** session middleware, the same mount `POST /sign-in` already uses | Must     | AC-04        | not started |
| FR-02 | The route takes no request body and parses none; a stray body is ignored, not rejected                                                        | Must     | —            | not started |
| FR-03 | The route answers `204 No Content` for **every** input — missing token, malformed token, expired token, a token whose session is already gone, a deactivated account's token | Must     | AC-02        | not started |
| FR-04 | When a bearer token is present, the service extracts it and revokes it server-side through the existing `AuthAdapter` seam                     | Must     | AC-02        | not started |
| FR-05 | `revokeSession` takes an explicit `scope` argument (`'local' \| 'global'`); sign-out calls it with `'local'`, the US-001 deactivated-account refusal keeps `'global'` | Must     | —            | not started |
| FR-06 | When no bearer token is present, the route skips the adapter call entirely and logs a warning that nothing was revoked                          | Should   | —            | not started |

### Session and guards — what is deliberately unchanged

| ID    | Requirement                                                                                                                                  | Priority | Serves       | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----------- |
| FR-07 | `requireSession` is not modified and does not run on the sign-out route. A token that step 3 (`is_active = false`) would refuse still reaches the adapter and is revoked — proven by a test today, ahead of US-004 filling step 5 | Must     | AC-04        | not started |
| FR-08 | Signing out with an account whose `must_change_password = true` does not rotate, invalidate, or consume the stored credential — a subsequent sign-in with the same password succeeds and still reports `mustChangePassword: true` | Must     | AC-04        | not started |

### Browser

| ID    | Requirement                                                                                                                                  | Priority | Serves       | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----------- |
| FR-09 | `AppShell` gains an account menu: unconditionally visible Whoami + **Sign out** rows in the sidebar footer, not a disclosure and not an ARIA `role="menu"` (superseded 2026-09-18 by `D-06`, see `decisions.md` — originally a disclosure per `D-05`) | Must     | AC-01        | not started |
| FR-10 | The menu holds **Sign out** only. It is reachable by Tab, opens and closes by keyboard, `Escape` closes it and returns focus to the trigger, and a click outside closes it without stealing focus | Must     | AC-01        | not started |
| FR-11 | `AuthProvider` retains the access token it receives at sign-in (in a ref, not new storage) so `getAccessToken` returns a real value for the lifetime of the tab | Must     | AC-02        | not started |
| FR-12 | The context exposes `signOut()`: `POST /api/auth/sign-out` first (while the token is still available), then `supabaseBrowserClient.auth.signOut({ scope: 'local' })`, then clear `user` — in that order | Must     | AC-02        | not started |
| FR-13 | `signOut()` proceeds to `/sign-in` regardless of what the server answered — a transport failure must not strand the user on a signed-in screen | Must     | AC-02        | not started |
| FR-14 | `apiClient` gains a no-content request path that succeeds on a genuine empty `2xx` and maps everything unexpected exactly as the existing path does | Must     | AC-02        | not started |
| FR-15 | The shell's route element is wrapped in a session guard (`RequireSession`); every screen it contains inherits the redirect-to-sign-in when no user is present, before the screen ever mounts | Must     | AC-03        | not started |

## Non-functional requirements

None beyond the existing sign-in surface. Sign-out answers `204` for every input, so it is not
an account-existence oracle and needs no equivalent of US-001's failure-delay floor (design note
§2.2). US-001 open item 3 (no rate limit on the unauthenticated auth surface) now covers a
second route; the gap is unchanged and remains a Gate 3 item, not this story's to close.

## Technical constraints

- **No `libs/contracts` change.** No request schema (no body), no response schema (`204` has no
  body), no new error code — walked exhaustively in the design note §3. Only a status-table row
  in `ai/standards/api-standards.md`.
- **No migration, no new config key, no new dependency.**
- **`apps/api/src/http/middleware/**` is not touched by the mechanism itself.** The route is
  reachable without running `requireSession`; the mount, not the chain, is what makes AC-04
  hold. An optional, non-binding comment update to `require-session.ts` step 5 is in scope (it
  currently promises an exemption this design makes structurally unnecessary).
- **`app-architecture.md` §5.1** ("one middleware runs on every route except sign-in") needs its
  second exception recorded — sign-out is exempt from the whole chain, not only from a future
  password gate.
- **Scope is an explicit argument, never a default.** `global` (US-001's deactivated-account
  path) and `local` (this story) are both real, deliberate choices; hiding either behind a
  default parameter value is how the wrong one gets picked by omission.
- **`AccountMenu` is shell-private**, not a new top-level shared component — SCR-002, SCR-004
  and SCR-005 all name `app-shell` as the owning component, not a component of its own.

## Out of scope

- **The SCR-010 sign-out link.** AC-04's *Given* is a user on **Set your password**, which is
  US-004's screen and does not exist yet. This story proves AC-04's structural half (a token
  `requireSession` would refuse still gets revoked) and its credential half (the password
  survives) without the screen. US-004 carries the link, with its own test citing
  `US-002/AC-04`.
- **The Settings menu row.** SCR-002's component table lists it beside Sign out, but `/settings`
  does not exist. The row arrives with the Settings screen (US-031/US-032).
- **Cross-tab broadcast, a session heartbeat, a token denylist.** The story specifies none of
  these, and the design note adds none. A second tab is refused on its next request, not
  notified.
- **Cold-boot session rehydration.** Reading a session back from storage after a reload is
  US-003's. Today, a reload leaves no in-memory user, so the guard already redirects.
- **`Cache-Control: no-store` on `/api/*`.** Only stub screens exist behind this story; the
  hardening belongs with the first story that renders real data (US-010, US-013).
- **Any resolution of whether a revoked access token is actually refused by the installed
  GoTrue before it expires.** This is an empirical question the design note raises (§5) and the
  implementation plan requires a manual check for, pasted into the PR — not a code change this
  story makes.
