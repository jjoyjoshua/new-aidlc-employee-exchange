/**
 * Owns `DeskFormDialog`'s own state machine for `Desks` (US-017, US-018 — design note §6.2).
 * Generalised from `use-add-desk-dialog.ts` (US-017) into one hook covering both modes, rather
 * than a sibling `use-edit-desk-dialog.ts`: AC-08 requires the edit path to "match" the add
 * path's save-guarding exactly, and two files would put that guarantee in two places that can
 * drift. The synchronous `inFlight.current` guard is the one thing AC-08 actually depends on
 * (`use-my-bookings.ts`'s own reasoning for the ref rather than state), and it is shared,
 * unchanged, by both modes.
 *
 * `collidedOnCaseOnly` — computed here because the server holds only the normalised value and
 * cannot tell whether a collision was case-only (SCR-007 ST-04's conditional sentence) — applies
 * identically to both modes.
 */
import { useCallback, useRef, useState } from 'react';
import { normalizeDeskNumber, type AdminDesk } from '@desk-booking/contracts';
import type { AddDeskFetcher } from '../../lib/add-desk.js';
import type { RenameDeskFetcher } from '../../lib/rename-desk.js';

export interface DeskFormDialogState {
  mode: 'add' | 'edit';
  /** The desk being renamed. Present iff `mode === 'edit'` — `use-admin-cancel-dialog.ts`'s own
   *  "subject plus busy plus outcome" shape, applied here because add has no subject. */
  desk?: AdminDesk;
  busy: boolean;
  /** `duplicate` is ST-04 (a warning Alert with a Title, ABOVE the field); `failed` is ST-07 (a
   *  danger Alert, and the confirm action's label becomes "Try again"). Two renderings, because
   *  AC-04 and AC-07/AC-02 are distinct ACs — collapsing them is the likeliest slip. */
  outcome?: 'duplicate' | 'failed';
  /** ST-04's case sentence appears ONLY when case caused the collision. */
  collidedOnCaseOnly: boolean;
}

export interface UseDeskFormDialogResult {
  dialog: DeskFormDialogState | undefined;
  openAdd: () => void;
  openEdit: (desk: AdminDesk) => void;
  submit: (raw: string) => void;
  dismiss: () => void;
}

/** Builds the busy/failed variant for either mode without ever writing an optional field as
 *  literal `undefined` (`exactOptionalPropertyTypes`) — `desk` is present only in edit mode, and
 *  is carried through unchanged from the dialog being submitted. */
function withOutcome(
  dialog: DeskFormDialogState,
  patch: { busy: boolean; outcome?: 'duplicate' | 'failed'; collidedOnCaseOnly: boolean },
): DeskFormDialogState {
  if (dialog.mode === 'edit') return { mode: 'edit', desk: dialog.desk!, ...patch };
  return { mode: 'add', ...patch };
}

export function useDeskFormDialog(
  addDesk: AddDeskFetcher,
  renameDesk: RenameDeskFetcher,
  onAdded: (desk: AdminDesk) => void,
  onRenamed: (id: string, deskNumber: string) => void,
): UseDeskFormDialogResult {
  const [dialog, setDialog] = useState<DeskFormDialogState | undefined>(undefined);
  const inFlight = useRef(false);

  const openAdd = useCallback(() => {
    setDialog({ mode: 'add', busy: false, collidedOnCaseOnly: false });
  }, []);

  const openEdit = useCallback((desk: AdminDesk) => {
    setDialog({ mode: 'edit', desk, busy: false, collidedOnCaseOnly: false });
  }, []);

  const submit = useCallback(
    (raw: string) => {
      if (inFlight.current || !dialog || dialog.busy) return;
      inFlight.current = true;
      setDialog(withOutcome(dialog, { busy: true, collidedOnCaseOnly: false }));

      if (dialog.mode === 'add') {
        void addDesk(raw).then((outcome) => {
          inFlight.current = false;
          if (outcome.kind === 'ok') {
            onAdded(outcome.desk);
            setDialog(undefined);
            return;
          }
          const collidedOnCaseOnly = outcome.kind === 'duplicate' && raw.trim() !== normalizeDeskNumber(raw);
          setDialog(withOutcome(dialog, { busy: false, outcome: outcome.kind, collidedOnCaseOnly }));
        });
        return;
      }

      const subject = dialog.desk!;
      void renameDesk(subject.id, raw).then((outcome) => {
        inFlight.current = false;
        if (outcome.kind === 'ok') {
          onRenamed(outcome.desk.id, outcome.desk.deskNumber);
          setDialog(undefined);
          return;
        }
        const collidedOnCaseOnly = outcome.kind === 'duplicate' && raw.trim() !== normalizeDeskNumber(raw);
        setDialog(withOutcome(dialog, { busy: false, outcome: outcome.kind, collidedOnCaseOnly }));
      });
    },
    [dialog, addDesk, renameDesk, onAdded, onRenamed],
  );

  const dismiss = useCallback(() => {
    setDialog(undefined);
  }, []);

  return { dialog, openAdd, openEdit, submit, dismiss };
}
