import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusChip } from './StatusChip.js';

describe('StatusChip (US-006/AC-02 — icon and word, never colour alone, NFR-008)', () => {
  it('renders the text Available plus an icon element (US-006/AC-02)', () => {
    const { container } = render(<StatusChip status="available" />);

    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(container.querySelector('.status-chip__icon')).toBeInTheDocument();
  });

  it('renders the text "Taken" plus an icon element', () => {
    const { container } = render(<StatusChip status="taken" />);

    expect(screen.getByText('Taken')).toBeInTheDocument();
    expect(container.querySelector('.status-chip__icon')).toBeInTheDocument();
  });

  it('never names an occupant (US-006/AC-06)', () => {
    const { container } = render(<StatusChip status="taken" />);

    expect(container.textContent?.replace(/\s+/g, '')).toBe('Taken');
  });

  it('renders the text "Selected" plus an icon element (US-007/AC-01, NFR-01)', () => {
    const { container } = render(<StatusChip status="selected" />);

    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(container.querySelector('.status-chip__icon')).toBeInTheDocument();
  });
});
