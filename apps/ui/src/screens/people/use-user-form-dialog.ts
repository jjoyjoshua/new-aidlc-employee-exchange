/**
 * Owns `UserFormDialog`'s own busy/outcome state machine for `People` — generalised from
 * US-021's create-only shape into one hook covering both modes, `use-desk-form-dialog.ts`'s own
 * move (US-018 design note §6.2), rather than a sibling `use-edit-user-dialog.ts`: US-023/AC-08
 * requires the edit path's save-guarding to match create's, and that is true because it is the
 * SAME `inFlight` ref, not because two files happen to agree today — this hook's own earlier
 * docblock predicted exactly this change.
 */
import { useCallback, useRef, useState } from 'react';
import type { AdminUser } from '@desk-booking/contracts';
import type { CreateAccountFetcher } from '../../lib/create-account.js';
import type { UpdateAccountFetcher } from '../../lib/update-account.js';

export interface UserFormDialogState {
  mode: 'create' | 'edit';
  /** The account being edited. Present iff `mode === 'edit'` (`use-desk-form-dialog.ts`'s own
   *  "subject plus busy plus outcome" shape, applied here because create has no subject). */
  account?: AdminUser;
  busy: boolean;
  outcome?: 'duplicate' | 'failed';
  /** Present iff `outcome === 'duplicate'` (US-021/AC-06, US-023/AC-02, ST-04). */
  duplicateFullName?: string;
  duplicateIsActive?: boolean;
}

export interface CreateAccountFields {
  fullName: string;
  email: string;
  role: 'employee' | 'admin';
  password: string;
}

export interface UpdateAccountFields {
  fullName: string;
  email: string;
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
  patch: { busy: boolean; outcome?: 'duplicate' | 'failed'; duplicateFullName?: string; duplicateIsActive?: boolean },
): UserFormDialogState {
  if (dialog.mode === 'edit') return { mode: 'edit', account: dialog.account!, ...patch };
  return { mode: 'create', ...patch };
}

export function useUserFormDialog(
  createAccount: CreateAccountFetcher,
  updateAccount: UpdateAccountFetcher,
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
      void updateAccount(subject.id, fields as UpdateAccountFields).then((outcome) => {
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
    },
    [dialog, createAccount, updateAccount, onCreated, onUpdated],
  );

  const dismiss = useCallback(() => {
    setDialog(undefined);
  }, []);

  return { dialog, openAdd, openEdit, submit, dismiss };
}
