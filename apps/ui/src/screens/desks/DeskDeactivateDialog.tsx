/**
 * DeskDeactivateDialog — SCR-006 ST-05, ST-06, ST-07, ST-08 (US-019), from one mounted `Dialog`
 * that switches its own body, footer and header icon on the outcome (design note §8.2,
 * `decisions.md` D-05). `ConfirmDialog` is NOT reused here — `Dialog` refocuses the opener on
 * unmount, so rendering `ConfirmDialog` for ST-05 and a different component for ST-06 would
 * unmount/remount and bounce focus out to the row and back. ST-06's footer also has a
 * NAVIGATION as its primary action, which `ConfirmDialogProps` cannot express.
 *
 * Screen-private (`screens/desks/`) — a Medium surface, the same distinction US-018's
 * `DeskFormDialog` drew for itself.
 */
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import type { AdminDesk, OfficeDate } from '@desk-booking/contracts';
import { Alert } from '../../components/alert/Alert.js';
import { Button } from '../../components/button/Button.js';
import { Dialog } from '../../components/dialog/Dialog.js';
import { toQueryString } from '../all-bookings/filters.js';
import {
  CLOSE_LABEL,
  DEACTIVATE_LABEL,
  KEEP_IT_ACTIVE_LABEL,
  RETRY_LABEL,
  blockedDialogBody,
  blockedDialogTitle,
  deactivateDialogBody,
  deactivateDialogTitle,
  deactivateFailedAlert,
  seeBookingsLabel,
} from './copy.js';

export interface DeskDeactivateDialogState {
  desk: AdminDesk;
  busy: boolean;
  /** `blocked` is ST-06 (BR-001.9's hard block, US-019/AC-04); `failed` is ST-08 (US-019/AC-11) —
   *  two renderings, because the block offers a navigation and the failure offers a retry. */
  outcome?: 'blocked' | 'failed';
  /** Present iff `outcome === 'blocked'`. The SERVER's count from the refusing response (design
   *  note §4, §6) — never the row's own `bookedAhead`, which is provably 0 on this path (§4.5,
   *  option E). */
  upcomingBookings?: number;
}

export interface DeskDeactivateDialogProps {
  dialog: DeskDeactivateDialogState;
  /** The office's own today (`useAuth().office.today`), never the device's date — AC-06's route
   *  must match the same "today" the server's block just evaluated against (design note §8.5). */
  today: OfficeDate;
  onConfirm: () => void;
  onDismiss: () => void;
}

/** SCR-006 ST-06's warning triangle (frame `214:1685`), inline SVG matching `Alert.tsx`'s own
 *  treatment (design note §8.3) rather than a new asset. */
function WarningIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 2.2 18.4 17.3H1.6Z" strokeLinejoin="round" />
      <path d="M10 7.6v4" strokeLinecap="round" />
      <path d="M10 14.6v.2" strokeLinecap="round" />
    </svg>
  );
}

export function DeskDeactivateDialog({ dialog, today, onConfirm, onDismiss }: DeskDeactivateDialogProps) {
  const { desk, busy, outcome } = dialog;
  const blockedBodyRef = useRef<HTMLParagraphElement>(null);

  if (outcome === 'blocked') {
    const count = dialog.upcomingBookings ?? 0;
    const href = `/admin/bookings${toQueryString({ deskId: desk.id, from: today, status: 'confirmed' }, 1)}`;

    return (
      <Dialog
        title={blockedDialogTitle(desk.deskNumber)}
        role="alertdialog"
        icon={<WarningIcon />}
        // SCR-006:162 — the number is the point, and a focused button invites Enter before
        // reading. Focus goes to the refusal text, not the primary action (design note §8.2).
        initialFocusRef={blockedBodyRef}
        onDismiss={onDismiss}
        footer={
          <>
            <Button variant="secondary" onClick={onDismiss}>
              {CLOSE_LABEL}
            </Button>
            {/* A real <Link>, not useNavigate — a navigation gives middle-click, copy-link and
             *  the focus semantics the dialog's own trap already handles (design note §8.5). */}
            <Link to={href} className="button button--primary">
              {seeBookingsLabel(count)}
            </Link>
          </>
        }
      >
        <p ref={blockedBodyRef} tabIndex={-1}>
          {blockedDialogBody(count)}
        </p>
      </Dialog>
    );
  }

  const failed = outcome === 'failed';

  return (
    <Dialog
      title={deactivateDialogTitle(desk.deskNumber)}
      role="alertdialog"
      busy={busy}
      onDismiss={onDismiss}
      footer={
        <>
          <Button variant="secondary" onClick={onDismiss} disabled={busy}>
            {failed ? CLOSE_LABEL : KEEP_IT_ACTIVE_LABEL}
          </Button>
          <Button variant="danger" onClick={onConfirm} busy={busy}>
            {failed ? RETRY_LABEL : DEACTIVATE_LABEL}
          </Button>
        </>
      }
    >
      <p>{deactivateDialogBody()}</p>
      {failed ? (
        <Alert tone="danger" live="assertive">
          {deactivateFailedAlert(desk.deskNumber)}
        </Alert>
      ) : null}
    </Dialog>
  );
}
