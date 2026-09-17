import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoginBackdrop } from './LoginBackdrop.js';

describe('LoginBackdrop (NFR-008)', () => {
  it('renders the repository SVG rather than a Figma asset URL (US-001/D-12)', () => {
    const { container } = render(<LoginBackdrop />);

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // Figma asset URLs expire after seven days. If one ever appears here, the build has taken
    // a second source for artwork this repository already versions.
    expect(container.innerHTML).not.toContain('figma.com');
  });

  it('is announced to nobody — it is a ground, not an illustration (NFR-008)', () => {
    const { container } = render(<LoginBackdrop />);

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('carries no literal colour, so both themes work from one file (US-001/FR-32)', () => {
    const { container } = render(<LoginBackdrop />);

    // Geometry only: stroke is currentColor, set from --c-illustration-line by the CSS.
    expect(container.innerHTML).toContain('currentColor');
    expect(container.innerHTML).not.toMatch(/stroke="#[0-9a-f]{3,8}"/i);
  });
});
