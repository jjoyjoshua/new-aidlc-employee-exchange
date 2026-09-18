import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toast } from './Toast.js';

/**
 * The design system's own `Toast` component (Figma node 31:11), reused here rather than
 * invented for this story: "This is not a screen she has to dismiss: the destination carries
 * it" — SCR-010 ST-05's confirmation is the same object as SCR-003 ST-11's, and neither has a
 * dismiss control.
 */
describe('Toast (US-004/AC-07, SCR-010 ST-05)', () => {
  it('renders its message with role="status" — announced, not interrupting', () => {
    render(<Toast>Password saved. This is the one to use from now on.</Toast>);

    expect(screen.getByRole('status')).toHaveTextContent('Password saved. This is the one to use from now on.');
  });

  it('carries a check icon as well as green — colour is never the only signal (NFR-008)', () => {
    const { container } = render(<Toast>Password saved.</Toast>);

    expect(container.querySelector('.toast__icon')).toBeInTheDocument();
  });

  it('offers no dismiss control — this is not a screen she has to dismiss (Figma node 31:11)', () => {
    render(<Toast>Password saved.</Toast>);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
