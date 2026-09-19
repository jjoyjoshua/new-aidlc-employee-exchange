/**
 * DeskFormDialog — SCR-007 ST-01, ST-03, ST-04, ST-05, ST-07 (US-017). ST-02 (edit) and its
 * upcoming-bookings warning are US-018's; this component is add-mode only.
 *
 * Composes the shared `Dialog` shell (design note §5.2) under `role="dialog"` — a form, not a
 * confirmation. Owns the field's own value and its CLIENT-side validation (AC-02's "no request is
 * sent" half); `useAddDeskDialog` (the caller) owns the server round trip and its three outcomes.
 */
import { useRef, useState, type FormEvent } from 'react';
import { DESK_NUMBER_PATTERN, normalizeDeskNumber } from '@desk-booking/contracts';
import { Alert } from '../../components/alert/Alert.js';
import { Button } from '../../components/button/Button.js';
import { Dialog } from '../../components/dialog/Dialog.js';
import { TextField } from '../../components/text-field/TextField.js';
import {
  ADD_DESK_DIALOG_TITLE,
  ADD_DESK_LABEL,
  CANCEL_LABEL,
  DESK_NUMBER_HELPER,
  DESK_NUMBER_LABEL,
  DUPLICATE_DESK_BODY,
  DUPLICATE_DESK_CASE_SENTENCE,
  RETRY_LABEL,
  SAVE_FAILED,
  deskNumberFormatError,
  duplicateDeskTitle,
} from './copy.js';
import type { AddDeskDialogState } from './use-add-desk-dialog.js';

export interface DeskFormDialogProps {
  dialog: AddDeskDialogState;
  onSubmit: (raw: string) => void;
  onDismiss: () => void;
  /** Test seam only — in real use the field's own state persists for as long as this component
   *  stays mounted, which `Desks.tsx` guarantees for the dialog's whole open/saving/failed
   *  lifecycle (the same instance re-renders as `dialog` changes; it never remounts). */
  initialValue?: string;
}

export function DeskFormDialog({ dialog, onSubmit, onDismiss, initialValue = '' }: DeskFormDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const isValid = (raw: string) => DESK_NUMBER_PATTERN.test(normalizeDeskNumber(raw));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (dialog.busy) return;
    if (!isValid(value)) {
      setFieldError(deskNumberFormatError(value));
      return;
    }
    setFieldError(undefined);
    onSubmit(value);
  };

  return (
    <Dialog
      title={ADD_DESK_DIALOG_TITLE}
      role="dialog"
      busy={dialog.busy}
      onDismiss={onDismiss}
      initialFocusRef={inputRef}
      footer={
        <>
          <Button variant="secondary" onClick={onDismiss} disabled={dialog.busy}>
            {CANCEL_LABEL}
          </Button>
          <Button variant="primary" type="submit" form="desk-form" busy={dialog.busy}>
            {dialog.outcome === 'failed' ? RETRY_LABEL : ADD_DESK_LABEL}
          </Button>
        </>
      }
    >
      {dialog.outcome === 'duplicate' ? (
        <Alert tone="warning" title={duplicateDeskTitle(normalizeDeskNumber(value))} live="assertive">
          {DUPLICATE_DESK_BODY} {dialog.collidedOnCaseOnly ? DUPLICATE_DESK_CASE_SENTENCE : null}
        </Alert>
      ) : null}
      {dialog.outcome === 'failed' ? (
        <Alert tone="danger" live="assertive">
          {SAVE_FAILED}
        </Alert>
      ) : null}
      <form id="desk-form" onSubmit={handleSubmit}>
        <TextField
          label={DESK_NUMBER_LABEL}
          helper={DESK_NUMBER_HELPER}
          error={fieldError}
          invalid={dialog.outcome === 'duplicate'}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          readOnly={dialog.busy}
          maxLength={20}
          autoCapitalize="off"
          inputRef={inputRef}
        />
      </form>
    </Dialog>
  );
}
