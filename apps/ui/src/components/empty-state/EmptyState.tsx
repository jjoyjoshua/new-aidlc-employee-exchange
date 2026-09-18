/**
 * EmptyState — Figma `Empty state` (node 32:187), the "No desks" context only (US-006/AC-09,
 * ST-05). The component's other two contexts — fully booked (ST-04, next-dates suggestions) and
 * already booked (ST-10, cancel-then-book) — are US-009's and US-007's; this story renders
 * neither, so there are no `actions` here at all: AC-09 forbids alternative dates and forbids a
 * link into the admin area (an Employee cannot reach it, REQ-004).
 */
import gridMarkup from '../../assets/icon-grid.svg?raw';
import './empty-state.css';

export interface EmptyStateProps {
  title: string;
  body: string;
}

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {/* Figma `Icon / grid` (node 11:65) — "no bookable inventory at all". Same shape the
          sidebar's own "Desks" nav icon uses (`NavIcon`), imported directly rather than through
          that component: this is a standalone illustration, not a nav item. */}
      <span className="empty-state__icon" dangerouslySetInnerHTML={{ __html: gridMarkup }} />
      <p className="empty-state__title">{title}</p>
      <p className="empty-state__body">{body}</p>
    </div>
  );
}
