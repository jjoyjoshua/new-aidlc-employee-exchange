/**
 * Owns `UserFormDialog`'s own busy/outcome state machine for `People` — generalised from
 * US-021's create-only shape into one hook covering both modes, `use-desk-form-dialog.ts`'s own
 * move (US-018 design note §6.2), rather than a sibling `use-edit-user-dialog.ts`: US-023/AC-08
 * requires the edit path's save-guarding to match create's, and that is true because it is the
 * SAME `inFlight` ref, not because two files happen to agree today — this hook's own earlier
 * docblock predicted exactly this change.
 *
 * US-024 adds the edit path's role handling (D-01): when the role radio differs from the loaded
 * account's own role, `submit()` calls `changeRole` FIRST, and only proceeds to `updateAccount`
 * for the name/email fields once that succeeds or the role was never touched. A `blocked` role
 * change never reaches `updateAccount` at all — nothing has been saved, matching ST-05's copy.
 * D-04 (accepted 2026-09-20, tracked as issue #57): if the role change succeeds and the
 * following `updateAccount` then fails, the account keeps its NEW role and OLD name/email; ST-08's
 * "Nothing has changed" is shown anyway, since no approved copy exists for that partial state yet.
 */
import { useCallback, useRef, useState } from 'react';
import type { AdminUser, UserRole } from '@desk-booking/contracts';
import type { ChangeRoleFetcher } from '../../lib/change-role.js';
import type { CreateAccountFetcher } from '../../lib/create-account.js';
import type { UpdateAccountFetcher } from '../../lib/update-account.js';

export interface UserFormDialogState {
  mode: 'create' | 'edit';
  /** The account being edited. Present iff `mode === 'edit'` (`use-desk-form-dialog.ts`'s own
   *  "subject plus busy plus outcome" shape, applied here because create has no subject). */
  account?: AdminUser;
  busy: boolean;
  /** US-024/AC-04 adds `lastAdmin` — SCR-009 ST-05, the same refusal SCR-008 ST-09 renders as a
   *  dialog, shown here in-form instead (D-03's shared sentence-builder, one rule two doors). */
  outcome?: 'duplicate' | 'failed' | 'lastAdmin';
  /** Present iff `outcome === 'duplicate'` (US-021/AC-06, US-023/AC-02, ST-04). */
  duplicateFullName?: string;
  duplicateIsActive?: boolean;
}

export interface CreateAccountFields {
  fullName: string;
  email: string;
  role: UserRole;
  password: string;
}

export interface UpdateAccountFields {
  fullName: string;
  email: string;
  /** US-024. Always present — the edit form's radios are live now, not `aria-disabled`. Compared
   *  against `dialog.account.role` inside `submit()`; `updateAccount` itself never receives this
   *  field (`userUpdateSchema` carries none, US-023/AC-07). */
  role: UserRole;
}

export interface UseUserFormDialogResult {
  dialog: UserFormDialogState | undefined;
  openAdd: () => void;
  openEdit: (account: AdminUser) => void;
  submit: (fields: CreateAccountFields | UpdateAccountFields) => void;
  dismiss: () => void;
}

/** Builds the busy/outcome variant for either mode without ever writing `account` as a literal
 *  `undefined` (`exactOptionalPropertyTypes`) — present only in edit mode, carried through
 *  unchanged from the dialog being submitted (`use-desk-form-dialog.ts`'s `withOutcome`). */
function withOutcome(
  dialog: UserFormDialogState,
  patch: {
    busy: boolean;
    outcome?: 'duplicate' | 'failed' | 'lastAdmin';
    duplicateFullName?: string;
    duplicateIsActive?: boolean;
  },
): UserFormDialogState {
  if (dialog.mode === 'edit') return { mode: 'edit', account: dialog.account!, ...patch };
  return { mode: 'create', ...patch };
}

export function useUserFormDialog(
  createAccount: CreateAccountFetcher,
  updateAccount: UpdateAccountFetcher,
  changeRole: ChangeRoleFetcher,
  onCreated: (account: AdminUser) => void,
  onUpdated: (account: AdminUser) => void,
): UseUserFormDialogResult {
  const [dialog, setDialog] = useState<UserFormDialogState | undefined>(undefined);
  const inFlight = useRef(false);

  const openAdd = useCallback(() => {
    setDialog({ mode: 'create', busy: false });
  }, []);

  const openEdit = useCallback((account: AdminUser) => {
    setDialog({ mode: 'edit', account, busy: false });
  }, []);

  const submit = useCallback(
    (fields: CreateAccountFields | UpdateAccountFields) => {
      if (inFlight.current || !dialog || dialog.busy) return;
      inFlight.current = true;
      setDialog(withOutcome(dialog, { busy: true }));

      if (dialog.mode === 'create') {
        void createAccount(fields as CreateAccountFields).then((outcome) => {
          inFlight.current = false;
          if (outcome.kind === 'ok') {
            onCreated(outcome.account);
            setDialog(undefined);
            return;
          }
          if (outcome.kind === 'duplicate') {
            setDialog(
              withOutcome(dialog, {
                busy: false,
                outcome: 'duplicate',
                duplicateFullName: outcome.fullName,
                duplicateIsActive: outcome.isActive,
              }),
            );
            return;
          }
          setDialog(withOutcome(dialog, { busy: false, outcome: 'failed' }));
        });
        return;
      }

      const subject = dialog.account!;
      const { role, ...details } = fields as UpdateAccountFields;

      const submitDetails = () => {
        void updateAccount(subject.id, details).then((outcome) => {
          inFlight.current = false;
          if (outcome.kind === 'ok') {
            onUpdated(outcome.account);
            setDialog(undefined);
            return;
          }
          if (outcome.kind === 'duplicate') {
            setDialog(
              withOutcome(dialog, {
                busy: false,
                outcome: 'duplicate',
                duplicateFullName: outcome.fullName,
                duplicateIsActive: outcome.isActive,
              }),
            );
            return;
          }
          setDialog(withOutcome(dialog, { busy: false, outcome: 'failed' }));
        });
      };

      // D-01's load-bearing guard: no `changeRole` call at all when the role is unchanged —
      // the ONLY path this hook had before US-024, byte for byte.
      if (role === subject.role) {
        submitDetails();
        return;
      }

      void changeRole(subject.id, role).then((roleOutcome) => {
        if (roleOutcome.kind === 'blocked') {
          inFlight.current = false;
          setDialog(withOutcome(dialog, { busy: false, outcome: 'lastAdmin' }));
          return;
        }
        if (roleOutcome.kind === 'failed') {
          inFlight.current = false;
          setDialog(withOutcome(dialog, { busy: false, outcome: 'failed' }));
          return;
        }
        // ok — the role write landed. `inFlight` stays true and the dialog stays busy: this is
        // one continuous submission from the administrator's own point of view, not two.
        submitDetails();
      });
    },
    [dialog, createAccount, updateAccount, changeRole, onCreated, onUpdated],
  );

  const dismiss = useCallback(() => {
    setDialog(undefined);
  }, []);

  return { dialog, openAdd, openEdit, submit, dismiss };
}
