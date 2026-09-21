/**
 * ZoneGroup — Figma `Zone group` frame. A heading ("Zone A", US-006/AC-05) above a card that
 * supplies the white surface and the edge; each `DeskRow` inside is separated by a 1px divider,
 * per `Desk row`'s own documentation ("the zone card supplies the white and the edge").
 *
 * US-007/AC-01, AC-02. `selectedDeskId`/`onSelectDesk` are threaded straight through to every
 * `DeskRow` — this component holds no selection state of its own, same reasoning as `DeskRow`
 * itself (Architect design note §7, F-8): the single-selection invariant lives one level up, in
 * `BookADesk.tsx`, so a zone-tabbed rebuild of this component does not inherit a rule it would
 * have to relocate.
 */
import { DeskRow } from '../desk-row/DeskRow.js';
import type { DeskAvailability } from '@desk-booking/contracts';
import './zone-group.css';

export interface ZoneGroupProps {
  letter: string;
  desks: DeskAvailability[];
  /** The one desk (by id) currently `Selected`, or none. `| undefined` because `BookADesk`
   *  assigns this conditionally (`exactOptionalPropertyTypes`). */
  selectedDeskId?: string | undefined;
  /** US-008/FR-07. The caller's usual desk (by id), already filtered to eligibility server-side
   *  — mirrors `selectedDeskId` exactly, including the `| undefined` (`exactOptionalPropertyTypes`). */
  usualDeskId?: string | undefined;
  /** Fires only for an `available` row — `DeskRow` itself already refuses to wire this for a
   *  `taken` one (US-007/AC-02). */
  onSelectDesk?: (deskId: string) => void;
  /** Issue #71 — the one desk (by id), across every zone, that is this radiogroup's roving tab
   *  stop; every other row gets `-1`. `BookADesk` owns the computation (it alone sees every
   *  zone), `| undefined` to mirror `selectedDeskId`/`usualDeskId`. */
  tabStopDeskId?: string | undefined;
}

export function ZoneGroup({ letter, desks, selectedDeskId, usualDeskId, onSelectDesk, tabStopDeskId }: ZoneGroupProps) {
  return (
    <div className="zone-group">
      <h2 className="zone-group__heading">Zone {letter}</h2>
      <div className="zone-group__card">
        {desks.map((desk, index) => (
          <div key={desk.id}>
            {index > 0 ? <div className="zone-group__divider" /> : null}
            <DeskRow
              deskNumber={desk.deskNumber}
              status={desk.status}
              selected={desk.id === selectedDeskId}
              usual={desk.id === usualDeskId}
              onSelect={onSelectDesk ? () => onSelectDesk(desk.id) : undefined}
              tabIndex={desk.id === tabStopDeskId ? 0 : -1}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
