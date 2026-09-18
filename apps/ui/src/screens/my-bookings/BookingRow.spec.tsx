import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BookingRow } from './BookingRow.js';

describe('BookingRow (US-010/AC-01, AC-05)', () => {
  it('renders the desk number, the date, and a booking-lifecycle status chip', () => {
    render(<BookingRow deskNumber="A-01" date="2026-09-16" status="confirmed" />);

    expect(screen.getByText('Desk A-01')).toBeInTheDocument();
    expect(screen.getByText('Wed 16 Sep')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  it('renders Completed and Cancelled the same way, via the same chip (US-010/AC-04) (US-010/AC-05)', () => {
    const { rerender } = render(<BookingRow deskNumber="A-01" date="2026-09-01" status="completed" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();

    rerender(<BookingRow deskNumber="A-01" date="2026-09-25" status="cancelled" />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('renders no Cancel control (decisions.md D-05 — cancellation is a later story’s, not this one)', () => {
    render(<BookingRow deskNumber="A-01" date="2026-09-16" status="confirmed" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('applies an emphasis class for the TODAY row (ST-05), and not for an ordinary row', () => {
    const { container, rerender } = render(<BookingRow deskNumber="A-01" date="2026-09-16" status="confirmed" emphasis />);
    expect(container.querySelector('.booking-row--emphasis')).toBeInTheDocument();

    rerender(<BookingRow deskNumber="A-01" date="2026-09-16" status="confirmed" />);
    expect(container.querySelector('.booking-row--emphasis')).not.toBeInTheDocument();
  });
});
