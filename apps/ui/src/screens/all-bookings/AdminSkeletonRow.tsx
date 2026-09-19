/**
 * AdminSkeletonRow — screen-private, not `components/skeleton-row/`'s `SkeletonRow`. That
 * component is sized to `--desk-row-height` and shared by SCR-002/SCR-003; widening it for this
 * screen's own row heights would be a shared-component change (design note §6.3, this story's
 * folder in `inception/specs/`).
 *
 * Real row height per layout, matching the real `AdminBookingRow` exactly so nothing shifts when
 * data lands (US-013/AC-09): 64px table row, 80px one-line card, **188px** stacked card. US-015
 * makes a mixed list of cancellable (188px) and non-cancellable (160px) 360px cards; the skeleton
 * can only match one shape, and 188px matches the common case — PRIN-1's "arrives showing today,"
 * and today's rows are the cancellable ones (design note §5.5, `decisions.md` D-04). One skeleton
 * per layout, same dual-tree/CSS-switch shape as the real row.
 */
import './all-bookings.css';

export type AdminSkeletonRowLayout = 'table' | 'card';

export function AdminSkeletonRow({ layout }: { layout: AdminSkeletonRowLayout }) {
  if (layout === 'table') {
    return (
      <tr className="admin-bookings-skeleton-row admin-bookings-skeleton-row--table" aria-hidden="true">
        <td colSpan={5}>
          <span className="admin-bookings-skeleton-row__bar" />
        </td>
      </tr>
    );
  }

  return (
    <li className="admin-bookings-skeleton-row admin-bookings-skeleton-row--card" aria-hidden="true">
      <span className="admin-bookings-skeleton-row__bar" />
    </li>
  );
}
