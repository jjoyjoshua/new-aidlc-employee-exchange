# US-020 — Find an account in the people list

> The technical expansion of one approved story. The story says what the business needs; this says what the code must do. Written by DEV, reviewed by the human at Gate D1 alongside `implementation-plan.md`.

|                   |                                                   |
| ----------------- | ------------------------------------------------- |
| **Story**         | `inception/stories/user-stories/US-020-find-an-account.md` |
| **Traces to**     | REQ-032, REQ-004, BR-001.11, V-07, NFR-004, NFR-008 |
| **Screen**        | SCR-008 — People. ST-01 Default, ST-02 Loading, ST-03 No match, ST-04 Load error, ST-15 Row menu open, ST-16 Search with matches. ST-05–ST-14 (deactivate/role-change/reset-password flows) belong to US-023–US-027 |
| **Covering ADRs** | ADR-010 (proposed) — the corrected "unbuilt destination control" pattern, see `design-note.md` §8 |
| **Tier**          | Complex                                            |
| **Status**        | approved (Gate D1); Architect design note received — ready for implementation |
| **Updated**       | 2026-09-19                                          |

## Problem

Today no code reads more than one row of `user_profiles` at a time — the only reader is `profileRepository.findById` (`apps/api/src/modules/auth/auth.repository.ts:26-56`), a single-account lookup for session verification. No `modules/users/` folder exists yet; it is reserved by name only (`apps/api/src/modules/README.md:9`, `eslint.config.mjs:16-22`). The sidebar already links to `/admin/people` (`apps/ui/src/components/app-shell/AppShell.tsx:34`), but no route exists there, so the link falls through to the catch-all (`apps/ui/src/routes.tsx:76`) exactly as `/admin/desks` did before US-016.

The system must add a first, admin-only, read-only list of every account — name, email, role, active state — searchable by name or email, with the whole-list composition counts (total/employees/admins/deactivated) that BR-001.11's last-admin safeguard depends on, and a four-action row menu (Edit, role change, Reset password, Deactivate/Activate) whose destinations (US-023 through US-027) do not exist yet.

## Functional requirements

| ID    | Requirement                          | Priority | Serves | Status      |
| ----- | ------------------------------------- | -------- | ------ | ----------- |
| FR-01 | `GET /api/admin/users` returns every account — `id`, `fullName`, `email`, `role`, `isActive` — ordered `fullName` ASC | Must | AC-01 | not started |
| FR-02 | Each row renders its state as an icon-plus-word `StatusChip` reading "Active" or "Deactivated" | Must | AC-01 | not started |
| FR-03 | The signed-in administrator's own row is marked **(you)**, by comparing the row's `id` to the authenticated user's `id` | Must | AC-03 | not started |
| FR-04 | `GET /api/admin/users?q=<term>` filters the returned accounts to those whose `fullName` **or** `email` case-insensitively contains `term` (literal substring, no fuzzy matching) | Must | AC-04 | not started |
| FR-05 | While a search term is active, it stays visible in the field with a clear control, only matching rows render, and a match line above the table reads "Showing {matching} of {total}" | Must | AC-05 | not started |
| FR-06 | The summary line's four counts — total, employees, admins, deactivated — are computed over the **whole** table on every request, independent of `q`, and never recomputed from the filtered set | Must | AC-02, AC-06 | not started |
| FR-07 | A search matching no account renders the retained term, a message naming it, and two actions: **Clear search** and **Add person** | Must | AC-07 | not started |
| FR-08 | The screen has no "no accounts at all" empty state — ST-03 (no search match) is the only reachable empty branch, because the signed-in administrator's own row is always present | Must | AC-08 | not started |
| FR-09 | While loading, skeleton rows render at real row height and the search field is disabled; on failure, an inline `Alert` (tone danger) with **Try again** replaces the table and **Add person** is hidden (not merely disabled) | Must | AC-09 | not started |
| FR-10 | Each row's overflow trigger opens a menu holding exactly four items in a fixed order — **Edit**, a role item labelled by the role it would produce (**Make an admin** / **Make an employee**), **Reset password**, then **Deactivate**/**Activate** last, behind a divider; on a deactivated account the last item reads **Activate** and the role item stays present | Must | AC-10 | not started |
| FR-11 | All four menu items render as real, correctly labelled, correctly ordered controls that are `disabled`, each carrying an accessible reason, because their destinations (US-023, US-024, US-027, US-025/US-026) do not exist yet | Must | AC-10 | not started |
| FR-12 | At ≥768px the open menu is an unscrimmed anchored popover; at 360px it is a scrimmed bottom sheet titled with the account's `fullName` | Must | AC-11 | not started |
| FR-13 | Dismissing the open menu with Escape or a click outside returns focus to the overflow trigger that opened it | Must | AC-12 | not started |
| FR-14 | `GET /api/admin/users` and the `/admin/people` screen are refused to a signed-in Employee — server 403 `admin_only` (inherited from the `/api/admin` mount), client redirect to `/bookings` — and no other account's name or email is returned | Must | AC-13 | not started |

## Non-functional requirements

| ID     | Requirement                                    | Serves           |
| ------ | ----------------------------------------------- | ---------------- |
| NFR-01 | State is never colour-only (NFR-008): the Active/Deactivated chip carries an icon and a word, using the same quiet-neutral role as the desk inventory's Inactive chip | AC-01 |
| NFR-02 | Sixteen states drawn at 360/768/1280 (NFR-004); the 360px bottom sheet carries the credential-free menu content on its own full-width lines, never truncated | AC-11 |
| NFR-03 | `GET /api/admin/users`'s response sets `Cache-Control: private, no-store`, matching the existing PII-sensitivity convention on this router | AC-13 |

## Technical constraints

- The admin guard is reused, not rebuilt: `requireAdmin` (`apps/api/src/http/middleware/require-admin.ts:21-37`) is mounted once at `apps/api/src/http/app.ts:78` (`app.use('/api/admin', deps.requireSession, requireAdmin, deps.adminRouter)`). Every route added to `createAdminRouter` inherits it for free; no per-route check is added (`admin.router.ts:59-63` states the same reasoning for the existing routes).
- `modules/users/` does not exist yet. It is reserved by name in `apps/api/src/modules/README.md:9` ("Account CRUD, role, activate/deactivate and its cascade, admin password reset, search") and in the ESLint module-boundary config (`eslint.config.mjs:16-22`: `users: ['notifications']`). This story is that module's first slice, read-only.
- Search is **server-side**, via a case-insensitive substring match (`ILIKE`) over `full_name` and `email`, per the already-approved architecture: `inception/architecture/db-design.md:351` states plainly, "REQ-032's search on name or email is left as a case-insensitive `LIKE` over `full_name` and `email` with no special index" — a Gate 1 decision that predates and overrides this story's own "as `/architect` decides" wording (`US-020-find-an-account.md:122`). No new index: `db-design.md:349` and `db-design.md:352-355` both call out that a sequential scan over "hundreds of accounts, not millions" is the deliberate choice, and adding a trigram index now would be speculative generality.
- `.ilike()` / `.or()` are new ground for this codebase: no existing repository uses either (verified — no match in `apps/api/src`). Follow the Supabase JS shape `.or('full_name.ilike.%term%,email.ilike.%term%')`.
- No migration: `user_profiles` (`supabase/migrations/0001_user_profiles.sql:27-44`) and its supporting index `user_profiles_is_active_role_idx` on `(is_active, role)` (`0001_user_profiles.sql:52`) already exist; that index's own migration comment already earmarks it for "the people list's default ordering (REQ-032, US-020)" (`0001_user_profiles.sql:50-52`).
- Contract conventions: request/query schemas `.strict()`, response schemas NOT `.strict()` — additive-safe by design (`libs/contracts/src/desks.ts:51-52`, `libs/contracts/src/auth.ts:78-85`). Field names mirror `authenticatedUserSchema` (`libs/contracts/src/auth.ts:64-75`): `id`, `fullName`, `email`, `role`.
- `StatusChip` gains a fourth discriminant, `kind: 'account'`, distinct from `kind: 'inventory'` (US-016) because AC-01 requires the word "Deactivated," not "Inactive" — see `decisions.md` D-04.
- No overflow-menu, popover, or bottom-sheet component exists in `apps/ui/src/components/` today (verified by listing that folder — only `Dialog`/`ConfirmDialog`, both scrimmed and modal at every width). AC-10/AC-11 introduce a genuinely new interaction shape: an **unscrimmed** anchored popover at ≥768px and a scrimmed bottom sheet only at 360px. See `decisions.md` D-05.
- `RequireRole` (`apps/ui/src/lib/auth/require-role.tsx:22`) needs no change; reused verbatim, the same way `/admin/desks` reuses it (`apps/ui/src/routes.tsx:66-73`).
- `/admin/people`'s nav entry already exists in `AppShell.tsx:34`'s `ADMIN_NAV`; the route itself is not wired in `apps/ui/src/routes.tsx` and falls through to the catch-all (`routes.tsx:76`) today, exactly as `/admin/desks` did before US-016 (`routes.tsx:64-65`'s own comment cites that precedent).

## Out of scope

- Any working destination for **Edit**, the role-change item, **Reset password**, or **Deactivate**/**Activate** — those are US-023, US-024, US-027, and US-025/US-026 respectively. This story renders the four menu items disabled only, mirroring `US-016/D-02`'s "visible-but-disabled unbuilt control" pattern.
- SCR-009 (the user create/edit form) and every dialog state ST-05–ST-14 (deactivate/role-change/reset-password confirmations, refusals, and results) — those belong to the destination stories above.
- Pagination — the story's own edge case: "at 38 people it does not need one," unlike bookings (REQ-011) or the employee's own list (REQ-009).
- Fuzzy or partial-word matching — literal, case-insensitive substring only, per the story's own edge case.
- A migration — `user_profiles` and its supporting index already exist.
- Wiring this screen to `apps/ui/src/lib/data-refresh.ts`.
- An ADR for the "visible-but-disabled unbuilt control" pattern or for the new menu/bottom-sheet component — both are DEV decisions here (`decisions.md` D-03, D-05); promoting either to an ADR is the Architect's call in the design note.
