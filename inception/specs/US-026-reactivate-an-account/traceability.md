# US-026 — traceability

> Where each requirement actually lives in the code. Filled as the code lands, in the same commit, not reconstructed afterwards, when it becomes fiction.
>
> This is not `knowledge/traceability/manifest.json`. The manifest records which test **files** prove an AC and is what `aidlc-check` parses; this table records where in the code each `FR-##` **is**, and is what a human reads.

|             |                                                                    |
| ----------- | ------------------------------------------------------------------ |
| **Story**   | `inception/stories/user-stories/US-026-reactivate-an-account.md`  |
| **Updated** | 2026-09-20                                                         |

## Requirement to code

| Req   | File                                                | Symbol / location                | Proven by                                                       | Status      |
| ----- | ---------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------ | ----------- |
| FR-01 | `apps/api/src/modules/admin/admin.router.ts`         | `POST /users/:id/activate`        | `apps/api/src/modules/admin/admin.routes.spec.ts`                   | implemented |
| FR-02 | `apps/api/src/modules/users/users.repository.ts`     | `activateAccount`                 | `apps/api/src/modules/users/users.repository.spec.ts`               | implemented |
| FR-03 | `apps/api/src/modules/users/users.repository.ts`     | `activateAccount` (`not_found`)   | `apps/api/src/modules/users/users.repository.spec.ts`               | implemented |
| FR-04 | `apps/api/src/modules/admin/admin.router.ts`         | `requireAdmin` mount (inherited)  | `apps/api/src/modules/admin/admin.routes.spec.ts`                   | implemented |
| FR-05 | `apps/ui/src/screens/people/People.tsx`              | `handleActivate` (no dialog)      | `apps/ui/src/screens/people/People.spec.tsx`                        | implemented |
| FR-06 | `apps/ui/src/lib/use-users.ts`                       | `markReactivated`                 | `apps/ui/src/lib/use-users.spec.ts`                                 | implemented |
| FR-07 | `apps/ui/src/screens/people/copy.ts`                 | `activateFailedAlert`             | `apps/ui/src/screens/people/copy.spec.ts`, `People.spec.tsx`        | implemented |

## Key symbols

| Symbol                     | Location                                          |
| --------------------------- | -------------------------------------------------- |
| `activateAccount` (repo)   | `apps/api/src/modules/users/users.repository.ts`  |
| `activateAccount` (service)| `apps/api/src/modules/users/users.service.ts`     |
| `POST /users/:id/activate` | `apps/api/src/modules/admin/admin.router.ts`      |
| `createActivateAccount`    | `apps/ui/src/lib/activate-account.ts`             |
| `markReactivated`          | `apps/ui/src/lib/use-users.ts`                    |
| `handleActivate`           | `apps/ui/src/screens/people/People.tsx`           |
| Activate branch            | `apps/ui/src/screens/people/AccountRowMenu.tsx`   |
