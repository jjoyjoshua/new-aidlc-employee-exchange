/**
 * SkeletonRow — US-006/AC-07. Same height as `DeskRow`, via the shared `--desk-row-height`
 * custom property, so nothing jumps when the real data arrives.
 *
 * `aria-hidden` — the loading state is announced once, by `AvailabilityCount`'s live region
 * (US-006/AC-10), not once per skeleton row.
 */
import './skeleton-row.css';

export function SkeletonRow() {
  return (
    <div className="skeleton-row" aria-hidden="true">
      <span className="skeleton-row__bar skeleton-row__bar--number" />
      <span className="skeleton-row__bar skeleton-row__bar--chip" />
    </div>
  );
}
