# US-002 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                    |
| --------- | -------------------------------------------------- |
| **Story** | `inception/stories/user-stories/US-002-sign-out.md` |
| **Spec**  | `spec.md`                                          |
| **Tier**  | Complex                                            |

## Approval — Gate D1

| Field                | Value                                      |
| -------------------- | ------------------------------------------- |
| Status               | **approved**                                |
| Approved by          | Joy Joshua <joy_j@trigent.com>              |
| Approved on           | 2026-09-18                                  |
| Plan commit approved | *uncommitted at approval* — base `857d901`  |

**On the SHA.** This package was approved in the working tree, before its first commit, same as
US-001's was. The base it was read against is `857d901`, and the commit that introduces this
package **is** the approved content — `git diff 857d901 -- inception/specs/US-002-sign-out/implementation-plan.md`
shows exactly what was approved. Any edit after that commit needs a `change-log.md` row, and
check 16 enforces it. `Approved by` is the human's name and email from `git config user.name` /
`user.email`. The name is self-asserted, so it is attribution, not authentication.

## Before step 1 — what the branch looks like while this runs

`feat/US-002-sign-out` is **red from the first commit until step 9**, same as US-001 was —
`aidlc-check` fails a `feat/US-###` branch with no AC-citing test, by design.

## Design reference

No new hi-fi frames. The account menu's **shell state** was already settled on 2026-09-10
across the SCR-002/004/005 hi-fi passes (`inception/specs/index.md` history); this story adds
its behaviour, not its visual language, and reuses `tokens.css` throughout (§7 — no literals).
SCR-001 ST-01 is the sign-out destination and is unchanged. Confirm the disclosure pattern
(design note §6.1, open item 7) with `/ux` before step 7 if anything about the menu's visual
state feels underspecified; nothing about AC-01 depends on the answer.

## Steps

Ordered. Test-first per acceptance criterion: the failing test named `... (US-002/AC-##)` comes
before the code that turns it green.

### Step 1 — `revokeSession`'s scope becomes explicit, test-first

| Field    | Value                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-05                                                                                                                                       |
| Files    | `apps/api/src/modules/auth/auth.adapter.spec.ts` (modify, **first** — assert the scope argument reaches the Supabase call); `apps/api/src/modules/auth/auth.adapter.ts` (modify — `scope: 'local' \| 'global'` becomes a required parameter, no default); `apps/api/src/modules/auth/auth.service.ts` (modify — the US-001 refusal call site passes `'global'` explicitly); `apps/api/src/modules/auth/auth.service.spec.ts` (modify — assert `'global'` at that call site) |
| Verify   | `npm test --workspace @desk-booking/api` — expected: the existing US-001 deactivated-account test still passes with `'global'` passed explicitly; a compile error if either call site omits the argument |

### Step 2 — `auth.service` can end a session, test-first

| Field    | Value                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-04, FR-06                                                                                                                                 |
| Files    | `apps/api/src/modules/auth/auth.service.spec.ts` (modify, **first**); `apps/api/src/modules/auth/auth.service.ts` (modify — `signOut(accessToken?: string)`: with a token, calls `auth.revokeSession(token, 'local')`; without one, calls it not at all and logs a warning) |
| Verify   | `npm test --workspace @desk-booking/api` — expected: a token present calls the adapter with `'local'`; no token present makes zero adapter calls and logs once |

### Step 3 — `POST /api/auth/sign-out`, mounted outside the session chain (AC-02, AC-04)

| Field    | Value                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-02, FR-03, FR-07, FR-08                                                                                                            |
| Files    | `apps/api/src/modules/auth/auth.routes.spec.ts` (modify, **first** — supertest); `apps/api/src/modules/auth/auth.router.ts` (modify — new route reads the `Authorization` header itself, calls `service.signOut`, always answers `204`, no `requireSession` dependency) |
| Verify   | `npm test --workspace @desk-booking/api` — expected, named `... (US-002/AC-02)`: `POST /sign-in` → `200`; `GET /session` with the token → `200`; `POST /sign-out` with the token → `204`; `GET /session` with the **same** token → `401`. Named `... (US-002/AC-04)`, structural: a token belonging to a deactivated (`is_active = false`) account — which `requireSession` step 3 refuses today — still receives `204` and is revoked, proving the route runs no session chain. Named `... (US-002/AC-04)`, credential: sign in with `must_change_password = true`, sign out, sign in again with the same password → `200` with `mustChangePassword: true` still true. Do **not** assert against a `revoked: string[]` stub array — model the stub adapter's `revokeSession` as deleting the token from the map the verifier reads, and assert the *next request's* outcome |

### Step 4 — Standards and architecture docs stay true

| Field    | Value                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | — (documentation correctness)                                                                                                              |
| Files    | `ai/standards/api-standards.md` (modify — add the `204` row); `inception/architecture/app-architecture.md` §5.1 (modify — sign-out is exempt from the whole chain, not only a future password gate); `apps/api/src/http/middleware/require-session.ts` (modify, optional — step 5's comment now describes a chain sign-out never reaches, rather than promising a future allowlist) |
| Verify   | Manual read — the sentence "one middleware runs on every route except sign-in" no longer omits sign-out                                     |

### Step 5 — The browser can retain and send its own token

| Field    | Value                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-11, FR-12, FR-13                                                                                                                          |
| Files    | test alongside `apps/ui/src/lib/auth/auth-context.tsx` (modify, **first**); `apps/ui/src/lib/auth/auth-context.tsx` (modify — retain the access token from `signIn`'s session in a ref; `getAccessToken` reads it; add `signOut()`: `POST /sign-out` with the token, then `supabaseBrowserClient.auth.signOut({ scope: 'local' })`, then clear `user`, proceeding to `/sign-in` regardless of the server's answer) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-002/AC-02)`: the sign-out request carries the `Authorization` header with the token obtained at sign-in; `signOut()` still navigates to sign-in when the request rejects |

### Step 6 — `apiClient` can read a `204`

| Field    | Value                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-14                                                                                                                                        |
| Files    | `apps/ui/src/lib/api-client.spec.ts` (modify, **first**); `apps/ui/src/lib/api-client.ts` (modify — a no-content request path sharing transport/timeout/abort/error-mapping with the existing `request()`, succeeding only on a genuinely empty `2xx`) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected: a `204` resolves as success on the new path; an unexpected empty body on the existing schema-parsing path still maps to `unavailable` |

### Step 7 — The account menu (AC-01)

| Field    | Value                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-09, FR-10                                                                                                                                  |
| Files    | `apps/ui/src/components/app-shell/AccountMenu.spec.tsx` (create, **first**); `apps/ui/src/components/app-shell/AccountMenu.tsx` (+ `account-menu.css`) (create); `apps/ui/src/components/app-shell/AppShell.tsx` (modify — renders the menu, wires `signOut`); `apps/ui/src/components/app-shell/AppShell.spec.tsx` (modify) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-002/AC-01)`: the trigger is reachable by Tab; Enter/Space opens it; `Escape` closes it and returns focus to the trigger; a click outside closes it; **Sign out** is the only row and invokes `signOut()` |

### Step 8 — The client session guard (AC-03)

| Field    | Value                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-15                                                                                                                                        |
| Files    | `apps/ui/src/lib/auth/require-session.spec.tsx` (create, **first**); `apps/ui/src/lib/auth/require-session.tsx` (create — redirects to `/sign-in` when no user is present); `apps/ui/src/routes.tsx` (modify — wrap the shell's route element: `<Route element={<RequireSession><AppShell /></RequireSession>}>`) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected, named `... (US-002/AC-03)`: with no signed-in user, rendering a route inside the shell redirects to `/sign-in` and the screen component never mounts (assert the screen's own effect/fetch never fires, not only that the DOM changed) |

### Step 9 — Traceability, the manifest, and the gate

| Field    | Value                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | all                                                                                                                                          |
| Files    | `inception/specs/US-002-sign-out/traceability.md` (fill); `knowledge/traceability/manifest.json` (modify — `US-002.tests[]`, currently empty; add `SCR-010` to `US-002.screens[]` per the design note's manifest-gap finding — AC-04 has no other screen listed); `inception/specs/index.md` (status to `implemented` at merge) |
| Verify   | `npm run lint && npm run typecheck && npm test && node tools/aidlc-check.mjs` — expected: all green, and the check no longer reports US-002 as a story with no AC-citing test |

## Required before this story is called done — not a code step

**A manual check, output pasted into the PR** (design note §5, open item 1): sign in, capture
the access token, `POST /api/auth/sign-out`, then `GET /api/auth/session` with the **same**
access token. If it returns `401`, AC-02 holds end-to-end. If it returns the user, AC-02 is
**not met** even though every test above is green — the fix is a shorter access-token TTL or a
server-side revoked-session check, and is a different story either way (design note §5, open
item 2). This is why the test suite alone cannot close this story's Gate D1 checklist item at
step 9; the pasted output is the second thing the PR description needs beyond the usual
lint/typecheck/test output.

## Rollback

Revert the PR. Nothing here touches persisted data or a migration, so a revert is complete —
unlike US-001, there is no schema and no fixture cleanup step to name.

## Open questions

| Question | Owner | Blocks |
| -------- | ----- | ------ |
| D-02 (`204` always vs `401` on a missing token) — confirmed default, reversible without touching another decision | Joy Joshua | nothing |
| D-03 / decisions.md item 1 — is `local` scope (this browser only) the intended default for a user-initiated sign-out, or should "sign out everywhere" be a distinct future action | Joy Joshua / PO | nothing |

**Nothing here blocks D1.** Both rows are confirmations of a default already argued from the
story's own text, not decisions the plan is waiting on — the same treatment US-001 gave email
case-insensitivity (D-02 there).

## Carried forward — does not block D1

| # | Item                                                                                                       | Owner              | Blocks          |
| - | ---------------------------------------------------------------------------------------------------------- | ------------------ | --------------- |
| 1 | AC-02 rests on unverified GoTrue behaviour — the manual check above, before the story is called done       | DEV → Joy Joshua   | AC-02 being true |
| 2 | If that check fails: a shorter access-token TTL, or a server-side revoked-session check (a different story) | Joy Joshua / DevOps / PO | AC-02      |
| 3 | The SCR-010 sign-out link, with a test citing `US-002/AC-04`                                                | Manager → US-004   | US-004's definition of done |
| 4 | `Cache-Control: no-store` on `/api/*`, with the first story that renders real data                          | Architect / DEV    | nothing         |
| 5 | Confirm the disclosure pattern for the account menu before it grows a second row                            | `/ux`              | nothing         |
| 6 | US-001 open item 3 (no rate limit on the auth surface) now covers a second unauthenticated route             | Joy Joshua / PO    | **Gate 3**      |
