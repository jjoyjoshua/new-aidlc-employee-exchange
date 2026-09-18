/**
 * StatusChip — Figma `Status chip` (node 20:17), `Available`/`Taken` variants.
 *
 * "Each variant carries its ICON and its WORD — the coloured border is the second cue and the
 * fill the third and weakest" (the component's own Figma documentation) — NFR-008. `Taken`
 * deliberately has a transparent border: the absence of an edge is its second cue, and the
 * person icon is the signal, never an occupant's name (US-006/AC-06 — the employee view stays
 * anonymous; this icon is generic, not tied to any person).
 *
 * `Selected` (US-007/AC-01) is the third variant, forest-coloured via the shared `--c-selected`
 * token (the same one `DateStrip`'s selected chip already uses) — reusing the check-circle icon
 * rather than a new one: "the desk is free for the selected date" and "you have selected this
 * desk" are the same underlying fact from the employee's point of view, just at a later step.
 */
import personMarkup from '../../assets/icon-person.svg?raw';
import './status-chip.css';

export type DeskStatus = 'available' | 'taken' | 'selected';

export interface StatusChipProps {
  status: DeskStatus;
}

/** Exported for `DeskRow` (US-008/FR-06): the composed `aria-label` needs the same word this chip
 *  renders, so the accessible name and the visible chip never say different things. */
export const LABEL: Record<DeskStatus, string> = { available: 'Available', taken: 'Taken', selected: 'Selected' };

function CheckCircleIcon() {
  // Figma `Icon / check-circle` (node 11:5) — "the desk is free for the selected date". Same
  // geometry as `PolicyChecklist`'s "met" icon, which is this codebase's existing check-circle.
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

export function StatusChip({ status }: StatusChipProps) {
  return (
    <span className={`status-chip status-chip--${status}`}>
      {status === 'taken' ? <PersonIcon /> : <CheckCircleIcon />}
      <span>{LABEL[status]}</span>
    </span>
  );
}
