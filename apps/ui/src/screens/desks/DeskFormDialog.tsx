/**
 * DeskFormDialog — SCR-007, every state (US-017 built ST-01, ST-03, ST-04, ST-05, ST-06, ST-07;
 * US-018 adds ST-02, the edit mode, and its upcoming-bookings warning).
 *
 * One component with a `mode: 'add' | 'edit'` switch rather than two components (US-018 design
 * note §6.1) — this file's own earlier docblock anticipated exactly this, Figma's `Desk form
 * popup` master models add/edit as variants of one component, and the delta between modes is
 * small and declarative (title, initial value, confirm label, one extra note): ST-03, ST-04,
 * ST-05 and ST-07 are byte-identical between modes. `mode` is NOT the Complex shared-component
 * surface US-017 avoided on `ConfirmDialog` — this component is screen-private
 * (`screens/desks/`), so its props are a Medium surface.
 *
 * Composes the shared `Dialog` shell (design note §5.2) under `role="dialog"` — a form, not a
 * confirmation. Owns the field's own value and its CLIENT-side validation (AC-02's "no request is
 * sent" half); `useDeskFormDialog` (the caller) owns the server round trip and its outcomes.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { DESK_NUMBER_PATTERN, normalizeDeskNumber, type AdminDesk } from '@desk-booking/contracts';
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
  SAVE_CHANGES_LABEL,
  SAVE_FAILED,
  deskNumberFormatError,
  duplicateDeskTitle,
  editDeskDialogTitle,
  upcomingHoldersWarning,
} from './copy.js';
import type { DeskFormDialogState } from './use-desk-form-dialog.js';

export interface DeskFormDialogProps {
  /** ST-01 vs ST-02. Selects the title, the confirm label, the initial field value, and whether
   *  AC-04's note renders. Everything else — ST-03, ST-04, ST-05, ST-07 — is identical in both
   *  modes. */
  mode: 'add' | 'edit';
  /** The desk being edited. Required in edit mode — carries `bookedAhead`, which IS AC-04's
   *  count. No fetch, no loading state: the count already on this object is authoritative enough
   *  because nothing in this story gates on it (design note §4). */
  desk?: AdminDesk | undefined;
  dialog: DeskFormDialogState;
  onSubmit: (raw: string) => void;
  onDismiss: () => void;
  /** Test seam only — in real use the field's own state persists for as long as this component
   *  stays mounted, which `Desks.tsx` guarantees for the dialog's whole open/saving/failed
   *  lifecycle (the same instance re-renders as `dialog` changes; it never remounts). */
  initialValue?: string;
}

export function DeskFormDialog({ mode, desk, dialog, onSubmit, onDismiss, initialValue }: DeskFormDialogProps) {
  const [value, setValue] = useState(initialValue ?? (mode === 'edit' ? (desk?.deskNumber ?? '') : ''));
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const noteId = useId();

  // ST-02: prefilled AND fully selected, so overtyping is one action (SCR-007:65). `Dialog`
  // focuses the field via `initialFocusRef` but does not select its contents — this is the one
  // extra step edit mode needs on top of that.
  useEffect(() => {
    if (mode === 'edit') inputRef.current?.select();
    // Runs once, on mount — the same "captured on open" timing `Dialog`'s own focus capture uses.
  }, []);

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

  // AC-04: rendered only when the count is non-zero — this desk's own docblock and the story's
  // QA note both require the ABSENCE to be tested as carefully as the presence.
  const showUpcomingNote = mode === 'edit' && (desk?.bookedAhead ?? 0) > 0;

  return (
    <Dialog
      // Binds to the desk AS LOADED, never the live input value — a title that tracked the field
      // would rename itself mid-keystroke (design note §6.1).
      title={mode === 'add' ? ADD_DESK_DIALOG_TITLE : editDeskDialogTitle(desk?.deskNumber ?? '')}
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
            {dialog.outcome === 'failed' ? RETRY_LABEL : mode === 'add' ? ADD_DESK_LABEL : SAVE_CHANGES_LABEL}
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
          describedBy={showUpcomingNote ? noteId : undefined}
        />
      </form>
      {showUpcomingNote ? (
        // The note is present on open, not new information arriving — `live="off"` per `Alert`'s
        // own rule (announce it as read, not as news). Associated with the field via `noteId`
        // rather than merely rendered nearby (SCR-007:114, US-018/NFR-01).
        <div id={noteId}>
          <Alert tone="warning" live="off">
            {upcomingHoldersWarning(desk?.bookedAhead ?? 0)}
          </Alert>
        </div>
      ) : null}
    </Dialog>
  );
}
