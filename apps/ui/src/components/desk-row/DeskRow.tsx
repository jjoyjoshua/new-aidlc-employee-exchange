/**
 * DeskRow — Figma `Desk row` (node 22:148), `Rest` interaction only.
 *
 * **Presentational only in this story (US-006/AC-02, AC-03) — no selection, no `onSelect`.**
 * SCR-003's radio-group keyboard model, the left selection bar, the radio-on indicator and the
 * `Selected` chip are one design and they are US-007's to add; shipping an untested interaction
 * API now would be speculative (US-006 design note §4.4). The Figma component's radio indicator
 * and the "your usual" hint (REQ-034, a Could) are both out of this story's slice for the same
 * reason and are not rendered here.
 *
 * The full-width ROW is the touch target (≥44px, PRIN-4), not the chip inside it.
 */
import { StatusChip, type DeskStatus } from '../status-chip/StatusChip.js';
import './desk-row.css';

export interface DeskRowProps {
  deskNumber: string;
  status: DeskStatus;
}

export function DeskRow({ deskNumber, status }: DeskRowProps) {
  return (
    <div className="desk-row" data-desk-number={deskNumber}>
      <span className="desk-row__number">{deskNumber}</span>
      <StatusChip status={status} />
    </div>
  );
}
