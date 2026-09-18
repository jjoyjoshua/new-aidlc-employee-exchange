/**
 * EmptyState — Figma `Empty state` (node 32:187). Three contexts share this layout: no desks
 * (US-006/AC-09, ST-05 — title + body, no actions, since AC-09 forbids alternative dates and a
 * link into the admin area an Employee cannot reach), fully booked (US-009, ST-04 — title,
 * optionally a body naming the suggestion count, and `actions`), and already booked (US-007,
 * ST-10 — its own component, not this one).
 *
 * `body` is optional: US-009/AC-05's zero-suggestion case has no body text at all, only a title
 * and a "Pick another date" action.
 */
import gridMarkup from '../../assets/icon-grid.svg?raw';
import type { ReactNode } from 'react';
import './empty-state.css';

export interface EmptyStateProps {
  title: string;
  // `| undefined` (not just `?`) so a caller under `exactOptionalPropertyTypes` may pass a
  // possibly-absent value (e.g. US-009's count-keyed lead line, `undefined` at zero suggestions)
  // without first stripping the key itself.
  body?: string | undefined;
  actions?: ReactNode;
}

export function EmptyState({ title, body, actions }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {/* Figma `Icon / grid` (node 11:65) — "no bookable inventory at all". Same shape the
          sidebar's own "Desks" nav icon uses (`NavIcon`), imported directly rather than through
          that component: this is a standalone illustration, not a nav item. */}
      <span className="empty-state__icon" dangerouslySetInnerHTML={{ __html: gridMarkup }} />
      <p className="empty-state__title">{title}</p>
      {body ? <p className="empty-state__body">{body}</p> : null}
      {actions ? <div className="empty-state__actions">{actions}</div> : null}
    </div>
  );
}
