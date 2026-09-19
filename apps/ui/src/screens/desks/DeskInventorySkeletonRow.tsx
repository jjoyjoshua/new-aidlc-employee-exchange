/**
 * DeskInventorySkeletonRow — SCR-006 ST-02, Figma `Desk skeleton row` (node `208:232`).
 *
 * Deliberately separate from `all-bookings/AdminSkeletonRow`: "a skeleton only stops the table
 * jumping if it matches that table's columns, and the two admin tables do not share them" (the
 * Figma component's own documentation). Real row heights, this table's own grid: 64px table row,
 * 80px card row, 156px card-compact row — one height per layout, because every desk row carries
 * exactly two actions at every width (AC-08), unlike SCR-005's mixed cancellable/non-cancellable
 * list (US-016 design note §5.2).
 */
import './desks.css';

export type DeskInventorySkeletonRowLayout = 'table' | 'card';

export function DeskInventorySkeletonRow({ layout }: { layout: DeskInventorySkeletonRowLayout }) {
  if (layout === 'table') {
    return (
      <tr className="desk-inventory-skeleton-row desk-inventory-skeleton-row--table" aria-hidden="true">
        <td colSpan={4}>
          <span className="desk-inventory-skeleton-row__bar" />
        </td>
      </tr>
    );
  }

  return (
    <li className="desk-inventory-skeleton-row desk-inventory-skeleton-row--card" aria-hidden="true">
      <span className="desk-inventory-skeleton-row__bar" />
    </li>
  );
}
