import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminDesk } from '@desk-booking/contracts';
import { FilterBar } from './FilterBar.js';
import { NO_FILTERS } from './filters.js';

const DESKS: AdminDesk[] = [
  { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 0 },
  { id: 'b', deskNumber: 'A-02', isActive: false, bookedAhead: 0 },
];

describe('FilterBar — the four controls (US-014/AC-01, AC-02, AC-03)', () => {
  it('renders Date from, Date to, Status and Desk, plus an inactive desk marked as such', () => {
    render(<FilterBar filters={NO_FILTERS} onChange={() => {}} desks={DESKS} desksDisabled={false} today="2026-09-16" />);

    expect(screen.getByLabelText('Date from')).toBeInTheDocument();
    expect(screen.getByLabelText('Date to')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Desk')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Desk'));
    expect(screen.getByRole('option', { name: 'A-02 (Inactive)' })).toBeInTheDocument();
  });

  it('a change to any control calls onChange with the merged filter state', () => {
    const onChange = vi.fn();
    render(<FilterBar filters={NO_FILTERS} onChange={onChange} desks={DESKS} desksDisabled={false} today="2026-09-16" />);

    fireEvent.click(screen.getByLabelText('Status'));
    fireEvent.click(screen.getByRole('option', { name: 'Confirmed' }));
    expect(onChange).toHaveBeenCalledWith({ status: 'confirmed' });
  });

  it('disables the desk Select when told to (a desk-list failure, §7.6)', () => {
    render(<FilterBar filters={NO_FILTERS} onChange={() => {}} desks={[]} desksDisabled today="2026-09-16" />);
    expect(screen.getByLabelText('Desk')).toBeDisabled();
  });
});

describe('FilterBar — Clear (US-014/AC-05)', () => {
  it('calls onChange with NO_FILTERS regardless of current state', () => {
    const onChange = vi.fn();
    render(
      <FilterBar filters={{ status: 'confirmed', deskId: 'a' }} onChange={onChange} desks={DESKS} desksDisabled={false} today="2026-09-16" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenCalledWith(NO_FILTERS);
  });
});

describe('FilterBar — the 360px collapse toggle (US-014/AC-10)', () => {
  it('starts collapsed, and aria-expanded flips on click (US-014/AC-10)', () => {
    render(<FilterBar filters={NO_FILTERS} onChange={() => {}} desks={DESKS} desksDisabled={false} today="2026-09-16" />);

    const toggle = screen.getByRole('button', { name: /Filters/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it("the panel's collapsed class tracks the toggle state", () => {
    render(<FilterBar filters={NO_FILTERS} onChange={() => {}} desks={DESKS} desksDisabled={false} today="2026-09-16" />);

    const panel = screen.getByLabelText('Date from').closest('.all-bookings-filter-bar__panel');
    expect(panel?.className).toContain('all-bookings-filter-bar__panel--collapsed');

    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    expect(panel?.className).not.toContain('all-bookings-filter-bar__panel--collapsed');
  });

  it('the four fields stay in the DOM even while collapsed — the panel is CSS-hidden, not unmounted (§7.5)', () => {
    render(<FilterBar filters={NO_FILTERS} onChange={() => {}} desks={DESKS} desksDisabled={false} today="2026-09-16" />);
    expect(screen.getByLabelText('Date from')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });
});
