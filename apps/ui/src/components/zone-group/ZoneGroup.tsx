/**
 * ZoneGroup — Figma `Zone group` frame. A heading ("Zone A", US-006/AC-05) above a card that
 * supplies the white surface and the edge; each `DeskRow` inside is separated by a 1px divider,
 * per `Desk row`'s own documentation ("the zone card supplies the white and the edge").
 */
import { DeskRow } from '../desk-row/DeskRow.js';
import type { DeskAvailability } from '@desk-booking/contracts';
import './zone-group.css';

export interface ZoneGroupProps {
  letter: string;
  desks: DeskAvailability[];
}

export function ZoneGroup({ letter, desks }: ZoneGroupProps) {
  return (
    <div className="zone-group">
      <h2 className="zone-group__heading">Zone {letter}</h2>
      <div className="zone-group__card">
        {desks.map((desk, index) => (
          <div key={desk.id}>
            {index > 0 ? <div className="zone-group__divider" /> : null}
            <DeskRow deskNumber={desk.deskNumber} status={desk.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
