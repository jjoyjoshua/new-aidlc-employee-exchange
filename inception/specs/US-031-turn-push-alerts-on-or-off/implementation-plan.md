# US-031 — implementation plan

|           |                                                                        |
| --------- | ------------------------------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-031-turn-push-alerts-on-or-off.md`  |
| **Spec**  | `spec.md`                                                                 |
| **Tier**  | Complex                                                                   |

## Approval — Gate D1

| Field                | Value                                                                     |
| --------------------- | -------------------------------------------------------------------------- |
| Status                | **approved**                                                                |
| Approved by           | Joy Joshua <joy_j@trigent.com>                                             |
| Approved on           | 2026-09-21                                                                  |
| Plan commit approved  | *uncommitted at approval* — base `16d18c8bb496eca3d59c935cc69608c065c72e0d` |

Name and email from `git config user.name` / `user.email`. The name is self-asserted —
attribution, not authentication.

## Steps

Ordered. Test-first per acceptance criterion: the failing test named `... (US-031/AC-##)` is
written before the code that turns it green. Full reasoning for each non-obvious call is in
[`design-note.md`](design-note.md) — cited by section, not repeated.

### Step 1 — Migration: `push_subscriptions`

| Field    | Value |
| -------- | ----- |
| Advances | FR-02 |
| Files    | `supabase/migrations/0007_push_subscriptions.sql` (create), `supabase/migrations/README.md` (modify — add rows for 0004–0007) |
| Verify   | Apply the migration against the local Supabase instance; confirm `push_subscriptions` exists with the unique index on `endpoint` and `on delete cascade` on `user_id` (design note §5) |

### Step 2 — Config: tighten VAPID validation

| Field    | Value |
| -------- | ----- |
| Advances | FR-18 |
| Files    | `apps/api/src/config/index.ts` (modify), `apps/api/src/config/index.spec.ts` (modify — real generated keys + a negative case), `apps/api/src/infra/mailer/index.spec.ts` (modify — same fixture fix) |
| Verify   | `npm run test -w apps/api -- config` — all green, including a new negative test asserting a malformed `VAPID_PUBLIC_KEY` refuses to boot (design note §7) |

### Step 3 — eslint: `WEBPUSH_BAN`

| Field    | Value |
| -------- | ----- |
| Advances | FR-17 |
| Files    | `eslint.config.mjs` (modify — new hoisted constant, added to `moduleBoundaries`'s `patterns.push(...)` alongside `MAILER_BAN`, and to the two blocks that restate `MAILER_BAN` directly) |
| Verify   | `npm run lint` — clean; a scratch import of `infra/webpush` from `modules/users` fails lint, then is reverted (manual proof, not committed) |

### Step 4 — Contracts: the wire shapes

| Field    | Value |
| -------- | ----- |
| Advances | FR-01, FR-03, FR-04, FR-05 |
| Files    | `libs/contracts/src/notifications.ts` (create), `libs/contracts/src/notifications.spec.ts` (create), `libs/contracts/src/index.ts` (modify — export) |
| Verify   | `npm run test -w libs/contracts` — `pushEndpointSchema` rejects `http:`, credentialed URLs, private/loopback/`.local` hosts and >2048 chars; accepts a real-shaped `https://fcm.googleapis.com/...` endpoint (test named `... (US-031/AC-02)`) |

### Step 5 — `infra/webpush`: the VAPID wiring (no send yet)

| Field    | Value |
| -------- | ----- |
| Advances | (supports FR-01 — serving `vapidPublicKey`) |
| Files    | `apps/api/src/infra/webpush/index.ts` (create — exports `config().VAPID_PUBLIC_KEY` accessor only; `web-push`'s `setVapidDetails`/send function is stubbed, not called, since this story sends nothing), `apps/api/src/infra/webpush/README.md` (modify), `apps/api/package.json` / `package-lock.json` (modify — add `web-push`, `@types/web-push`) |
| Verify   | `npm run typecheck -w apps/api` — clean; `npm audit` shows no new high/critical |

### Step 6 — `infra/logger`: redact push fields

| Field    | Value |
| -------- | ----- |
| Advances | FR-19 |
| Files    | `apps/api/src/infra/logger/index.ts` (modify) |
| Verify   | A logger spec asserting `endpoint`, `p256dh`, `auth` are redacted from any logged object (test named `... (US-031/AC-07 — redaction)`) |

### Step 7 — Repository: push read/write methods

| Field    | Value |
| -------- | ----- |
| Advances | FR-01, FR-02, FR-03, FR-04 |
| Files    | `apps/api/src/modules/notifications/notifications.repository.ts` (modify — add `getPushOptIn`, `setPushOptIn`, `upsertPushSubscription`, `deletePushSubscriptions`), `apps/api/src/modules/notifications/notifications.repository.spec.ts` (modify) |
| Verify   | `npm run test -w apps/api -- notifications.repository` — upsert on `endpoint` conflict updates `user_id`/`p256dh`/`auth`/`user_agent`; delete removes every row for a `user_id` |

### Step 8 — Service: opt-in / opt-out orchestration

| Field    | Value |
| -------- | ----- |
| Advances | FR-03, FR-04, FR-14 |
| Files    | `apps/api/src/modules/notifications/notifications.service.ts` (modify — add `getPushSettings`, `optIntoPush`, `optOutOfPush`) |
| Verify   | `npm run test -w apps/api -- notifications.service` — opt-in writes subscription then flag (test asserts call order, `... (US-031/AC-07)`); opt-out writes flag then deletes (`... (US-031/AC-03)`); a failed second write in either order leaves the pre-story state provable from the mock's call log |

### Step 9 — Router + mount

| Field    | Value |
| -------- | ----- |
| Advances | FR-01, FR-03, FR-04, FR-15 |
| Files    | `apps/api/src/modules/notifications/notifications.router.ts` (create), `apps/api/src/modules/notifications/notifications.routes.spec.ts` (create), `apps/api/src/http/app.ts` (modify — `AppDeps.notificationsRouter`, mount at `/api/notifications` behind `requireSession`), `apps/api/src/composition.ts` or equivalent wiring (modify) |
| Verify   | `npm run test -w apps/api -- notifications.routes` — `GET` returns `{ pushOptIn, vapidPublicKey }`; both `POST`s return `{ pushOptIn }`; no route accepts an `:id`; a request without a session gets `401` from the mount-level guard (`... (US-031/AC-10)`) |

### Step 10 — Module READMEs

| Field    | Value |
| -------- | ----- |
| Advances | (documents the ADR-004 exception, design note §4.6) |
| Files    | `apps/api/src/modules/notifications/README.md` (modify), `apps/api/src/modules/users/README.md` (modify) |
| Verify   | Manual review — both files name the `push_opt_in` write exception and cite `app-architecture.md:89` |

### Step 11 — UI: service worker

| Field    | Value |
| -------- | ----- |
| Advances | FR-20 |
| Files    | `apps/ui/public/sw.js` (create) |
| Verify   | `npm run dev -w apps/ui`, DevTools Application tab shows the worker registered with no `fetch` handler in its listener list |

### Step 12 — UI: push subscription helper

| Field    | Value |
| -------- | ----- |
| Advances | FR-08 |
| Files    | `apps/ui/src/lib/push-subscription.ts` (create), `apps/ui/src/lib/push-subscription.spec.ts` (create) |
| Verify   | `npm run test -w apps/ui -- push-subscription` — the `urlBase64ToUint8Array` helper is verified against a known vector; the subscribe flow builds `{ endpoint, p256dh, auth }` explicitly (never `subscription.toJSON()`, `... (US-031 design note §4.4)`) |

### Step 13 — UI: fetch wrappers

| Field    | Value |
| -------- | ----- |
| Advances | FR-01, FR-03, FR-04 |
| Files    | `apps/ui/src/lib/push-settings.ts` (create), `apps/ui/src/lib/push-settings.spec.ts` (create) |
| Verify   | `npm run test -w apps/ui -- push-settings` — each fetcher parses the response against the `libs/contracts` schema; an `unavailable`/`error` `ApiResult` propagates without throwing |

### Step 14 — UI: shared components

| Field    | Value |
| -------- | ----- |
| Advances | FR-06, FR-07, FR-10, FR-13 |
| Files    | `apps/ui/src/components/toggle/Toggle.tsx` + `.css` + `.spec.tsx` (create), `apps/ui/src/components/note-row/NoteRow.tsx` + `.css` + `.spec.tsx` (create), `apps/ui/src/components/definition-list/DefinitionList.tsx` + `.css` + `.spec.tsx` (create) |
| Verify   | `npm run test -w apps/ui -- toggle note-row definition-list` — `Toggle` renders on/off/busy/disabled with the state as visible text, never colour alone (`... (US-031/AC-11 non-colour signalling)`, NFR-008) |

### Step 15 — UI: the state hook

| Field    | Value |
| -------- | ----- |
| Advances | FR-09, FR-11, FR-12 |
| Files    | `apps/ui/src/screens/settings/use-push-settings.ts` (create), `apps/ui/src/screens/settings/use-push-settings.spec.ts` (create) |
| Verify   | `npm run test -w apps/ui -- use-push-settings` — the eight-state derivation is tested directly: unsupported → no fetch issued (`... (US-031/AC-06)`); `denied` + `pushOptIn: true` → ST-05, never on-and-disabled (`... (US-031/AC-05)`); a failed opt-in leaves the pre-click state (`... (US-031/AC-07)`) |

### Step 16 — UI: the screen

| Field    | Value |
| -------- | ----- |
| Advances | FR-06, FR-07, FR-10, FR-13, FR-16 |
| Files    | `apps/ui/src/screens/settings/Settings.tsx` (create), `apps/ui/src/screens/settings/copy.ts` (create), `apps/ui/src/screens/settings/settings.css` (create), `apps/ui/src/screens/settings/Settings.spec.tsx` (create) |
| Verify   | `npm run test -w apps/ui -- Settings` — one test per state, ST-01 through ST-08, each asserting the visible text SCR-004 specifies; a resize-based or class-based check for the 520px content column at 768px |

### Step 17 — UI: routing and shell

| Field    | Value |
| -------- | ----- |
| Advances | FR-21 |
| Files    | `apps/ui/src/routes.tsx` (modify — add `/settings`), `apps/ui/src/components/app-shell/AccountMenu.tsx` (modify — add the Settings link and the `Nav=Employee-Settings` active-state cue), `apps/ui/src/components/app-shell/AccountMenu.spec.tsx` (modify) |
| Verify   | `npm run test -w apps/ui -- AccountMenu routes` — clicking **Settings** in the account menu navigates to `/settings`; the sidebar shows the Settings row lit, not **Bookings** |

### Step 18 — `.env.example` and traceability close-out

| Field    | Value |
| -------- | ----- |
| Advances | (housekeeping) |
| Files    | `.env.example` (modify — one comment line naming `npx web-push generate-vapid-keys`), `traceability.md` (modify — every row to `implemented`), `knowledge/traceability/manifest.json` (modify — US-031 entry) |
| Verify   | `node tools/aidlc-check.mjs` — clean |

### Step 19 — Full sweep

| Field    | Value |
| -------- | ----- |
| Advances | all |
| Files    | none |
| Verify   | `npm run lint && npm run typecheck && npm run test` at the repo root — all green; paste the output in the PR. Also: verify the 87/22-character base64url key lengths (design note §4.4, open item 9) against a real Chrome and a real Firefox subscription, and paste that evidence in the PR description |

## Rollback

Revert the PR. The only irreversible-looking piece is the `0007` migration; reverting it is a
second migration dropping `push_subscriptions` (never edit `0007` in place once merged — this
repository's own convention, matching `0001`–`0006`). No data migration risk: the table is new
and starts empty. `push_opt_in` is untouched by rollback since this story does not add or change
that column.

## Open questions

| Question | Owner | Blocks |
| -------- | ----- | ------ |
| — | — | — |

Every question the design note raised (open items 1–7) was answered in chat on 2026-09-21 and is
recorded in `design-note.md` §11 and `change-log.md`. Open item 9 (key-length verification) is a
build-time verification task, tracked in Step 19, not a blocker to starting.
