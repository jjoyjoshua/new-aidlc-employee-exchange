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

describe('StatusChip — booking-lifecycle variants (US-010/AC-05, design note §4.4)', () => {
  it('renders "Confirmed" plus an aria-hidden icon', () => {
    const { container } = render(<StatusChip kind="booking" status="confirmed" />);

    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    const icon = container.querySelector('.status-chip__icon');
    expect(icon).toBeInTheDocument();
    expect(icon?.getAttribute('aria-hidden') ?? icon?.querySelector('[aria-hidden]')?.getAttribute('aria-hidden')).toBeTruthy();
  });

  it('renders "Completed" plus an aria-hidden icon', () => {
    const { container } = render(<StatusChip kind="booking" status="completed" />);

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(container.querySelector('.status-chip__icon')).toBeInTheDocument();
  });

  it('renders "Cancelled" plus an aria-hidden icon', () => {
    const { container } = render(<StatusChip kind="booking" status="cancelled" />);

    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(container.querySelector('.status-chip__icon')).toBeInTheDocument();
  });

  it('applies a distinct class per booking variant, matching the desk variants\' convention', () => {
    const { container: confirmed } = render(<StatusChip kind="booking" status="confirmed" />);
    const { container: completed } = render(<StatusChip kind="booking" status="completed" />);
    const { container: cancelled } = render(<StatusChip kind="booking" status="cancelled" />);

    expect(confirmed.querySelector('.status-chip--confirmed')).toBeInTheDocument();
    expect(completed.querySelector('.status-chip--completed')).toBeInTheDocument();
    expect(cancelled.querySelector('.status-chip--cancelled')).toBeInTheDocument();
  });

  it('a desk-kind chip never renders a booking-lifecycle word, and vice versa (existing desk variants unaffected)', () => {
    const { container } = render(<StatusChip status="taken" />);

    expect(container.textContent).not.toMatch(/Confirmed|Completed|Cancelled/);
  });
});
