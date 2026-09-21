# US-031 — impact analysis

|             |                                                                        |
| ----------- | ---------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-031-turn-push-alerts-on-or-off.md` |
| **Tier**    | Complex                                                                 |
| **Updated** | 2026-09-21                                                              |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                          |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------- |
| Contract                 | yes      | Three new routes (`GET /api/notifications/push`, `POST .../opt-in`, `POST .../opt-out`); a new module mounted (`notifications` gets its first router); a new `libs/contracts/src/notifications.ts` |
| Persistence              | yes      | New migration `0007_push_subscriptions.sql` — the fifth and last table in `db-design.md`. No column changes to `user_profiles` (`push_opt_in` already exists, `0001_user_profiles.sql:36`) |
| Trust                    | yes      | A new authenticated write surface accepting a client-supplied URL (`endpoint`) the server will later POST to at US-032 — validated per design note §4.4 |
| Dependency & integration | yes      | `web-push@3.6.7` (runtime, `apps/api`) + `@types/web-push@3.6.4` (devDependency) — approved, ADR-015 |
| Operational              | yes      | `config()` gains structural validation on three existing keys (no new key names); a new service worker file (`apps/ui/public/sw.js`), Complex by name in `task-surfaces.md` |

## Files and callers

| File | Symbol | Change | Callers found (`file:line`) |
| --- | --- | --- | --- |
| `supabase/migrations/0007_push_subscriptions.sql` | `push_subscriptions` | create | none yet (US-032 reads it later) |
| `supabase/migrations/README.md` | file table | modify | — |
| `apps/api/src/config/index.ts` | `schema` (VAPID fields) | modify | `config()` — every module that calls it; blast radius is the two spec fixtures below |
| `apps/api/src/config/index.spec.ts` | fixture object | modify | n/a (test file) |
| `apps/api/src/infra/mailer/index.spec.ts` | fixture object | modify | n/a (test file) |
| `apps/api/src/infra/logger/index.ts` | `REDACT` (or equivalent) | modify | every `logger.*` call across the API |
| `apps/api/src/infra/webpush/index.ts` | `sendPush` (unused by this story, stubbed) / `setVapidDetails` wiring | create | `modules/notifications` only, enforced by FR-17 |
| `apps/api/src/infra/webpush/README.md` | — | modify | — |
| `libs/contracts/src/notifications.ts` | `pushEndpointSchema`, `pushOptInRequestSchema`, `pushSettingsResponseSchema` | create | `apps/api` router, `apps/ui` fetchers |
| `apps/api/src/modules/notifications/notifications.repository.ts` | `upsertPushSubscription`, `deletePushSubscriptions`, `getPushOptIn`, `setPushOptIn` | modify (add) | `notifications.service.ts` |
| `apps/api/src/modules/notifications/notifications.service.ts` | `optIntoPush`, `optOutOfPush`, `getPushSettings` | modify (add) | `notifications.router.ts` |
| `apps/api/src/modules/notifications/notifications.router.ts` | `createNotificationsRouter` | create | `http/app.ts` |
| `apps/api/src/modules/notifications/README.md` | — | modify | — |
| `apps/api/src/modules/users/README.md` | — | modify | — |
| `apps/api/src/http/app.ts` | `AppDeps`, `createApp` | modify | `apps/api/src/index.ts` (composition root) |
| `eslint.config.mjs` | `WEBPUSH_BAN`, `moduleBoundaries` | modify | repo-wide lint run |
| `apps/api/package.json` / `apps/ui/package.json` | dependencies | modify | — |
| `.env.example` | comment only | modify | — |
| `apps/ui/public/sw.js` | — | create | browser only |
| `apps/ui/src/lib/push-subscription.ts` | `subscribeToPush`, `getExistingSubscription` | create | `screens/settings` |
| `apps/ui/src/lib/push-settings.ts` | `fetchPushSettings`, `optIntoPush`, `optOutOfPush` | create | `screens/settings/use-push-settings.ts` |
| `apps/ui/src/screens/settings/*` | `Settings`, `use-push-settings`, `copy` | create | `routes.tsx` |
| `apps/ui/src/components/toggle/Toggle.tsx` | `Toggle` | create | `screens/settings/Settings.tsx` |
| `apps/ui/src/components/note-row/NoteRow.tsx` | `NoteRow` | create | `screens/settings/Settings.tsx` |
| `apps/ui/src/components/definition-list/DefinitionList.tsx` | `DefinitionList` | create | `screens/settings/Settings.tsx` |
| `apps/ui/src/routes.tsx` | `AppRoutes` | modify | `App.tsx` |
| `apps/ui/src/components/app-shell/AccountMenu.tsx` | `AccountMenu` | modify | `AppShell.tsx` |
| `apps/ui/src/components/app-shell/AccountMenu.spec.tsx` | — | modify | n/a (test file) |

## Regression risk

| Area | Risk | Why | Covered by |
| --- | --- | --- | --- |
| `config()` boot | medium | Tightening `VAPID_*` from non-empty to a structural regex breaks any environment holding placeholder values (including the two test fixtures) | Updated fixtures in `config/index.spec.ts`, `infra/mailer/index.spec.ts`, plus a new negative-case test |
| `AccountMenu` | low | Adding a `Settings` link changes an existing, tested component | Existing `AccountMenu.spec.tsx` plus new assertions for the added link/nav state |
| `notification_deliveries` reminder index | none (verified, not touched) | US-032 will add push delivery rows later; this story writes none | `0006`'s partial-unique index is untouched by this migration |
| `eslint.config.mjs` | low | Adding `WEBPUSH_BAN` risks accidentally replacing rather than extending an existing block (the exact mistake `MAILER_BAN`'s own comments warn about, design note C6) | Verified by running `npm run lint` after the change and confirming the mailer ban still fires in its existing tests/usages |
| `infra/logger` redaction | low | A missed field name in the redact list is silent — nothing fails loudly if `endpoint` leaks | A dedicated logger spec asserting `endpoint`/`p256dh`/`auth` are redacted (TC per FR-19) |

## Deliberately not touched

- `apps/ui/src/main.tsx` — the service worker is registered lazily from the Settings screen, not at boot (design note §8.2).
- `apps/api/src/lib/auth/require-session.ts` and `authenticatedUserSchema` — the opt-in flag does **not** ride on the session response; a separate `GET` is what makes ST-08/ST-09 reachable (design note §3).
- `apps/api/src/modules/auth/auth.repository.ts`'s `COLUMNS` — unchanged, same reason.
- `apps/api/src/modules/notifications/notifications.service.ts`'s `recordAndSend` — untouched; US-032 widens it later, this story does not call it.
- `apps/ui/src/lib/data-refresh.ts` — the Settings screen is not on the focus-refresh list.
- Any role/permission check on the three new routes — no AC asks for one (design note open item 7, confirmed).
