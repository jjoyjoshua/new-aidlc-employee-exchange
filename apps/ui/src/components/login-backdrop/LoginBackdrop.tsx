/**
 * Login backdrop — Figma `Login backdrop` (node 149:405).
 *
 * The artwork ships from this repository, not from Figma (US-001/D-12). The Figma component's
 * own description names `inception/design/assets/login-backdrop.svg` as its source of truth,
 * and `inception/design/README.md` draws the line: a frame is a *picture of* the design and
 * stays in the tool; an SVG the product ships is *part of* the design and has to be versioned,
 * reviewed and diffed like any other source. Figma's asset URLs also expire after seven days.
 *
 * The file carries geometry only — `currentColor` stroke, no page ground, no literal hex — so
 * the colour comes from `tokens.css` and the no-colour-outside-tokens rule holds.
 *
 * **Why the markup is injected rather than rendered as an `<img>`.** `currentColor` only
 * resolves when the SVG is in the document; an `<img>` would need the colour baked into the
 * file, which is the second source D-12 exists to prevent. The usual alternative,
 * `vite-plugin-svgr`, is a new dependency and that is the human's call, not a persona's
 * (`ai/standards/task-surfaces.md` §Escalate) — so this uses Vite's built-in `?raw`.
 *
 * This is **not** the unsanitized-input case `task-surfaces.md` classifies as Complex. The
 * string is a build-time import of a reviewed file in this repository; no value reaches it at
 * runtime and none can. If that ever stops being true, this stops being acceptable.
 */
import backdropMarkup from '../../assets/login-backdrop.svg?raw';
import './login-backdrop.css';

export function LoginBackdrop() {
  return (
    <div
      className="login-backdrop"
      // The file already carries role="presentation" and aria-hidden="true": it is decorative
      // and announces nothing.
      dangerouslySetInnerHTML={{ __html: backdropMarkup }}
    />
  );
}
