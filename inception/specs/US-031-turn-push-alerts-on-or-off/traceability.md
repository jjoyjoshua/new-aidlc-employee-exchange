# US-031 — traceability

|             |                                                                        |
| ----------- | ---------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-031-turn-push-alerts-on-or-off.md` |
| **Updated** | 2026-09-21                                                              |

## Requirement to code

| Req    | File | Symbol / location | Proven by | Status |
| ------ | ---- | ------------------ | --------- | ------ |
| FR-01  | `apps/api/src/modules/notifications/notifications.router.ts:47` | `GET /push` | `notifications.routes.spec.ts` | implemented |
| FR-02  | `supabase/migrations/0007_push_subscriptions.sql` | `push_subscriptions` | reviewed against `db-design.md` §1.4 (no local Postgres in this sandbox to apply it against) | implemented |
| FR-03  | `apps/api/src/modules/notifications/notifications.router.ts:65` | `POST /push/opt-in` | `notifications.routes.spec.ts` | implemented |
| FR-04  | `apps/api/src/modules/notifications/notifications.router.ts:86` | `POST /push/opt-out` | `notifications.routes.spec.ts` | implemented |
| FR-05  | `libs/contracts/src/notifications.ts:35` | `pushEndpointSchema` | `notifications.spec.ts` (contracts) | implemented |
| FR-06  | `apps/ui/src/screens/settings/Settings.tsx:90` | ST-01 branch | `Settings.spec.tsx` | implemented |
| FR-07  | `apps/ui/src/screens/settings/Settings.tsx:100,120` | ST-02 / ST-04 branches | `Settings.spec.tsx` | implemented |
| FR-08  | `apps/ui/src/lib/push-subscription.ts` | `subscribeToPush` | `push-subscription.spec.ts` | implemented |
| FR-09  | `apps/ui/src/screens/settings/use-push-settings.ts` | `usePushSettings` (no optimistic `setPushOptIn`) | `use-push-settings.spec.ts` | implemented |
| FR-10  | `apps/ui/src/screens/settings/Settings.tsx:151` | ST-07 branch | `Settings.spec.tsx`, `use-push-settings.spec.ts` | implemented |
| FR-11  | `apps/ui/src/screens/settings/use-push-settings.ts` | permission-precedence render logic | `use-push-settings.spec.ts` | implemented |
| FR-12  | `apps/ui/src/screens/settings/use-push-settings.ts` | `checkSupported()` branch | `use-push-settings.spec.ts` | implemented |
| FR-13  | `apps/ui/src/screens/settings/Settings.tsx:179` | ST-08 branch | `Settings.spec.tsx` | implemented |
| FR-14  | `apps/api/src/modules/notifications/notifications.service.ts:313` | `optOutOfPush` | `notifications.service.spec.ts` | implemented |
| FR-15  | `apps/api/src/modules/notifications/notifications.router.ts` | `requireUser` (no `:id` route param) | `notifications.routes.spec.ts` | implemented |
| FR-16  | `apps/ui/src/screens/settings/settings.css` | `.settings__column` breakpoints | manual review; full sweep is US-033's job | implemented |
| FR-17  | `eslint.config.mjs:62` | `WEBPUSH_BAN` | manual scratch-import proof (Step 3); `npm run lint` | implemented |
| FR-18  | `apps/api/src/config/index.ts:63,68,74` | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | `apps/api/src/config/index.spec.ts` | implemented |
| FR-19  | `apps/api/src/infra/logger/index.ts:33` | `REDACT` (`'endpoint'`) | `apps/api/src/infra/logger/index.spec.ts` | implemented |
| FR-20  | `apps/ui/public/sw.js` | `install` / `activate` listeners | manual (DevTools) + registered from `Settings.spec.tsx`'s ST-04/ST-07 flows | implemented |
| FR-21  | `apps/ui/src/components/app-shell/AccountMenu.tsx` | `Settings` `NavLink` | `AccountMenu.spec.tsx` | implemented |
| NFR-01 | `apps/ui/src/screens/settings/use-push-settings.ts` (ST-06 issues no fetch); `apps/ui/src/screens/settings/copy.ts` (`UNSUPPORTED_NOTE`, `PERMISSION_DENIED_NOTE`) | graceful degradation | `use-push-settings.spec.ts`, `Settings.spec.tsx` | implemented |
| NFR-02 | `apps/api/src/infra/logger/index.ts:33` | `REDACT` (`'endpoint'`, `'p256dh'`, `'auth'`) | `apps/api/src/infra/logger/index.spec.ts` | implemented |

Every `FR-##` and `NFR-##` in `spec.md` has a row here, filled in with the code that landed in
this same commit.

## Key symbols

| Symbol | Location |
| --- | --- |
| `createNotificationsRouter` | `apps/api/src/modules/notifications/notifications.router.ts` |
| `pushEndpointSchema` | `libs/contracts/src/notifications.ts` |
| `subscribeToPush` | `apps/ui/src/lib/push-subscription.ts` |
| `usePushSettings` | `apps/ui/src/screens/settings/use-push-settings.ts` |
| `getVapidPublicKey` | `apps/api/src/infra/webpush/index.ts` |
