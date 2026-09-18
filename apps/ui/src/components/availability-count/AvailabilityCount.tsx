/**
 * AvailabilityCount — Figma `Availability count` (node 31:6). US-006/AC-01, AC-07, AC-10 are one
 * component, because the mechanism — not the markup — is what makes them hold together.
 *
 * **One live region node, always mounted, whose text changes** (design note §4.3): `role="status"`
 * present in the loading and ready states alike, same node — a region that unmounts and remounts
 * per date change would announce twice, and one that mounts with content often does not announce
 * at all. Follows `PolicyChecklist`'s precedent for a persistent polite region.
 *
 * **The visible short line is `aria-hidden`; a visually-hidden span carries the long form that is
 * actually announced** — "12 of 40 desks free, Wednesday 9 September", not the visible "12 of 40
 * desks free · Wed 9 Sep". A screen-reader user gets exactly one reading, in the fuller sentence.
 */
import type { OfficeDate } from '@desk-booking/contracts';
import { formatOfficeDateLabel, formatOfficeDateLong } from '../../lib/format-office-date.js';
import './availability-count.css';

export type AvailabilityCountProps =
  | { status: 'loading'; date: OfficeDate }
  | { status: 'ready'; date: OfficeDate; freeCount: number; totalCount: number };

export function AvailabilityCount(props: AvailabilityCountProps) {
  const longLabel = formatOfficeDateLong(props.date);

  if (props.status === 'loading') {
    return (
      <div className="availability-count" role="status">
        <span className="availability-count__skeleton" aria-hidden="true" />
        <span className="availability-count__visually-hidden">{`Loading desk availability for ${longLabel}`}</span>
      </div>
    );
  }

  const shortLabel = formatOfficeDateLabel(props.date);

  return (
    <div className="availability-count" role="status">
      <p className="availability-count__text" aria-hidden="true">
        {props.freeCount} of {props.totalCount} desks free · {shortLabel}
      </p>
      <span className="availability-count__visually-hidden">
        {props.freeCount} of {props.totalCount} desks free, {longLabel}
      </span>
    </div>
  );
}
