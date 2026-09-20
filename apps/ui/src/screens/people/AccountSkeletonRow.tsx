/**
 * AccountSkeletonRow — SCR-008 ST-02, `People skeleton row`. Deliberately separate from
 * `DeskInventorySkeletonRow`/`AdminSkeletonRow`: a skeleton only stops the list jumping if it
 * matches that list's own columns, and none of the three admin lists share them.
 *
 * Real row heights, this table's own grid: 64px table row, 80px card row (768-1023px), 152px
 * card-compact row (<768px) — the two card heights are CSS alone (`people.css`'s own 767.98px
 * query), matching `AccountRow`'s own two-layout, CSS-reflow shape. No dedicated spec file, same
 * as `DeskInventorySkeletonRow` — its behaviour (present while loading, real row height, both
 * trees) is covered by `People.spec.tsx`.
 */
import './people.css';

export type AccountSkeletonRowLayout = 'table' | 'card';

export function AccountSkeletonRow({ layout }: { layout: AccountSkeletonRowLayout }) {
  if (layout === 'table') {
    return (
      <tr className="people-skeleton-row people-skeleton-row--table" aria-hidden="true">
        <td colSpan={5}>
          <span className="people-skeleton-row__bar" />
        </td>
      </tr>
    );
  }

  return (
    <li className="people-skeleton-row people-skeleton-row--card" aria-hidden="true">
      <span className="people-skeleton-row__bar" />
    </li>
  );
}
