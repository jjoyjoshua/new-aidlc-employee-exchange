/**
 * The shell's nav icons — Figma `Icon / clock|calendar|grid|person` (nodes 11:47, 11:20, 11:65,
 * 11:9), shipped from this repository rather than left as a Figma asset URL (US-001/D-12's rule,
 * applied here). `currentColor` geometry, same reasoning as `LoginBackdrop`: the colour has to
 * come from `tokens.css`, and that only resolves once the markup is in the document, not behind
 * an `<img>` `src`.
 *
 * One file per icon **shape**, not per active/inactive colour — `currentColor` plus the caller's
 * text colour does what the Figma export does with two flattened-colour SVGs per icon.
 */
import calendarMarkup from '../../assets/icon-calendar.svg?raw';
import clockMarkup from '../../assets/icon-clock.svg?raw';
import gridMarkup from '../../assets/icon-grid.svg?raw';
import personMarkup from '../../assets/icon-person.svg?raw';

const ICONS = {
  clock: clockMarkup,
  calendar: calendarMarkup,
  grid: gridMarkup,
  person: personMarkup,
} as const;

export type NavIconName = keyof typeof ICONS;

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  // The SVG already carries role="presentation" aria-hidden="true" — it is paired with a visible
  // text label everywhere it is used.
  return <span className={className} dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}
