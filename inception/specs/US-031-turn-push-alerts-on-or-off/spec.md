# US-031 — Turn browser push alerts on or off

|                   |                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-031-turn-push-alerts-on-or-off.md`               |
| **Traces to**     | REQ-026, NFR-006, BR-001.15, V-14                                                    |
| **Screen**        | SCR-004 — Settings (all eight states, ST-01 through ST-08)                          |
| **Covering ADRs** | ADR-001, ADR-002, ADR-004 (exception, §4.6 of the design note), ADR-015 (new)       |
| **Tier**          | Complex                                                                              |
| **Status**        | approved                                                                             |
| **Updated**       | 2026-09-21                                                                           |

## Problem

The system has no way for an employee to opt in to or out of browser push notifications, and no
way for the server to hold a browser's push subscription once it exists. `push_opt_in`
(`user_profiles`) and the VAPID signing keys already exist from Gate 1; nothing reads or writes
either yet, and there is no table to hold a subscription. The Settings screen (SCR-004) does not
exist as a route. This story builds the full round trip: the screen, the two write endpoints, the
one read endpoint, the subscription table, and the browser's service worker — everything US-032
(sending a push) will call into.

Full technical design: [`design-note.md`](design-note.md) (Architect, advisory). This file is the
FR breakdown Gate D1 reads; the design note is where each decision's reasoning lives.

## Functional requirements

| ID     | Requirement                                                                                                                    | Priority | Serves       | Status      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----------- |
| FR-01  | `GET /api/notifications/push` returns `{ pushOptIn, vapidPublicKey }` for the caller's own account only                          | Must     | AC-01, AC-04, AC-08, AC-09 | not started |
| FR-02  | A `push_subscriptions` table exists — `0007_push_subscriptions.sql` — with `endpoint` unique, `on delete cascade` on `user_id`, RLS enabled and forced, no policies | Must     | AC-02, AC-03 | not started |
| FR-03  | `POST /api/notifications/push/opt-in` validates `{ endpoint, p256dh, auth }`, upserts the subscription **then** sets `push_opt_in = true`, and returns `{ pushOptIn }` | Must     | AC-02, AC-07 | not started |
| FR-04  | `POST /api/notifications/push/opt-out` sets `push_opt_in = false` **then** deletes every subscription row for the account, and returns `{ pushOptIn }` | Must     | AC-03, AC-07 | not started |
| FR-05  | The `endpoint` field is rejected unless it is `https:`, carries no URL credentials, and does not resolve to a private, loopback, `.local` or literal-IP host, capped at 2048 characters | Must     | AC-02 (edge case V-14) | not started |
| FR-06  | The Settings screen shows ST-01 (toggle-row skeleton, **Your details** rendered in full) while the `GET` is in flight            | Must     | AC-09        | not started |
| FR-07  | The Settings screen shows ST-02 (off) or ST-04 (on) driven by the `GET` response's `pushOptIn`, with the unconditional email-promise note row always visible | Must     | AC-01, AC-04 | not started |
| FR-08  | Switching the toggle on shows ST-03 (busy, not snapped to on) while the service worker registers, permission is requested, the subscription is created, and `opt-in` is posted | Must     | AC-02        | not started |
| FR-09  | The toggle's rendered position is set **only** from a server response — never from the click itself; there is no optimistic update on this screen | Must     | AC-07        | not started |
| FR-10  | A failed opt-in or opt-out shows ST-07 with **Try again**, naming the current (not the intended) state, and the toggle is left at its last server-confirmed position | Must     | AC-07        | not started |
| FR-11  | `Notification.permission === 'denied'` shows ST-05 (toggle off and disabled) regardless of `pushOptIn`, and no request writes the flag to reconcile it | Must     | AC-05        | not started |
| FR-12  | No push API support in the browser shows ST-06 (toggle replaced, not disabled) and issues **no** `GET` at all                    | Must     | AC-06        | not started |
| FR-13  | A failed `GET` shows ST-08 (toggle replaced by an error, **Your details** still renders in full) with **Try again**             | Must     | AC-08        | not started |
| FR-14  | Turning the toggle off requires no browser permission round-trip and succeeds independent of the browser's permission state    | Must     | AC-03        | not started |
| FR-15  | Neither write route, nor the read route, accepts an account id anywhere in the path or body — the account is always the bearer token's | Must     | AC-10        | not started |
| FR-16  | The Settings screen is usable with no horizontal page scroll at 360px, 768px (520px content column) and 1280px                  | Must     | AC-11        | not started |
| FR-17  | `eslint.config.mjs` restricts `infra/webpush` to `modules/notifications` only, mirroring the existing mailer boundary            | Must     | (supports AC-07's trust boundary) | not started |
| FR-18  | `config()` validates `VAPID_PUBLIC_KEY` (87 chars), `VAPID_PRIVATE_KEY` (43 chars) and `VAPID_SUBJECT` (`mailto:`/`https:`) structurally, refusing to boot on a malformed value | Must     | (NFR-006, boot-time guarantee) | not started |
| FR-19  | `infra/logger`'s redaction list is extended to `endpoint`, `p256dh` and `auth`                                                    | Must     | (security-standards.md) | not started |
| FR-20  | `apps/ui/public/sw.js` installs and activates with no `fetch` handler and no caching; `push`/`notificationclick` are stubbed for US-032 | Must     | AC-02 (worker must exist to subscribe) | not started |
| FR-21  | The account menu / shell gains a **Settings** entry to `/settings`, and the sidebar's `Nav=Employee-Settings` state lights it correctly | Must     | (SCR-004 component table) | not started |

## Non-functional requirements

| ID     | Requirement                                                                                     | Serves      |
| ------ | ------------------------------------------------------------------------------------------------- | ----------- |
| NFR-01 | Graceful degradation: an unsupported browser states so in different words from a denied permission | NFR-006, AC-06 |
| NFR-02 | No subscription key or endpoint ever reaches a log line                                            | security-standards.md |

## Technical constraints

All from the Architect design note, §10 (`design-note.md`) — cited here, not restated:

- C1–C7 are **blocker**: endpoint validation, no account id in any route, the two-step write
  ordering (subscription-then-flag on opt-in; flag-then-delete on opt-out), the toggle set only
  from a server response, redaction, the eslint boundary shape, the migration shape.
- C8–C17 are **major**: the ST-05 precedence rule, ST-06's no-fetch rule, response shapes,
  upsert semantics, `user_agent` handling, opt-out's browser-call independence, config fixtures,
  the service worker's no-caching rule and registration point, both module READMEs.
- The write ordering rule (design note §4.2, §4.3) is the single most important constraint in
  this story: get it backwards and a partial failure produces a toggle that lies (PRIN-5).

## Out of scope

- Sending any push notification. No `push`/`notificationclick` body, no send function in
  `infra/webpush`, no `channel: 'push'` delivery row — all US-032's.
- A ninth state for "flag on, permission `default` on this device" — accepted residual (design
  note §6.4, open item 4).
- Reconciling a revoked browser permission against the account flag — the story's own edge cases
  exclude it.
- A Postgres function for opt-in atomicity — rejected in the design note §4.2; ordered writes are
  the chosen answer.
- Any role check on the new routes — no AC asks for one, and SCR-004's own open question 2
  already settled that admins have no Settings screen.
