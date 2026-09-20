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
 *
 * **`kind: 'inventory'`, added by US-016/AC-02, AC-03** (design note §4). A THIRD family, not a
 * reuse of `kind: 'desk'`'s `available`/`taken`: `LABEL.available` is the exported string
 * `"Available"`, and AC-02 requires the word "Active" — a per-date occupancy fact (`DeskStatus`)
 * and a lifecycle fact (`is_active`) that must be able to diverge again without one edit changing
 * the other (`tokens.css`'s own stated reason for the inactive role). The Inactive variant binds
 * `--c-state-inactive-*` (quiet neutral, never the danger family, AC-03); the Active variant
 * binds `--c-state-available-*` — the same role the desk-availability chip uses, because the
 * Figma component itself binds it there and no `--c-state-active-*` role exists or is needed.
 *
 * **`kind: 'account'`, added by US-020/AC-01** (design note §4, correcting US-016's own §4.2
 * prediction). US-016 §4.2 predicted this future variant would be
 * `{ kind: 'account'; status: 'active' | 'deactivated' }` — taken literally that would render
 * `.status-chip--deactivated`, a class `status-chip.css` never defines (only `--active` and
 * `--inactive` exist), so the chip would ship unstyled. The class is keyed on `status` ALONE, not
 * on `kind` — US-016 §4.2's own next paragraph said so — so `kind: 'account'` reuses the SAME
 * `status: 'active' | 'inactive'` values `kind: 'inventory'` uses, and therefore the SAME
 * `.status-chip--active`/`--inactive` classes, with no new CSS and no new icon. Only the WORD
 * differs: `ACCOUNT_LABEL.inactive` is `"Deactivated"`, not `"Inactive"` — a desk is inactive, a
 * person is deactivated. `INVENTORY_LABEL` is not reused directly because AC-01 requires the
 * different word, and this component's label maps are exported precisely so a caller cannot fork
 * one label map to say something a sibling kind's map does not (§4's own reasoning, restated).
 */
import personMarkup from '../../assets/icon-person.svg?raw';
import clockMarkup from '../../assets/icon-clock.svg?raw';
import closeMarkup from '../../assets/icon-close.svg?raw';
import blockMarkup from '../../assets/icon-block.svg?raw';
import './status-chip.css';

export type DeskStatus = 'available' | 'taken' | 'selected';
export type BookingLifecycleStatus = 'confirmed' | 'completed' | 'cancelled';
export type InventoryStatus = 'active' | 'inactive';
/** US-020/AC-01. Same two values `InventoryStatus` carries — a desk's lifecycle and a person's
 *  are the same shape, only the WORD differs (`ACCOUNT_LABEL` vs `INVENTORY_LABEL`, design note
 *  §4). A separate alias, not a reuse of `InventoryStatus` by name, so the two kinds can diverge
 *  later without one edit changing the other's type. */
export type AccountStatus = 'active' | 'inactive';

export type StatusChipProps =
  | { kind?: 'desk'; status: DeskStatus }
  | { kind: 'booking'; status: BookingLifecycleStatus }
  | { kind: 'inventory'; status: InventoryStatus }
  | { kind: 'account'; status: AccountStatus };

/** Exported for `DeskRow` (US-008/FR-06): the composed `aria-label` needs the same word this chip
 *  renders, so the accessible name and the visible chip never say different things. */
export const LABEL: Record<DeskStatus, string> = { available: 'Available', taken: 'Taken', selected: 'Selected' };

/** Exported for `BookingRow` (US-010/AC-05), the same reason `LABEL` is exported above. */
export const BOOKING_LABEL: Record<BookingLifecycleStatus, string> = {
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Exported for `DeskInventoryRow` (US-016/AC-02), the same reason `LABEL` is exported above —
 *  the word this constant carries is exactly what AC-02 requires, and `LABEL.available` would
 *  say "Available" instead. */
export const INVENTORY_LABEL: Record<InventoryStatus, string> = { active: 'Active', inactive: 'Inactive' };

/** Exported for `AccountRow` (US-020/AC-01), the same reason `LABEL` is exported above — "Deactivated,"
 *  never `INVENTORY_LABEL.inactive`'s "Inactive" (design note §4). */
export const ACCOUNT_LABEL: Record<AccountStatus, string> = { active: 'Active', inactive: 'Deactivated' };

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

function BlockIcon() {
  // Figma `Icon / block` (node 11:43) — the Inactive inventory variant's second cue, alongside
  // the quiet-neutral fill and the word (US-016/AC-02, AC-03).
  return <span className="status-chip__icon status-chip__icon--markup" dangerouslySetInnerHTML={{ __html: blockMarkup }} />;
}

const BOOKING_ICON: Record<BookingLifecycleStatus, () => React.JSX.Element> = {
  confirmed: CheckCircleIcon,
  completed: ClockIcon,
  cancelled: CloseIcon,
};

const INVENTORY_ICON: Record<InventoryStatus, () => React.JSX.Element> = {
  active: CheckCircleIcon,
  inactive: BlockIcon,
};

/** Same two icons `INVENTORY_ICON` uses — the block icon is the signal for "cannot sign in" just
 *  as it is for "cannot be booked" (US-020/AC-01, design note §4). */
const ACCOUNT_ICON: Record<AccountStatus, () => React.JSX.Element> = {
  active: CheckCircleIcon,
  inactive: BlockIcon,
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

  if (props.kind === 'inventory') {
    const Icon = INVENTORY_ICON[props.status];
    return (
      <span className={`status-chip status-chip--${props.status}`}>
        <Icon />
        <span>{INVENTORY_LABEL[props.status]}</span>
      </span>
    );
  }

  if (props.kind === 'account') {
    const Icon = ACCOUNT_ICON[props.status];
    return (
      <span className={`status-chip status-chip--${props.status}`}>
        <Icon />
        <span>{ACCOUNT_LABEL[props.status]}</span>
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
