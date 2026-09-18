import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AvailabilityCount } from './AvailabilityCount.js';

describe('AvailabilityCount (US-006/AC-01)', () => {
  it('renders exactly "12 of 40 desks free · Wed 9 Sep" for the story\'s own example', () => {
    render(<AvailabilityCount status="ready" date="2026-09-09" freeCount={12} totalCount={40} />);

    expect(screen.getByText('12 of 40 desks free · Wed 9 Sep')).toBeInTheDocument();
  });
});

describe('AvailabilityCount (US-006/AC-10 — announced before it is read)', () => {
  it('is a single role=status element present in both the loading and ready states (US-006/AC-10)', () => {
    const { rerender } = render(<AvailabilityCount status="loading" date="2026-09-09" />);
    expect(screen.getByRole('status')).toBeInTheDocument();

    rerender(<AvailabilityCount status="ready" date="2026-09-09" freeCount={12} totalCount={40} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('announces one sentence while loading, not a stream', () => {
    render(<AvailabilityCount status="loading" date="2026-09-09" />);

    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Loading desk availability for Wednesday 9 September');
  });

  it('announces the long form — the visible text uses the short form instead', () => {
    render(<AvailabilityCount status="ready" date="2026-09-09" freeCount={12} totalCount={40} />);

    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('12 of 40 desks free, Wednesday 9 September');

    const visible = screen.getByText('12 of 40 desks free · Wed 9 Sep');
    expect(visible).toHaveAttribute('aria-hidden', 'true');
  });
});
