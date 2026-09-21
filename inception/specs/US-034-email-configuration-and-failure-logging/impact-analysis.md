# US-034 — impact analysis

|             |                                                                                  |
| ----------- | -------------------------------------------------------------------------------- |
| **Story**   | `inception/stories/user-stories/US-034-email-configuration-and-failure-logging.md` |
| **Tier**    | Complex                                                                          |
| **Updated** | 2026-09-21                                                                       |

## Surfaces crossed

| Surface                  | Crossed? | What exactly                                                                                                    |
| ------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------- |
| Contract                 | no       | No endpoint (story's own "API impacts" section)                                                                  |
| Persistence              | yes      | New table `notification_deliveries` + 3 enums + partial unique index — migration `0006_notification_deliveries.sql` |
| Trust                    | no       | No auth/session/role surface; `error_detail` never carries a credential (AC-06), which is a logging rule, not a trust boundary |
| Dependency & integration | no*      | *Named* as a Complex surface (`task-surfaces.md`: "a new external integration (mail provider...)"), but this story adds no package — only a `console` transport with no SDK. Flagged here so the "no dependency" claim is visible, not assumed |
| Operational              | yes      | `eslint.config.mjs` gains a new import-boundary rule (protected path); `apps/api/src/config/index.ts` (also a protected path) gains a tighter `MAIL_PROVIDER` enum and a production guard — **added after the D1 `go`**, per the Architect design note's F-3 finding, not part of the plan the human approved. No new *env key name* (`MAIL_*` already required by the existing schema), but the set of accepted `MAIL_PROVIDER` values narrows |

## Files and callers

| File                                                    | Symbol                    | Change | Callers found (`file:line`)                                                      |
| -------------------------------------------------------- | -------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `supabase/migrations/0006_notification_deliveries.sql`   | `notification_deliveries` | create | none yet — US-028/029/030 will insert through `notifications.repository.ts`       |
| `apps/api/src/infra/mailer/index.ts`                      | `sendMail`                 | create | `apps/api/src/modules/notifications/notifications.service.ts` only (FR-07)        |
| `apps/api/src/modules/notifications/notifications.repository.ts` | `insertDelivery`   | create | `apps/api/src/modules/notifications/notifications.service.ts`                     |
| `apps/api/src/modules/notifications/notifications.service.ts` | `recordAndSend`       | create | none yet — US-028/029/030 will call it (AC-08)                                    |
| `eslint.config.mjs`                                       | mailer import boundary (amends existing blocks, F-1) | modify | n/a — lint rule, no runtime caller; also closes a pre-existing hole, F-7           |
| `apps/api/src/config/index.ts`                             | `MAIL_PROVIDER` schema     | modify | `apps/api/src/infra/mailer/index.ts` (reads `config()`)                            |
| `apps/api/src/config/index.spec.ts`                        | fixture + 2 new cases      | modify | n/a — test file                                                                    |
| `.env.example`                                              | comment only (F-11)        | modify | doc only                                                                            |
| `apps/api/src/infra/mailer/README.md`                     | —                          | modify | doc only                                                                            |
| `apps/api/src/modules/notifications/README.md`            | —                          | modify | doc only                                                                            |
| `apps/api/src/eslint-boundaries.spec.ts` (F-8)              | —                          | create | n/a — test file, no runtime caller                                                 |
| `knowledge/traceability/manifest.json`                    | `US-034.tests`             | modify | `aidlc-check`                                                                      |

## Regression risk

| Area                             | Risk   | Why                                                                                                    | Covered by                                            |
| --------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Server boot                       | medium | `config()`'s schema narrows `MAIL_PROVIDER` to `z.enum(['console'])` plus a production guard (design note F-3) — no new *key*, but an environment currently holding a value other than `console` (or holding `console` under `NODE_ENV=production`) will refuse to boot where it booted before. Every real `.env` in this repo already sets `console`/`none`; `apps/api/.env` (gitignored) moves from `none` to `console`, which is the intended loud failure, not a regression | `apps/api/src/config/index.spec.ts` (extended); called out explicitly in the PR description |
| Other modules' lint pass          | low    | New `no-restricted-imports` rule only fires on an import of `infra/mailer`, which nothing yet has        | `npm run lint`                                        |
| `notifications` module boundary   | low    | New files land inside the existing empty module; no change to who may import `notifications`            | existing `moduleBoundaries` eslint rule                |

## Deliberately not touched

- `apps/api/.env` (gitignored, local-only) still reads `MAIL_PROVIDER=none`. It will be updated
  to `console` as a local convenience alongside this change so the transport is actually
  exercised locally — noted here because the edit is real but invisible to `git diff` (the file
  is gitignored), not because it changes the PR's contents.
- `apps/api/src/infra/webpush/**` — a different channel, a different story (US-031/032).
- No message-composition code for US-028/029/030 — their wording, subject lines and templates
  are each story's own, not invented here.
- `push_subscriptions` table — not needed by `notification_deliveries` (its FKs are `bookings`
  and `user_profiles` only) and not created by this story.
