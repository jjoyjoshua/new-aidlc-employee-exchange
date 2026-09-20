/**
 * Owns `UserFormDialog`'s own busy/outcome state machine for `People` (US-021) — the same
 * "subject plus busy plus outcome" shape `use-desk-form-dialog.ts` established, simplified to
 * create-only (no `mode`, no subject: ST-02/ST-05 belong to US-023/US-024). The synchronous
 * `inFlight.current` guard is the one thing AC-11's "at most one account" client-side guarantee
 * depends on (`use-desk-form-dialog.ts`'s own reasoning for a ref rather than state).
 */
import { useCallback, useRef, useState } from 'react';
import type { AdminUser } from '@desk-booking/contracts';
import type { CreateAccountFetcher } from '../../lib/create-account.js';

export interface UserFormDialogState {
  busy: boolean;
  outcome?: 'duplicate' | 'failed';
  /** Present iff `outcome === 'duplicate'` (US-021/AC-06, ST-04). */
  duplicateFullName?: string;
  duplicateIsActive?: boolean;
}

export interface CreateAccountFields {
  fullName: string;
  email: string;
  role: 'employee' | 'admin';
  password: string;
}

export interface UseUserFormDialogResult {
  dialog: UserFormDialogState | undefined;
  openAdd: () => void;
  submit: (fields: CreateAccountFields) => void;
  dismiss: () => void;
}

export function useUserFormDialog(
  createAccount: CreateAccountFetcher,
  onCreated: (account: AdminUser) => void,
): UseUserFormDialogResult {
  const [dialog, setDialog] = useState<UserFormDialogState | undefined>(undefined);
  const inFlight = useRef(false);

  const openAdd = useCallback(() => {
    setDialog({ busy: false });
  }, []);

  const dismiss = useCallback(() => {
    setDialog(undefined);
  }, []);

  const submit = useCallback(
    (fields: CreateAccountFields) => {
      if (inFlight.current || !dialog || dialog.busy) return;
      inFlight.current = true;
      setDialog({ busy: true });

      void createAccount(fields).then((outcome) => {
        inFlight.current = false;
        if (outcome.kind === 'ok') {
          onCreated(outcome.account);
          setDialog(undefined);
          return;
        }
        if (outcome.kind === 'duplicate') {
          setDialog({
            busy: false,
            outcome: 'duplicate',
            duplicateFullName: outcome.fullName,
            duplicateIsActive: outcome.isActive,
          });
          return;
        }
        setDialog({ busy: false, outcome: 'failed' });
      });
    },
    [dialog, createAccount, onCreated],
  );

  return { dialog, openAdd, submit, dismiss };
}
