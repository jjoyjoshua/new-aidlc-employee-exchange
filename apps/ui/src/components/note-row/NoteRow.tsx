/**
 * NoteRow — SCR-004's `note-row` component (US-031). Figma library addition: an icon plus text
 * on the quiet fill, inside a card — the always-visible email promise (`icon="mail"`), ST-05's
 * refusal (`icon="block"`) and ST-06's graceful-degradation notice (`icon="info-circle"`),
 * confirmed as the SAME component with a swapped icon against `HF / SCR-004 · Settings`.
 *
 * **Deliberately not an `Alert`.** The palette carries no `info` tone, and a warning-toned
 * `Alert` would put a caution mark on sentences whose content is reassurance or a plain fact
 * (SCR-004's own structural decision table). This is why the email promise, ST-05's and ST-06's
 * text all share this component rather than `Alert` — confirmed against the real Figma frames,
 * where all three render on the identical `--c-fill-subtle` background, never a tinted one.
 */
import type { ReactNode } from 'react';
import './note-row.css';

export type NoteRowIcon = 'mail' | 'block' | 'info-circle';

export interface NoteRowProps {
  icon: NoteRowIcon;
  children: ReactNode;
}

function IconGlyph({ icon }: { icon: NoteRowIcon }) {
  if (icon === 'mail') {
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
        <path d="M3 5.5l7 5.5 7-5.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === 'block') {
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <circle cx="10" cy="10" r="7.5" />
        <path d="M4.8 4.8l10.4 10.4" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v4.5" strokeLinecap="round" />
      <path d="M10 6.5v.2" strokeLinecap="round" />
    </svg>
  );
}

export function NoteRow({ icon, children }: NoteRowProps) {
  return (
    <div className="note-row">
      <span className="note-row__icon">
        <IconGlyph icon={icon} />
      </span>
      <p className="note-row__text">{children}</p>
    </div>
  );
}
