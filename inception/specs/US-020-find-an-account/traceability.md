# US-020 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                  |
| ----------- | ------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-020-find-an-account.md` |
| **Updated** | 2026-09-19                                       |

## Requirement to code

| Req    | File            | Symbol / location | Proven by           | Status      |
| ------ | --------------- | ------------------ | -------------------- | ----------- |
| FR-01  | `apps/api/src/modules/admin/admin.router.ts`, `apps/api/src/modules/users/users.service.ts`, `apps/api/src/modules/users/users.repository.ts` | `GET /users`, `listAccounts` | `apps/api/src/modules/admin/admin.routes.spec.ts`, `apps/api/src/modules/users/users.service.spec.ts`, `apps/api/src/modules/users/users.repository.spec.ts` | implemented |
| FR-02  | `apps/ui/src/components/status-chip/StatusChip.tsx` | `kind: 'account'`, `ACCOUNT_LABEL` | `apps/ui/src/components/status-chip/StatusChip.spec.tsx`, `apps/ui/src/screens/people/AccountRow.spec.tsx` | implemented |
| FR-03  | `apps/ui/src/screens/people/AccountRow.tsx` | `displayName` | `apps/ui/src/screens/people/AccountRow.spec.tsx` | implemented |
| FR-04  | `apps/api/src/modules/users/search-filter.ts`, `apps/api/src/modules/users/users.repository.ts` | `buildSearchFilter`, `listAccounts` | `apps/api/src/modules/users/search-filter.spec.ts`, `apps/api/src/modules/users/users.repository.spec.ts`, `apps/api/src/modules/admin/admin.concurrency.spec.ts` | implemented |
| FR-05  | `apps/ui/src/screens/people/People.tsx` | `PeopleContent`'s search field state | `apps/ui/src/screens/people/People.spec.tsx` | implemented |
| FR-06  | `apps/api/src/modules/users/users.service.ts` | `tallySummary`, `Promise.all` | `apps/api/src/modules/users/users.service.spec.ts`, `apps/ui/src/screens/people/People.spec.tsx` | implemented |
| FR-07  | `apps/ui/src/screens/people/People.tsx`, `apps/ui/src/screens/people/copy.ts` | `PeopleReady`, `noMatchMessage` | `apps/ui/src/screens/people/People.spec.tsx`, `apps/ui/src/screens/people/copy.spec.ts` | implemented |
| FR-08  | `apps/ui/src/screens/people/People.tsx` | `PeopleReady` (single empty branch) | `apps/ui/src/screens/people/People.spec.tsx` | implemented |
| FR-09  | `apps/ui/src/screens/people/People.tsx`, `apps/ui/src/screens/people/AccountSkeletonRow.tsx` | loading/error branches | `apps/ui/src/screens/people/People.spec.tsx` | implemented |
| FR-10  | `apps/ui/src/screens/people/AccountRowMenu.tsx` | fixed item order | `apps/ui/src/screens/people/AccountRowMenu.spec.tsx` | implemented |
| FR-11  | `apps/ui/src/screens/people/AccountRowMenu.tsx`, `apps/ui/src/screens/people/copy.ts` | `aria-disabled`, `disabledMenuItemReason` | `apps/ui/src/screens/people/AccountRowMenu.spec.tsx`, `apps/ui/src/screens/people/copy.spec.ts` | implemented |
| FR-12  | `apps/ui/src/screens/people/people.css` | `.people-menu__overlay`'s 768px query | `apps/ui/src/screens/people/AccountRowMenu.spec.tsx` | implemented |
| FR-13  | `apps/ui/src/screens/people/AccountRowMenu.tsx` | `dismissAndReturnFocus` | `apps/ui/src/screens/people/AccountRowMenu.spec.tsx` | implemented |
| FR-14  | `apps/api/src/http/middleware/require-admin.ts` (inherited, unmodified), `apps/ui/src/lib/auth/require-role.tsx` (reused, unmodified), `apps/ui/src/routes.tsx` | `/admin/people` route | `apps/api/src/modules/admin/admin.routes.spec.ts`, `apps/ui/src/screens/people/People.spec.tsx` | implemented |
| NFR-01 | `apps/ui/src/components/status-chip/StatusChip.tsx` | icon + word, `kind: 'account'` | `apps/ui/src/components/status-chip/StatusChip.spec.tsx` | implemented |
| NFR-02 | `apps/ui/src/screens/people/people.css`, `apps/ui/src/screens/people/AccountRowMenu.tsx` | `.people-menu__title` | `apps/ui/src/screens/people/AccountRowMenu.spec.tsx` (title present/labelling); full-width no-truncation at 360px is a visual check, not automated in jsdom | implemented |
| NFR-03 | `apps/api/src/modules/admin/admin.router.ts` | `Cache-Control: private, no-store` on `/users` | `apps/api/src/modules/admin/admin.routes.spec.ts` | implemented |

Every `FR-##` and `NFR-##` in `spec.md` has a row here. `aidlc-check` check 16 enforces it.

## Key symbols

| Symbol | File |
| ------ | ---- |
| `adminUserSchema`, `adminUsersQuerySchema`, `adminUsersResponseSchema`, `adminSummarySchema` | `libs/contracts/src/users.ts` |
| `buildSearchFilter` | `apps/api/src/modules/users/search-filter.ts` |
| `createUsersService`, `tallySummary` | `apps/api/src/modules/users/users.service.ts` |
| `UsersRepository`, `listAccounts`, `getSummaryCounts` | `apps/api/src/modules/users/users.repository.ts` |
| `GET /api/admin/users` | `apps/api/src/modules/admin/admin.router.ts` |
| `ACCOUNT_LABEL`, `kind: 'account'` | `apps/ui/src/components/status-chip/StatusChip.tsx` |
| `createFetchUsers` | `apps/ui/src/lib/fetch-users.ts` |
| `useUsers` | `apps/ui/src/lib/use-users.ts` |
| `summaryLine`, `matchLine`, `noMatchMessage`, `disabledMenuItemReason`, `roleActionLabel`, `rowMenuTriggerLabel` | `apps/ui/src/screens/people/copy.ts` |
| `AccountRow`, `AccountsTableHead` | `apps/ui/src/screens/people/AccountRow.tsx` |
| `AccountRowMenu` | `apps/ui/src/screens/people/AccountRowMenu.tsx` |
| `AccountSkeletonRow` | `apps/ui/src/screens/people/AccountSkeletonRow.tsx` |
| `People` | `apps/ui/src/screens/people/People.tsx` |
| `/admin/people` route | `apps/ui/src/routes.tsx` |
