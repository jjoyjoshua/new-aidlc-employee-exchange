# US-001 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                    |
| --------- | -------------------------------------------------- |
| **Story** | `inception/stories/user-stories/US-001-sign-in.md`  |
| **Spec**  | `spec.md`                                          |
| **Tier**  | Complex                                            |

## Approval — Gate D1

| Field                | Value                                              |
| -------------------- | -------------------------------------------------- |
| Status               | **approved**                                       |
| Approved by          | Joy Joshua <joy_j@trigent.com>                     |
| Approved on          | 2026-09-17                                         |
| Plan commit approved | *uncommitted at approval* — base `a067292`         |

**On the SHA.** This package was approved in the working tree, before its first commit, so there
is no earlier commit holding the plan as it was read. The base it was read against is `a067292`,
and the commit that introduces this package **is** the approved content — `git diff a067292 --
inception/specs/US-001-sign-in/implementation-plan.md` shows exactly what was approved. Any edit
after that commit needs a `change-log.md` row, and check 16 enforces it. Recorded this way rather
than inventing a SHA that would not resolve.

`Approved by` is the human's name and email from `git config user.name` / `user.email`.
`Plan commit approved` is the SHA of the commit holding this plan **as they read it**, the
commit before this stamp. That SHA is what makes the approval verifiable: a reviewer at D2 runs
`git diff <sha> -- <this file>` and sees whether the plan changed after approval. The name is
self-asserted, so it is attribution, not authentication.

## Before step 1 — what the branch looks like while this runs

`feat/US-001-sign-in` is **red from the first commit until step 12**, and that is correct rather
than broken. `aidlc-check` fails a `feat/US-###` branch that has no AC-citing test, by design.
Each step below names the tests that turn part of it green.

Commands are npm workspaces, not Nx. The repository has `apps/*` workspaces and a root
`package.json`; `ai/roles/dev.md` still says "everything through Nx" and `aidlc-check` check 6
still looks for `apps/ui/project.json`. Both are framework-locked and carried forward as
upstream change requests (see *Carried forward*).

## Design reference

The hi-fi frames exist and are bound to this repository's tokens. File key
`xjFVgBbMrJUl7Ys3EX3Cbn` — *Employee Desk Booking — Design System & Mockups*.

| Node       | What                                             |
| ---------- | ------------------------------------------------ |
| `139:3`    | `HF / SCR-001 · Sign in / ST-01 Default · 1280`   |
| `133:124`  | `Sign in card` — one variant per `ST-##`          |
| `129:30`   | `Text field`                                     |
| `130:39`   | `Password field`                                 |
| `15:125`   | `Button` (primary default variant `15:2`)        |
| `149:405`  | `Login backdrop`                                 |

**Three things this settles, and one trap.**

1. **The Figma variables carry the same names as `tokens.css`** — the frames resolve to
   `--c-surface-raised`, `--c-border-control`, `--c-action`, `--c-action-label`, `--s-8`,
   `--r-md`, `--bw-1`, `--t-body-sm`, `--lh-body`, `--shadow-1`. Implementation is token
   substitution, not colour matching, and FR-32's "never a literal" is checkable against the
   frame rather than asserted.
2. **The component descriptions carry design decisions the screen spec does not repeat** — the
   `Button` default surface is 40px (`control/md`) with `control/lg` reached by overriding
   vertical padding to `spacing/12`; focus paints **outside** the box because the ring and the
   primary button are the same green; danger is outlined, not solid, because the palette has no
   danger action role; the disabled treatment was revised on 2026-09-08 away from
   `--c-fill-disabled` after it measured 1.30:1. `Text field` names the read-only treatment used
   while a request is in flight (ST-03). Read these at step 10, not after.
3. **No Code Connect** — this Figma plan does not include it, so nothing is mapped to code and
   the seven components are built fresh, as step 10 already assumes.

### Design fidelity is binding (Joy Joshua, 2026-09-17, at Gate D1 approval)

Backend and application structure follow this plan and the spec. **UI components, styling —
colour and typography — and the sign-in page's assets follow the Figma frames strictly.** Where
the frame and a written spec disagree on a visual, the frame wins and the disagreement is raised,
not silently resolved. Where they disagree on *behaviour*, the story's AC wins.

**All three widths are in scope for SCR-001**, not 1280 alone:

| Width | Frame                                           | Node      | Frame size | Column | Card      |
| ----- | ----------------------------------------------- | --------- | ---------- | ------ | --------- |
| 1280  | `HF / SCR-001 · Sign in / ST-01 Default · 1280` | `139:3`   | 1440 × 900 | 400    | 400 × 332 |
| 768   | `HF / SCR-001 · Sign in / ST-01 Default · 768`  | `139:36`  | 768 × 1024 | 400    | 400 × 332 |
| 360   | `HF / SCR-001 · Sign in / ST-01 Default · 360`  | `139:395` | 360 × 780  | 328    | 328 × 352 |

**ST-02 – ST-05, supplied 2026-09-17 — twelve more frames, all three widths each:**

| State                     | 1280      | 768       | 360       | Card at 1280 |
| ------------------------- | --------- | --------- | --------- | ------------ |
| ST-02 Field validation    | `139:58`  | `139:119` | `139:417` | 400 × 364    |
| ST-03 Submitting          | `139:152` | `139:188` | `139:450` | 400 × 332    |
| ST-04 Rejected            | `139:211` | `139:264` | `139:473` | 400 × 472    |
| ST-05 Service unavailable | `139:295` | `139:359` | `139:504` | 400 × 480    |

ST-03's card is **the same height as ST-01's** — 332 — which is the frame proving the
no-layout-shift rule rather than the spec asserting it.

Component sources: `Alert` `32:123` · `Icon / spinner` `13:4` · `Icon / error-circle` `11:34` ·
`Type=Primary, State=Busy` `15:30` · `Type=Secondary` `15:35`.

The ST-01 set confirms the written spec and settles three things it left to interpretation:

- **The card is 400px fixed at 768 and 1280 and does not grow**; at 360 it fills the 328px inner
  column inside 16px page margins (16 + 328 + 16 = 360). Its height grows 332 → 352 at 360
  because the help text wraps to a third line — the card's own padding and gaps are identical at
  every width, so this is one component, not three.
- **The page padding is asymmetric at 360**: `padding: 32px 16px 201px`. That bottom value is the
  band the backdrop occupies, reserved as padding so the column centres in what remains — which
  is what SCR-001 means by "the frame reserves that band as padding".
- **The backdrop moves, it does not scale with the viewport.** 1280: 600 × 335, bottom-**right**,
  beside the column. 768: 440 × 245, centred bottom band (164px each side). 360: 281 × 157,
  centred bottom band. Always `opacity: 0.5`.

This also satisfies NFR-05 and pre-empts US-033/AC-01 for this screen.

**The trap:** `get_design_context` returns React **+ Tailwind**, and this project has no Tailwind
and is not getting one (D-11). The returned markup is a visual target to convert, never code to
paste. Likewise the backdrop comes back as a Figma asset URL — **use
`inception/design/assets/login-backdrop.svg` from this repo instead**, which the component's own
description names as its source of truth.

## Steps

Ordered. Test-first per acceptance criterion: the failing test named `... (US-001/AC-##)` comes
before the code that turns it green.

### Step 1 — The contract package exists and both sides can import it

| Field    | Value                                                                                                                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-02, FR-03                                                                                                                                                                                  |
| Files    | `libs/contracts/package.json`, `libs/contracts/tsconfig.json`, `libs/contracts/src/{index,error,auth}.ts` (create); `libs/contracts/src/{error,auth}.spec.ts` (create); `package.json` (modify — add `libs/*` to workspaces and explicit build ordering); `apps/api/package.json`, `apps/ui/package.json` (modify — add the dependency) |
| Verify   | `npm run build --workspace @desk-booking/contracts` — expected: emits `dist/`. Then `npm run typecheck` — expected: both apps resolve `@desk-booking/contracts`                                        |

### Step 2 — The eslint boundaries admit the new package and nothing else

| Field    | Value                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-02                                                                                                                                    |
| Files    | `eslint.config.mjs` (modify — **protected path**; design note §3.3 read first)                                                            |
| Verify   | `npm run lint` — expected: clean. Plus a deliberate probe: an import of `apps/api` from `apps/ui` still errors, and `@supabase/supabase-js` outside `supabase-client.ts` still errors |

### Step 3 — The first migration creates `user_profiles` with RLS on

| Field    | Value                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| Advances | FR-04, FR-05                                                                                                      |
| Files    | `supabase/migrations/0001_user_profiles.sql` (create — **protected path**)                                        |
| Verify   | Applied against a local Supabase; `user_profiles` exists with `email citext`, the unique index, the `(is_active, role)` index, and `rowsecurity = true` with zero policies |

### Step 4 — The failure-delay rule, test-first (AC-04's pure half)

| Field    | Value                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-11, NFR-01                                                                                                                                                                       |
| Files    | `apps/api/src/domain/sign-in-failure-delay.spec.ts` (create, **first**), `apps/api/src/domain/sign-in-failure-delay.ts` (create); `apps/api/src/infra/clock/index.ts` (modify — add `sleep`) |
| Verify   | `npm test --workspace @desk-booking/api` — expected: three tests named `... (US-001/AC-04)` pass — pads a fast rejection to the floor, adds nothing when work exceeded it, never returns a negative delay |

### Step 5 — Sign-in converges on one outcome before any response is shaped

| Field    | Value                                                                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-06, FR-07, FR-08, FR-09, FR-10, FR-12, FR-13, FR-14, FR-15                                                                                                                                          |
| Files    | `apps/api/src/infra/supabase/index.ts` (modify — **protected path**; add an anon-key auth client); `apps/api/src/modules/auth/{auth.repository,auth.service,auth.router}.ts` (create); `auth.service.spec.ts` (create, **first**); `apps/api/src/http/errors.ts` (modify — codes come from contracts); `apps/api/src/http/app.ts` (modify — mount `/api/auth`) |
| Verify   | `npm test --workspace @desk-booking/api` — expected: all three causes yield a rejected outcome and compute the **same deadline** from their start time. **Confirm before writing FR-13**: does `@supabase/supabase-js` ^2.45.4 expose an admin sign-out? If not, report back rather than dropping the revoke |

### Step 6 — The three causes are byte-identical over the wire

| Field    | Value                                                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-10, FR-11, FR-14                                                                                                                                                         |
| Files    | `apps/api/src/modules/auth/auth.routes.spec.ts` (create — supertest)                                                                                                        |
| Verify   | `npm test --workspace @desk-booking/api` — expected: `expect(a.body).toEqual(b.body)` across unknown email, wrong password and deactivated; each took **at least** an injected small floor. No upper bound asserted and no means compared |

### Step 7 — The session chain and the admin guard

| Field    | Value                                                                                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-16, FR-17, FR-18, FR-19, FR-20, FR-21                                                                                                                                                                                          |
| Files    | `apps/api/src/http/middleware/{require-session,require-admin}.ts` (+ `.spec.ts`) (create — **protected path**); `apps/api/src/modules/admin/admin.router.ts` (create — empty); `apps/api/src/modules/auth/auth.router.ts` (modify — add `GET /session`); `apps/api/src/http/app.ts` (modify — `app.use('/api/admin', requireSession, requireAdmin, adminRouter)`) |
| Verify   | `npm test --workspace @desk-booking/api` — expected, against the real mount: Employee token to `/api/admin/anything` returns `403 admin_only` with no data; Admin token reaches `404`; no token returns `401`. Named `... (US-001/AC-03)` |

### Step 8 — HTTPS is refused in production

| Field    | Value                                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| Advances | FR-22                                                                                                     |
| Files    | `apps/api/src/http/middleware/require-https.ts` (+ `.spec.ts`) (create — **protected path**); `apps/api/src/http/app.ts` (modify) |
| Verify   | `npm test --workspace @desk-booking/api` — expected: a supertest with `x-forwarded-proto: http` in production mode is refused, and responses carry `Strict-Transport-Security`. Named `... (US-001/AC-08)`. **No `TRUST_PROXY` key is added** — see D-05 |

### Step 9 — The browser can route and can call the API

| Field    | Value                                                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-28, FR-31, NFR-02                                                                                                                                                        |
| Files    | `apps/ui/package.json` (modify — add `react-router-dom`); `apps/ui/src/lib/api-client.ts` (create); `apps/ui/src/lib/auth/{auth-context.tsx,require-role.tsx}` (create); `apps/ui/src/routes.tsx` (create); `apps/ui/src/App.tsx` (modify) |
| Verify   | `npm test --workspace @desk-booking/ui` — expected: `apiClient` maps a transport failure, a 5xx **and a schema parse failure** to the same unavailable outcome                |

### Step 10 — The seven shared components

| Field    | Value                                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-32                                                                                                                                                                 |
| Files    | `apps/ui/src/components/{text-field,password-field,button,alert,spinner,card,login-backdrop}/` (create, each with its `.spec.tsx`); `apps/ui/src/assets/login-backdrop.svg` (copy from `inception/design/assets/`) |
| Verify   | `npm test --workspace @desk-booking/ui` and `npm run lint` — expected: every value resolves to a `--` token; a grep for hex literals and `px` in these folders returns nothing outside `tokens.css`. Built against nodes `129:30`, `130:39`, `15:125`, `149:405` and their descriptions — read those first |

### Step 11 — SCR-001's five states

| Field    | Value                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-23, FR-24, FR-25, FR-26, FR-27                                                                                                 |
| Files    | `apps/ui/src/screens/sign-in/SignIn.spec.tsx` (create, **first**), `apps/ui/src/screens/sign-in/SignIn.tsx` (create)               |
| Design   | `139:3` is ST-01 at 1280. **The ST-02 – ST-05 frames and the 360 / 768 widths still need their node ids** — the page listing does not enumerate them, so they are fetched at this step from a link or a selection |
| Verify   | `npm test --workspace @desk-booking/ui` — expected: tests named `... (US-001/AC-05)` (fields marked, focus moved, **no request sent**), `... (US-001/AC-06)` (exactly one request, label kept), `... (US-001/AC-07)` (transport failure and 503 both reach ST-05, both fields kept), `... (US-001/AC-04)` (password cleared, email kept, focus to password, announced) |

### Step 12 — Landing, the shell, and the admin bounce

| Field    | Value                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | FR-28, FR-29, FR-30                                                                                                                                         |
| Files    | `apps/ui/src/components/app-shell/` (create); `apps/ui/src/screens/{my-bookings,all-bookings}/` (create — **stubs**); `apps/ui/src/routes.tsx` (modify)      |
| Verify   | `npm test --workspace @desk-booking/ui` — expected: `... (US-001/AC-01)` an Employee lands on `/bookings`; `... (US-001/AC-02)` an Admin lands on `/admin/bookings` with Bookings, Desks and People present; `... (US-001/AC-03)` an Employee at `/admin/bookings` is returned to `/bookings` |

### Step 13 — Make the repository stop contradicting ADR-003

| Field    | Value                                                                                                                                                                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | — (documentation correctness; ADR-003 follow-up 1)                                                                                                                                                                                                  |
| Files    | `knowledge/decisions/ADR-001-...md` §Decision, `inception/architecture/app-architecture.md` §1, `ai/standards/coding-standards.md` §Browser, `apps/ui/src/lib/supabase-client.ts` docblock (modify — all four say "signing in, and refreshing" today); `ai/standards/api-standards.md` (add the `503` row); `ai/standards/security-standards.md` (§Authentication note) |
| Verify   | `grep -rn "signing in" knowledge/ inception/architecture/ ai/standards/ apps/ui/src/lib/` — expected: no surviving claim that the browser signs in                                                                                                    |

### Step 14 — Traceability, the manifest, and the gate

| Field    | Value                                                                                                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advances | all                                                                                                                                                                                         |
| Files    | `inception/specs/US-001-sign-in/traceability.md` (fill); `knowledge/traceability/manifest.json` (modify — `US-001.tests[]`, currently empty); `inception/specs/index.md` (status to `implemented` at merge) |
| Verify   | `npm run lint && npm run typecheck && npm test && node tools/aidlc-check.mjs` — expected: all green, and the check no longer reports US-001 as a story with no AC-citing test                |

## Rollback

Revert the PR. Two things a revert does not cover:

1. **The migration.** `0001_user_profiles.sql` creates a table, an enum and RLS. Reverting the
   code leaves the schema in place. That is harmless — nothing else reads the table — but a
   re-apply must not double-create, so the down path is an explicit `drop table user_profiles;
   drop type user_role;` run by hand against the affected environment.
2. **Accounts created in Supabase Auth by test fixtures.** They live in `auth.users`, not in our
   migration. Fixtures must clean up after themselves, and a reverted branch should be followed
   by deleting any fixture accounts left in a shared project.

## Open questions

| Question | Owner | Blocks |
| -------- | ----- | ------ |

**None. Every D1 blocker is closed:** the router is decided (`react-router-dom`), ADR-003 is
decided, email case-insensitivity proceeds under D-02, and `TRUST_PROXY` is closed by D-05
without adding an env key.

## Known environmental caveat

`npm test -w apps/api` crashes a fork-pool worker — reproducibly, on `infra/logger/index.spec.ts` — **while a long-running dev server is up in the same shell** (`tsx watch` on the API, or Vite). Vitest reports it as "Worker exited unexpectedly … This is a bug in Vitest". With the dev servers stopped it is 75/75 across repeated runs. Not a defect in the suite, but worth knowing before somebody chases it: run the tests with the dev servers down, and if CI ever shows it, look for a stray process rather than a flaky test.

## Carried forward — does not block D1

| # | Item                                                                                                       | Owner              | Blocks          |
| - | ---------------------------------------------------------------------------------------------------------- | ------------------ | --------------- |
| 1 | No rate limit or lockout: a new requirement via `/ba`, or an accepted `RISK-###` in BRD-001 §9              | Joy Joshua / PO    | **Gate 3**      |
| 2 | ADR-001, ADR-002 to `accepted`; ADR-003 recorded as decided                                                 | Joy Joshua         | the PR merge    |
| 3 | Email case-insensitivity confirmed into BR-001.10                                                           | Joy Joshua → `/ba` | nothing         |
| 4 | No story owns the first-admin seed; US-016/AC-01 assumes one                                                | `/ba`              | US-016          |
| 5 | `db-design.md` open question 3 — this story answers it "the session ends immediately"; confirm so QA tests a decision | PO / BA   | nothing         |
| 6 | Supabase per-IP auth limits now apply to the whole company from one server IP (ADR-003)                     | DevOps             | **Gate 3**      |
| 7 | US-004 must land before any booking story                                                                   | Manager            | delivery order  |
| 8 | `ai/quality/review-checklist.md` requires Nx / graph-engine / Angular / NestJS; framework-locked            | upstream CR        | nothing         |
| 9 | `aidlc-check` check 6 looks for `apps/ui/project.json` and `libs/graph-engine`; warns and skips forever     | upstream CR        | nothing         |
| 10 | US-001 has no jira key in the manifest — `aidlc-check` warns that a client following the board cannot see this work | Joy Joshua / Manager | nothing |

---

## Addendum — bugfix: session not persisted, so a page refresh signs the user out (2026-09-18)

> Medium tier. Does not reopen the Gate D1 stamp above, which covers the original Complex-tier delivery unchanged. This addendum gets its own approval line, per `change-log.md`'s rule that an edit after approval needs a dated row.

### Addendum approval — Gate D1

| Field                | Value                                    |
| -------------------- | ----------------------------------------- |
| Status               | **approved**                             |
| Approved by          | Joy Joshua <joy_j@trigent.com>            |
| Approved on          | 2026-09-18                                |
| Plan commit approved | *uncommitted at approval* — base `e208802` |

Approved in the working tree, before this addendum's first commit — the same pattern the
original plan above used. Base `e208802` is the HEAD this addendum was read against; the commit
that introduces this addendum **is** the approved content (`git diff e208802 -- inception/specs/US-001-sign-in/implementation-plan.md`).

### What's broken

`AuthContextValue`'s `onSession` prop (line ~93) documents "Defaults to the browser's Supabase client," but unlike its two siblings — `onSignOut` (`defaultOnSignOut`, line 111) and `getStoredSession` (`defaultGetStoredSession`, line 116) — no `defaultOnSession` exists, and neither call site falls back to one:

- `signIn()` — `await onSession?.(result.data.session);` (line 217)
- `setPassword()` on a rotated session — `await onSession?.(result.data.session);` (line 256)

`App.tsx` (line 15) mounts `<AuthProvider>` with no props, so in the running app `onSession` is always `undefined` and both calls silently no-op. The access token then lives only in the in-memory `accessTokenRef` — nothing ever reaches `supabaseBrowserClient.auth.setSession(...)`. On refresh, the boot effect's `defaultGetStoredSession` (line 116) finds nothing stored, and `RequireSession` redirects to sign-in.

This is a genuine regression against **US-001/FR-28** (`traceability.md` already marks it `implemented`, which was inaccurate for the persistence half) and it is what silently prevents **US-003/AC-01** ("still signed in" across a reload) from ever holding outside of tests — every existing test supplies its own `onSession`/`getStoredSession` mock, so the real, prop-less default path was never exercised (`App.tsx` has no test coverage of persistence).

### Steps

#### Step 1 — add the missing default and wire both call sites

| Field    | Value                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------ |
| Advances | US-001/FR-28; restores US-003/AC-01 |
| Files    | `apps/ui/src/lib/auth/auth-context.tsx` (modify) |
| Approach | Add `defaultOnSession`, mirroring `defaultOnSignOut`'s shape exactly: lazily import `supabase-client.js`, call `supabaseBrowserClient.auth.setSession({ access_token, refresh_token })` with the session's `accessToken`/`refreshToken`. Change both call sites from `onSession?.(...)` to `await (onSession ?? defaultOnSession)(...)`, matching the existing `onSignOut ?? defaultOnSignOut` pattern. |
| Verify   | `npm run typecheck -w apps/ui` — no new errors |

#### Step 2 — regression test proving the real default path persists the session

| Field    | Value                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------ |
| Advances | US-001/FR-28; US-003/AC-01 |
| Files    | `apps/ui/src/lib/auth/auth-context.spec.tsx` (modify) |
| Approach | `vi.mock('../supabase-client.js', ...)` with a spy `setSession`. Render `AuthProvider` with **no `onSession` prop** (the real default), sign in, and assert `setSession` was called with the sign-in response's tokens. A second test re-mounts a fresh `AuthProvider` (simulating a reload) with `getStoredSession` reading from the same mocked client, and asserts `status` resolves to `signedIn` — proving the write and read sides now actually connect, which is what a refresh needs. Test title cites `(US-001/FR-28, US-003/AC-01)`. |
| Verify   | `npm test -w apps/ui -- auth-context` — new tests pass; failed first (no default existed) before Step 1 |

### Rollback

Revert the PR. No migration, no stored data, no config — reverting removes exactly the two changed files.

### Open questions

| Question                                         | Owner         | Blocks |
| ------------------------------------------------ | ------------- | ------ |
| none — both facts (the missing default, FR-28's inaccurate status) were confirmed by reading the code | — | — |
