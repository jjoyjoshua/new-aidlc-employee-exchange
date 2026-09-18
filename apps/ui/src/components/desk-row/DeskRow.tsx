/**
 * DeskRow — Figma `Desk row` (node 22:148).
 *
 * US-006 shipped `Rest` only (presentational, no selection). US-007/AC-01, AC-02 add the
 * `Selected` interaction: an AVAILABLE row becomes a radio, part of one radio group (the parent
 * screen owns `role="radiogroup"` — this component only renders its own `role="radio"`). A
 * TAKEN row is never interactive, `onSelect` or not — the single-selection invariant this
 * enforces at the DOM level (no `<button>`, no `role="radio"`) is real defence, not decoration:
 * even a caller that wires `onSelect` to every row cannot make a taken desk selectable.
 *
 * **Purely presentational — the single-selection invariant itself lives in `BookADesk.tsx`/
 * `use-book-desk.ts`, not here** (Architect design note §7, F-8): a later swap to a different
 * desk-list component must not strand that rule inside this file.
 *
 * The full-width ROW is the touch target (≥44px, PRIN-4), not the chip inside it.
 */
import { StatusChip, LABEL, type DeskStatus } from '../status-chip/StatusChip.js';
import { YOUR_USUAL_DESK } from '../../screens/book-a-desk/copy.js';
import hintIconMarkup from '../../assets/icon-clock.svg?raw';
import './desk-row.css';

/** SCR-003 hi-fi frame, node 38:173's "Hint icon" — the same `Icon / clock` component
 *  `NavIcon.tsx` already uses (Figma node 11:47), reused rather than a second icon for the
 *  same concept. */
function HintIcon() {
  return <span className="desk-row__hint-icon" dangerouslySetInnerHTML={{ __html: hintIconMarkup }} />;
}

export interface DeskRowProps {
  deskNumber: string;
  status: DeskStatus;
  /** US-007/AC-01. Ignored for a `taken` row — see the file docblock. */
  selected?: boolean;
  /** US-008/AC-01. Ignored for a `taken` row, same as `selected` — the response never carries a
   *  usual id for a taken desk (design note §2), but this component must not assume that. */
  usual?: boolean;
  /** US-007/AC-01. Present only when this row can be selected; `DeskRow` never decides that
   *  itself for anything beyond "a taken desk never fires it" — the screen decides the rest.
   *  `| undefined` because `ZoneGroup` assigns this conditionally (`exactOptionalPropertyTypes`). */
  onSelect?: (() => void) | undefined;
}

export function DeskRow({ deskNumber, status, selected = false, usual = false, onSelect }: DeskRowProps) {
  if (status === 'taken') {
    return (
      <div className="desk-row" data-desk-number={deskNumber}>
        <span className="desk-row__number">{deskNumber}</span>
        <StatusChip status="taken" />
      </div>
    );
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      // US-008/AC-06 (NFR-008). `aria-label` REPLACES the name computed from contents, so the
      // chip's word and the hint's text are invisible to the name computation unless they are
      // named here. Order: the desk, then its availability, then the hint.
      aria-label={[deskNumber, LABEL[selected ? 'selected' : 'available'], usual ? YOUR_USUAL_DESK : undefined]
        .filter(Boolean)
        .join(', ')}
      className={['desk-row', 'desk-row--selectable', selected ? 'desk-row--selected' : undefined]
        .filter(Boolean)
        .join(' ')}
      data-desk-number={deskNumber}
      onClick={onSelect}
    >
      <span className="desk-row__number">{deskNumber}</span>
      <StatusChip status={selected ? 'selected' : 'available'} />
      {usual ? (
        <span className="desk-row__hint">
          <HintIcon />
          {YOUR_USUAL_DESK}
        </span>
      ) : null}
    </button>
  );
}
