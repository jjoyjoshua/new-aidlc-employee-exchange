import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Spinner } from './Spinner.js';

describe('Spinner (US-001/AC-06)', () => {
  it('is silent by default, because the control it sits in announces the state (US-001/AC-06)', () => {
    const { container } = render(<Spinner />);

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('announces when it is the only thing reporting the state (US-001/AC-06)', () => {
    render(<Spinner label="Signing in" />);

    expect(screen.getByRole('status')).toHaveAccessibleName('Signing in');
  });

  it('inherits its colour rather than setting one (US-001/FR-32)', () => {
    // SCR-001's handoff names this by name: the in-button spinner takes the BUTTON'S label
    // colour, never a text colour. The SCR-002 build shipped it the other way and the only cue
    // that a request was in flight measured 1.02:1 on the primary button.
    const { container } = render(<Spinner />);

    expect(container.innerHTML).not.toMatch(/stroke="#[0-9a-f]{3,8}"/i);
    expect(container.innerHTML).toContain('currentColor');
  });
});
