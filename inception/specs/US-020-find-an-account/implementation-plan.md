# US-020 — implementation plan

> **The Gate D1 artifact.** The human reads this file and `impact-analysis.md`, then approves in chat. DEV stamps the approval below; the developer commits the stamp. No code is written before that stamp exists.

|           |                                                  |
| --------- | ------------------------------------------------ |
| **Story** | `inception/stories/user-stories/US-020-find-an-account.md` |
| **Spec**  | `spec.md`                                        |
| **Tier**  | Complex                                           |

## Approval — Gate D1

| Field                | Value           |
| --------------------- | --------------- |
| Status               | **approved**    |
| Approved by          | Joy Joshua <joy_j@trigent.com> |
| Approved on          | 2026-09-19      |
| Plan commit approved | *uncommitted at approval* — base `3a08edb9e32e2005060eaaf1886bdfe63b190568` |

`Approved by` is the human's name and email from `git config user.name` / `user.email`; if either is unset, ask them rather than writing `unknown`. `Plan commit approved` is the SHA of the commit holding this plan **as they read it**, the commit before this stamp. That SHA is what makes the approval verifiable: a reviewer at D2 runs `git diff <sha> -- <this file>` and sees whether the plan changed after approval. The name is self-asserted, so it is attribution, not authentication.

**Architect design note received and applied.** See `design-note.md`. It confirms D-01, D-02, D-04, D-05, D-06 as written, refines D-03 (menu items are `aria-disabled` and focusable, never HTML `disabled` — a menu of disabled buttons has nothing for a keyboard or screen-reader user to reach), and asks for the amendments below (its §11, A1–A15), folded into the Steps that follow. `knowledge/decisions/ADR-010-unbuilt-destination-controls.md` (proposed) records the corrected D-03 pattern for reuse by US-021–US-027.

## Steps

Ordered. Each step names the files it touches, the `FR-##` it advances, and how it is verified. Test-first per acceptance criterion: the failing test named `... (US-020/AC-##)` comes before the code that turns it green.

### Step 1 — Contract: `libs/contracts/src/users.ts`

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-01, FR-04, FR-06, FR-14                                    |
| Files    | `libs/contracts/src/users.ts` (create — `adminUserSchema` (`id`, `fullName`, `email`, `role`, `isActive`, mirroring `authenticatedUserSchema`'s field names), `adminUsersQuerySchema` (`{ q: z.string().trim().min(1).max(100).optional() }.strict()` — the `.max(100)` per design note A15), `adminSummarySchema` (`{ total, employees, admins, deactivated }`, all `z.number().int().nonnegative()`), `adminUsersResponseSchema` (`{ users: z.array(adminUserSchema), summary: adminSummarySchema }` — **no top-level `total`; `summary.total` is the only total, per design note A5/§3.2**, NOT `.strict()`), `users.spec.ts` (create — parses a full account, rejects an unknown query field, rejects a `q` over 100 chars, rejects a response missing `summary`) |
| Verify   | `npm test -w libs/contracts` — new spec passes |

### Step 2 — Barrel export

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | (enables every later step)                                    |
| Files    | `libs/contracts/src/index.ts` (modify — add `export * from './users.js';`) |
| Verify   | `npm run typecheck -w libs/contracts` — clean |

### Step 3 — Repository: `apps/api/src/modules/users/users.repository.ts`

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-01, FR-04, FR-06                                            |
| Files    | `apps/api/src/modules/users/users.repository.ts` (create — `listAccounts(q?: string)`: `.select('id, full_name, email, role, is_active').order('full_name')`, and when `q` is present, `.or(buildSearchFilter(q))`; `getSummaryCounts()`: `.select('role, is_active')` over the WHOLE table, no filter, tallied by the caller), `apps/api/src/modules/users/search-filter.ts` (create, per design note A1/§2.3 — one named pure function `buildSearchFilter(q)`: escape `\`, then `%`, then `_` in `q` for the ILIKE pattern, then double-quote the value and escape `"`/`\` for PostgREST's filter grammar, producing `full_name.ilike."%term%",email.ilike."%term%"`), `search-filter.spec.ts` (create — one case per metacharacter: `_`, `%`, `.`, `,`, `"`, `\`, asserting the escaped/quoted output), `users.repository.spec.ts` (create — a recording fake asserting the exact `.or()` string for a plain term via `buildSearchFilter`, and that `getSummaryCounts` issues no `.or()`/`.ilike()` call at all) |
| Verify   | `npm test -w apps/api -- users.repository search-filter` — tests named `(US-020/AC-04)` and `(US-020/AC-06)` pass |

### Step 3a — Gated real-Postgres case for the search filter (design note A2)

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-04                                                          |
| Files    | `apps/api/src/modules/admin/admin.concurrency.spec.ts` (modify — add one `describe.runIf(RUN)` case, using the existing gate (`RUN_BOOKINGS_CONCURRENCY_TEST=1` at `:29`, `:83`), seeding an account whose name contains `_` and one whose email contains a `.`, proving the search matches the literal substring and does NOT wildcard-match on `_`, and that a `.`/`"`/`\` in `q` does not alter the filter's column scope — a recording fake cannot prove this, only real Postgres can, per design note §2.3) |
| Verify   | `RUN_BOOKINGS_CONCURRENCY_TEST=1 npm test -w apps/api -- admin.concurrency` — new case named `(US-020/AC-04)` passes; output pasted into the PR |

### Step 4 — Service: `apps/api/src/modules/users/users.service.ts`

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-01, FR-06                                                   |
| Files    | `apps/api/src/modules/users/users.service.ts` (create — `listAccounts(q?: string)` runs `listAccounts(q)` and `getSummaryCounts()` via `Promise.all` (never sequentially — `getSummaryCounts` must not be affected by, or wait needlessly on, the filtered read), maps rows to the wire shape (`fullName` from `full_name`, `isActive` from `is_active`), tallies `getSummaryCounts()`'s rows into `{ total, employees, admins, deactivated }` in the service — never a PostgREST aggregate — mirroring the `Map`-tally shape `desks.service.ts:64-65` uses for its own count), `users.service.spec.ts` (create — a search term matching two of five seeded accounts returns those two AND a summary reflecting all five; an empty/absent `q` returns everyone; the summary is IDENTICAL whether or not `q` is supplied, for a fixed seed; **`employees + admins === total` and `deactivated` counts rows inside `total`, not a fourth bucket, for a seed that includes a deactivated account — design note A10/§2.2**, the invariant a "count active rows only" bug would otherwise pass) |
| Verify   | `npm test -w apps/api -- users.service` — tests named `(US-020/AC-02)`, `(US-020/AC-04)`, `(US-020/AC-06)` pass |

### Step 5 — Wire the service into composition

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-01                                                          |
| Files    | `apps/api/src/composition.ts` (modify — add `createUsersService({ users: usersRepository })` and pass `users` into `createAdminRouter({...})`) |
| Verify   | `npm run typecheck -w apps/api` — no type error at the call site |

### Step 6 — Route: `GET /api/admin/users`

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-01, FR-04, FR-06, FR-14                                     |
| Files    | `apps/api/src/modules/admin/admin.router.ts` (modify — `AdminRouterDeps` gains `users: UsersService`; `router.get('/users', ...)` parses `req.query` with `adminUsersQuerySchema` (a parse failure returns the existing `invalid_request` branch, same as `allBookingsQuerySchema` — no new error code, per design note §3.3), calls `users.listAccounts(parsed.data.q)`, sets `Cache-Control: private, no-store`, `res.json(result)`; per design note §3.4/§8.2 item 4, either move the `/bookings` handler's "most sensitive read in the system" comment here or give this handler its own — not both claiming it), `admin.routes.spec.ts` (modify — extend the four existing `DesksRepository`-adjacent stub harnesses with a `users` seam; new cases: AC-01 full shape asserted with **`toEqual` on the exact response body, never `toMatchObject`** (design note A3/§7 — the response schema is not `.strict()`, so this is the only thing stopping a leaked column such as `must_change_password`), AC-04 filtered by `q`, AC-06 summary unaffected by `q`, AC-13 a 403 `admin_only` for an Employee token with the body asserted to contain no `email`/`fullName` value at all) |
| Verify   | `npm test -w apps/api -- admin.routes` — tests named `(US-020/AC-01)`, `(US-020/AC-04)`, `(US-020/AC-06)`, `(US-020/AC-13)` pass |

### Step 7 — `StatusChip`'s fourth variant

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-02, NFR-01                                                  |
| Files    | `apps/ui/src/components/status-chip/StatusChip.tsx` (modify — add `{ kind: 'account'; status: 'active' \| 'inactive' }` to `StatusChipProps`, export `ACCOUNT_LABEL = { active: 'Active', inactive: 'Deactivated' }`, render via the SAME `.status-chip--active`/`.status-chip--inactive` classes `kind: 'inventory'` uses per `decisions.md` D-04 — no new CSS), `StatusChip.spec.tsx` (modify — `kind="account"` renders "Active"/"Deactivated" with an icon; the inactive variant carries no danger-family class) |
| Verify   | `npm test -w apps/ui -- StatusChip` — test named `(US-020/AC-01)` passes |

### Step 8 — UI fetch: `apps/ui/src/lib/fetch-users.ts`, `use-users.ts`

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-01, FR-04, FR-05, FR-06                                     |
| Files    | `apps/ui/src/lib/fetch-users.ts` (create — `createFetchUsers(api)` returning a `(q, signal) => Promise<UsersOutcome>`, mirroring `fetch-desks.ts`'s shape), `apps/ui/src/lib/use-users.ts` (create — `useUsers(fetchUsers)` keeps the **one-argument** fetcher signature per design note A8/§7.5, mirroring `Desks.tsx:110-117`'s `stableFetch` device; re-fetches whenever the fetcher identity changes, state shape `{ status: 'loading' | 'ready' | 'error', users, summary }` — no `total`, per A5), `use-users.spec.ts` (create — a fetcher-identity change triggers a new fetch call and an in-flight one is aborted, mirroring `use-desks.ts`'s abort-controller discipline) |
| Verify   | `npm test -w apps/ui -- use-users` — new tests pass |

### Step 9 — Screen copy and the search field's icon asset

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-05, FR-06, FR-07, FR-11                                     |
| Files    | `apps/ui/src/screens/people/copy.ts` (create — `summaryLine(summary)` → "N people · M employees, K admins · J deactivated"; `matchLine(matching, total)` → "Showing {matching} of {total}" where `total` is always `summary.total`, never a wire-level `total` (A5); `noMatchMessage(term)` → 'Nobody matches "{term}".'; `disabledMenuItemReason` per the corrected D-03 (design note §6, ADR-010), same placeholder string `US-016/D-02` used: "Not available yet — coming in a later release."; role-item label `roleActionLabel(currentRole)` → "Make an admin" / "Make an employee"; `rowMenuTriggerLabel(fullName)` → "Actions for {fullName}", per design note A9/§5.4), `copy.spec.ts` (create), `apps/ui/src/assets/icon-search.svg` (create, per design note A6/§7.1 — Figma node `Icon / search`, cloned from `Icon / block`; download the asset before this step) |
| Verify   | `npm test -w apps/ui -- screens/people/copy` — new tests pass |

### Step 10 — `AccountRow`

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-02, FR-03, FR-10                                            |
| Files    | `apps/ui/src/screens/people/AccountRow.tsx` (create — table `<tr>` at ≥1024px, card `<li>` below, mirroring `DeskInventoryRow`'s dual-tree device; renders name/email/role/`StatusChip kind="account"`/the overflow trigger; appends "(you)" when `account.id === currentUserId`, an accessible-name suffix not a separate DOM node so a screen reader announces it as part of the name; the overflow trigger carries `aria-label={rowMenuTriggerLabel(account.fullName)}`, `aria-haspopup="menu"`, `aria-expanded` — design note A9/§5.4, so forty rows do not read as forty identical "Actions" stops), `AccountRow.spec.tsx` (create — AC-01's four fields plus chip, AC-03's "(you)" marker on the matching id only, the trigger's per-row accessible name) |
| Verify   | `npm test -w apps/ui -- AccountRow` — tests named `(US-020/AC-01)`, `(US-020/AC-03)` pass |

### Step 11 — `AccountRowMenu` (new component, D-05)

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-10, FR-11, FR-12, FR-13                                     |
| Files    | `apps/ui/src/screens/people/AccountRowMenu.tsx` (create — **one DOM at every width** per design note §5.2 (no `matchMedia` anywhere in this codebase, and this story does not add the first one): an `.people-menu__overlay` (transparent ≥768px, `--c-scrim` below, via CSS only) containing a `role="menu"` popover anchored to the row at ≥768px and presented as a bottom sheet below it, titled by a `<p>` element that is visually hidden ≥768px and visible at 360px; holds the four items as `role="menuitem"` `<button>`s in fixed order, **each `aria-disabled="true"` and left focusable — never the HTML `disabled` attribute** (design note A4/§6: a menu of disabled buttons has no focusable element for AC-12's focus return or arrow-key movement to work with), `onClick` returning early, each carrying `title` + a visually-hidden reason span per `copy.ts`'s `disabledMenuItemReason`; **arrow-key movement between the four items** (design note A9/§5.4); Escape and a click on the overlay both dismiss and return focus explicitly to the trigger ref passed in — not `document.activeElement` restore), `AccountRowMenu.spec.tsx` (create — AC-10's fixed order and the deactivated-account label swap, each item asserted focusable + `aria-disabled` + carrying its reason (titled with the story that deletes it: US-023/US-024/US-027/US-025+US-026), AC-11's scrim/anchor CSS assertion by viewport at the 768px boundary, AC-12's focus-return on Escape and on outside click, arrow-key traversal) |
| Verify   | `npm test -w apps/ui -- AccountRowMenu` — tests named `(US-020/AC-10)`, `(US-020/AC-11)`, `(US-020/AC-12)` pass |

### Step 12 — `AccountSkeletonRow`

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-09                                                          |
| Files    | `apps/ui/src/screens/people/AccountSkeletonRow.tsx` (create — table/card variants at real row height, mirroring `DeskInventorySkeletonRow`) |
| Verify   | visual check against the Figma frame; behaviour covered by `People.spec.tsx` in Step 13 |

### Step 13 — `People` screen

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-05, FR-06, FR-07, FR-08, FR-09                              |
| Files    | `apps/ui/src/screens/people/People.tsx` (create — owns the search field's typed and committed term (see Open questions — debounce), composed from the existing `TextField` and its `trailing` slot (clear `×`) with `icon-search.svg` rendered screen-side over the field's leading padding — **no `leading` prop added to `TextField`** (design note A6/§7.1); the summary line (`role="status"`, from `summary`, **never** from the filtered `users` length or a wire-level `total` — A5); the match line `Showing {users.length} of {summary.total}` (only when a committed term is active); the table/card trees of `AccountRow`; tracks `hasLoadedOnce` and disables the search field only while **no list has ever loaded**, not on every `loading` transition (design note A7/§7.4 — otherwise a committed search mid-session disables the field and drops focus/term, contradicting AC-05/ST-16); the loading/error/no-match/ready branches per SCR-008 ST-01–ST-04 and ST-16), `People.spec.tsx` (create — one case per AC: AC-02, AC-05, AC-06's "summary unchanged under search," AC-07's retained term plus two actions, AC-08's structural absence of a "no accounts" branch — a negative assertion that can fail, not merely the absence of an unwritten component, AC-09's disabled search field while loading **and** the field staying enabled during a committed re-search on an already-loaded list, hidden **Add person** on error) |
| Verify   | `npm test -w apps/ui -- screens/people/People` — tests named `(US-020/AC-02)`, `(US-020/AC-05)`, `(US-020/AC-06)`, `(US-020/AC-07)`, `(US-020/AC-08)`, `(US-020/AC-09)` pass |

### Step 14 — Responsive CSS

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-12                                                          |
| Files    | `apps/ui/src/screens/people/people.css` (create — **two independent boundaries, not one** (design note A11/§7.4): table shown / card list `display:none` above **1024px** and the reverse below, mirroring `desks.css`'s pattern; separately, `.people-menu__overlay`'s scrim is transparent at **≥768px** and `--c-scrim` below it, with the menu anchored/positioned above 768 and full-width-sheet below — so 768–1023px renders cards **and** an anchored popover, a band a single-breakpoint implementation would get wrong; `.people__visually-hidden` utility, screen-private per the existing no-global-utility rule) |
| Verify   | `npm test -w apps/ui -- screens/people` — the CSS-boundary assertions from Step 11 and Step 13 pass for **both** the 1024px and 768px boundaries, asserted separately |

### Step 15 — Route

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | FR-14                                                          |
| Files    | `apps/ui/src/routes.tsx` (modify — add `<Route path="/admin/people" element={<RequireRole role="admin"><People /></RequireRole>} />` beside `/admin/desks`) |
| Verify   | `npm test -w apps/ui -- People` — a rendered-at-`/admin/people` test with an Employee session redirects to `/bookings`; with an Admin session it renders the screen |

### Step 16 — Documentation and traceability closeout

| Field    | Value                                                      |
| -------- | ------------------------------------------------------------ |
| Advances | (all — required by `aidlc-check`)                              |
| Files    | `apps/api/src/modules/users/README.md` (create — record the module's first slice, the server-side-search decision and its `db-design.md:351` citation, the explicit select list and why (design note §7), the forward constraint that US-023–US-027 write to this same module including the deactivation cascade), `apps/ui/src/components/dialog/Dialog.tsx` (modify — docblock only, per design note A12/§8.2 item 1: record that US-020 evaluated a `scrim?: boolean` prop and declined it — an anchored, non-modal menu is a different widget; `scrim`/`anchor`/`modal` props are refused by design, not overlooked), `apps/ui/src/components/status-chip/StatusChip.tsx` (modify — docblock only, per A12/§8.2 item 2: record the fourth `kind: 'account'` family and the correction to US-016 §4.2's `'deactivated'` status-value prediction), `apps/api/src/modules/admin/admin.router.ts` (modify — docblock only, per A12/§8.2 item 4: move or duplicate the "most sensitive read in the system" comment so `/bookings` and `/users` don't both claim it unqualified), `knowledge/decisions/ADR-010-unbuilt-destination-controls.md` (already drafted at Gate D2 prep, per A13 — confirm it lands in this PR; mark US-016 open item 6 and this plan's Open question 5 resolved by it), `inception/specs/index.md` (modify — add the US-020 row), `knowledge/traceability/manifest.json` (modify — add US-020's `requirements[]`/`acs[]`/`tests[]` entries), `inception/specs/US-020-find-an-account/traceability.md` (modify — every row's Status becomes `implemented` with real file/test paths) |
| Verify   | `npm run check` — `aidlc-check` passes; `npm run lint && npm run typecheck && npm test` — full suite green |

## Rollback

Revert the PR. No migration and no data write exists to roll back — the change is additive on the wire (`libs/contracts/src/users.ts` is a new file; `admin.router.ts` gains a route and a dependency, no existing handler is edited) and every UI file is new except `StatusChip.tsx` (an additive discriminated-union member) and `routes.tsx`/`AppShell.tsx`-adjacent wiring (`AppShell.tsx` itself is not touched — its `ADMIN_NAV` entry predates this story). Reverting the PR removes the route, the endpoint, and the module folder cleanly.

## Open questions

| Question                                         | Owner         | Blocks |
| ------------------------------------------------ | ------------- | ------ |
| Whether `GET /api/admin/users` re-fetches on every keystroke or a debounced/committed term (placeholder: 300ms debounce, committed on blur or Enter as a fallback) | `/ux` | none — ships with the 300ms default in `use-users.ts` (design note confirms 300ms as reasonable, §12 item 3) |
| Exact reason string on each disabled menu item (placeholder, reused verbatim from `US-016/D-02`: "Not available yet — coming in a later release.") | `/ux` + PO | none — ships with the placeholder |
| ~~Default ordering~~ **Resolved by design note §12 item 4: `full_name` ASC (D-07), confirmed.** | — | resolved |
| ~~Whether `AccountRowMenu` should be a `Dialog` variant~~ **Resolved by design note §5: no.** Build it independently — five new props and a role change on a Complex-surface shared component with one caller; `Dialog.tsx`'s docblock records the refusal (Step 16) | — | resolved |
| ~~Whether the "visible-but-disabled unbuilt control" pattern should become an ADR~~ **Resolved by design note §8.1: yes — `ADR-010-unbuilt-destination-controls.md` (proposed), landing in this PR (Step 16).** | Joy Joshua (ADR decider) | ADR status stays "proposed" until the human accepts it at Gate D2 |
| Whether the `.or()` filter's gated real-Postgres case (Step 3a) should run in CI or stay a local pre-merge invocation like the two existing `RUN_BOOKINGS_CONCURRENCY_TEST=1` cases | Joy Joshua + `/devops` | none — the case is written either way; output pasted into the PR regardless |
| Whether the search field's magnifier belongs on `TextField` as a `leading` prop instead of a screen-side icon, if a second screen turns out to need one soon (SCR-009) | `/ux` + DEV | none — ships with the screen-side icon (design note §7.1) |

None of these block Step 1–16: each has a shipped default recorded above, in `decisions.md`, or in `design-note.md`.
