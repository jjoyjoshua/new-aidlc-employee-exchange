# US-012 — implementation plan

> **The Gate D1 artifact.** The human reads this file, `spec.md`, and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                                                |
| --------- | ------------------------------------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-012-refresh-booking-list-on-focus.md`       |
| **Spec**  | `spec.md`                                                                       |
| **Tier**  | Complex — `ai/standards/task-surfaces.md:61-64` (the data-fetching layer's configuration is Complex regardless of the five framework surfaces; see `impact-analysis.md`) |

## Revision note

This plan replaces the Medium-tier, per-screen-hook version halted on 2026-09-19 (see `change-log.md`). The Architect's [ADR-008](../../../knowledge/decisions/ADR-008-focus-refresh-shared-module.md) settled the design: one shared singleton module, `apps/ui/src/lib/data-refresh.ts`, not a hook local to `my-bookings/`. This is a fresh Gate D1 ask — the earlier `go` was for a different technical approach.

## Approval — Gate D1

| Field                | Value                                                                        |
| -------------------- | ----------------------------------------------------------------------------- |
| Status               | **approved**                                                                   |
| Approved by          | Joy Joshua <joy_j@trigent.com>                                                 |
| Approved on          | 2026-09-19                                                                     |
| Plan commit approved | *uncommitted at approval* — base `bfc942fedce0d2d34ba4008b707037021a57f27b`    |

`Approved by` is the human's name and email from `git config user.name` / `user.email`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**, the commit before this stamp. The name is self-asserted, so it is attribution, not authentication.

## Steps

Ordered. Each step names the files it touches, the `FR-##` it advances (`spec.md`), and how it is verified. Test-first per acceptance criterion: the failing test named `... (US-012/AC-##)` comes before the code that turns it green.

### Step 1 — `apps/ui/src/lib/data-refresh.ts`: the shared focus-regain module

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-02, FR-03                                                                                          |
| Files    | `apps/ui/src/lib/data-refresh.ts` (create), `apps/ui/src/lib/data-refresh.spec.ts` (create), `apps/ui/src/lib/README.md` (modify — point "when it lands" at this file) |
| Verify   | `npm test -w apps/ui -- data-refresh.spec.ts` — expected: `onRegainFocus`/`useFocusRefresh` fire once on `document.visibilitychange` → `'visible'`; fire once on a bare `window` `focus`; fire exactly once when both land for the same regain (coalesced via microtask); a second, later regain still fires; multiple simultaneous subscribers each get called from the ONE underlying listener pair (assert via a spy counting `addEventListener` calls, not just callback counts); a subscriber added after another unsubscribes does not resurrect a stale coalescing flag |

### Step 2 — `useMyBookings`: `refreshQuietly()`

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-04, FR-05, FR-06, FR-09                                                                                   |
| Files    | `apps/ui/src/screens/my-bookings/use-my-bookings.ts` (modify), `apps/ui/src/screens/my-bookings/use-my-bookings.spec.ts` (modify) |
| Verify   | `npm test -w apps/ui -- use-my-bookings.spec.ts` — expected, one case per: a successful `refreshQuietly()` merges the fresh default page into `items` by `id` (existing rows update in place — status included — new ids prepend), never passes through `'loading'` (FR-04); `nextBefore` and any `loadOlder()`-appended page are untouched (FR-05); a failing `refreshQuietly()` sets `quietRefreshFailed: true` and leaves `items`/`today`/`nextBefore` unchanged (FR-06); a second call while one is in flight is a no-op (FR-09); a call while `status !== 'ready'` is a no-op |

### Step 3 — Copy

| Field    | Value                                                                    |
| -------- | --------------------------------------------------------------------------- |
| Advances | FR-07                                                                        |
| Files    | `apps/ui/src/screens/my-bookings/copy.ts` (modify), `apps/ui/src/screens/my-bookings/copy.spec.ts` (modify) |
| Verify   | `npm test -w apps/ui -- copy.spec.ts` — expected: the quiet-refresh failure message reads as unobtrusive and retryable, not an error page |

### Step 4 — `MyBookings`: wire the refresh, suppress during the dialog, show the failure banner

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | FR-01, FR-04, FR-06, FR-07, FR-08                                                                             |
| Files    | `apps/ui/src/screens/my-bookings/MyBookings.tsx` (modify), `apps/ui/src/screens/my-bookings/MyBookings.spec.tsx` (modify) |
| Verify   | `npm test -w apps/ui -- MyBookings.spec.tsx` — expected, one case per: regaining focus re-fetches and re-renders (AC-01); a row cancelled elsewhere flips to Cancelled with no Cancel action on the next regain (AC-02); no skeleton appears and the list is not unmounted/remounted during the refresh (AC-03); a failed refresh keeps the prior list on screen and shows the retryable `Alert` (AC-04); regaining focus while the cancel dialog is open leaves the dialog open with its item unchanged, and no refresh fires until the dialog closes (AC-05, FR-08) |

### Step 5 — Traceability, manifest, spec-index

| Field    | Value                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Advances | (documentation of the above)                                                                                 |
| Files    | `traceability.md` (modify — flip each row to `implemented` with real `file:line`), `knowledge/traceability/manifest.json` (modify — `US-012.tests[]` and `US-012.decisions` → add `ADR-008`), `inception/specs/index.md` (modify — status → `implemented`) |
| Verify   | `node tools/aidlc-check.mjs` — expected: all checks pass, including check 4 (manifest `tests[]` parses) and check 16 (spec package completeness — `spec.md` now present closes the error this package showed before Step 1 started) |

### Step 6 — Full verification pass

| Field    | Value                                    |
| -------- | ----------------------------------------- |
| Advances | (all)                                      |
| Files    | none (verification only)                   |
| Verify   | `npm run lint`, `npm run typecheck`, `npm test` — expected: all green, pasted into the PR description verbatim |

## Rollback

Revert the PR. No schema or config change. `data-refresh.ts` is new and additive; a revert removes it along with its one caller (`MyBookings.tsx`), leaving no dangling reference.

## Open questions

None blocking. The AC-06/SCR-005 gap (`decisions.md` D-01) and the deferred cache-invalidation half (ADR-008) are recorded as scoped-out, not open — both already have an owner and a trigger for when they become someone's next story.
