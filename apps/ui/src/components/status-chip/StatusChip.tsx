/**
 * StatusChip — Figma `Status chip` (node 20:17), `Available`/`Taken`/`Selected` desk variants,
 * plus US-010's `Confirmed`/`Completed`/`Cancelled` booking-lifecycle variants (design note §4.4,
 * this story's folder in `inception/specs/`).
 *
 * "Each variant carries its ICON and its WORD — the coloured border is the second cue and the
 * fill the third and weakest" (the component's own Figma documentation) — NFR-008. `Taken`
 * deliberately has a transparent border: the absence of an edge is its second cue, and the
 * person icon is the signal, never an occupant's name (US-006/AC-06 — the employee view stays
 * anonymous; this icon is generic, not tied to any person).
 *
 * `Selected` (US-007/AC-01) is the third desk variant, forest-coloured via the shared
 * `--c-selected` token (the same one `DateStrip`'s selected chip already uses) — reusing the
 * check-circle icon rather than a new one: "the desk is free for the selected date" and "you
 * have selected this desk" are the same underlying fact, just at a later step.
 *
 * `kind` is an OPTIONAL discriminator, defaulting to `'desk'` (design note §4.4) — every existing
 * call site compiles and renders unchanged; only a call site that opts into `kind="booking"` can
 * reach the three new variants. One component, not a sibling `BookingStatusChip`: the CSS, the
 * tokens, the pill geometry and the icon-and-word discipline are identical, and duplicating them
 * is exactly the kind of drift `modules/bookings/README.md` warns against for a second rule.
 */
import personMarkup from '../../assets/icon-person.svg?raw';
import clockMarkup from '../../assets/icon-clock.svg?raw';
import closeMarkup from '../../assets/icon-close.svg?raw';
import './status-chip.css';

export type DeskStatus = 'available' | 'taken' | 'selected';
export type BookingLifecycleStatus = 'confirmed' | 'completed' | 'cancelled';

export type StatusChipProps =
  | { kind?: 'desk'; status: DeskStatus }
  | { kind: 'booking'; status: BookingLifecycleStatus };

/** Exported for `DeskRow` (US-008/FR-06): the composed `aria-label` needs the same word this chip
 *  renders, so the accessible name and the visible chip never say different things. */
export const LABEL: Record<DeskStatus, string> = { available: 'Available', taken: 'Taken', selected: 'Selected' };

/** Exported for `BookingRow` (US-010/AC-05), the same reason `LABEL` is exported above. */
export const BOOKING_LABEL: Record<BookingLifecycleStatus, string> = {
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function CheckCircleIcon() {
  // Figma `Icon / check-circle` (node 11:5) — "the desk is free for the selected date". Same
  // geometry as `PolicyChecklist`'s "met" icon, which is this codebase's existing check-circle.
  // Reused as-is for the Confirmed booking variant (design note §4.4).
  return (
    <svg className="status-chip__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="10" cy="10" r="8" />
      <path d="M6.5 10.2l2.3 2.3 4.7-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PersonIcon() {
  // The SVG already carries role="presentation" aria-hidden="true" (same convention as NavIcon).
  return <span className="status-chip__icon status-chip__icon--person" dangerouslySetInnerHTML={{ __html: personMarkup }} />;
}

function ClockIcon() {
  // Figma `Icon / clock` (node 11:47), already in apps/ui/src/assets/ (also used by NavIcon and
  // DeskRow) — reused, not redrawn, for the Completed booking variant (design note §4.4).
  return <span className="status-chip__icon status-chip__icon--markup" dangerouslySetInnerHTML={{ __html: clockMarkup }} />;
}

function CloseIcon() {
  // Figma `Icon / close` (node 11:50) — for the Cancelled booking variant (design note §4.4).
  return <span className="status-chip__icon status-chip__icon--markup" dangerouslySetInnerHTML={{ __html: closeMarkup }} />;
}

const BOOKING_ICON: Record<BookingLifecycleStatus, () => React.JSX.Element> = {
  confirmed: CheckCircleIcon,
  completed: ClockIcon,
  cancelled: CloseIcon,
};

export function StatusChip(props: StatusChipProps) {
  if (props.kind === 'booking') {
    const Icon = BOOKING_ICON[props.status];
    return (
      <span className={`status-chip status-chip--${props.status}`}>
        <Icon />
        <span>{BOOKING_LABEL[props.status]}</span>
      </span>
    );
  }

  const { status } = props;
  return (
    <span className={`status-chip status-chip--${status}`}>
      {status === 'taken' ? <PersonIcon /> : <CheckCircleIcon />}
      <span>{LABEL[status]}</span>
    </span>
  );
}
