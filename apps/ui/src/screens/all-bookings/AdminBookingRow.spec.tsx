import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AllBookingsListItem } from '@desk-booking/contracts';
import { AdminBookingRow, AdminBookingsTableHead } from './AdminBookingRow.js';

const ITEM: AllBookingsListItem = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  date: '2026-09-07',
  deskNumber: 'A-01',
  employeeName: 'Priya Raman',
  status: 'confirmed',
};

describe('AdminBookingRow — table layout (US-013/AC-03, AC-11; US-015/AC-01, AC-02)', () => {
  it('renders real <th>s in order Date, Desk, Employee, Status, Action (US-013/AC-11, US-015/AC-01)', () => {
    render(
      <table>
        <AdminBookingsTableHead />
      </table>,
    );

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Date', 'Desk', 'Employee', 'Status', 'Action']);
  });

  it('renders one row with all four data fields and a Cancel button when confirmed (US-013/AC-03, US-015/AC-01)', () => {
    render(
      <table>
        <tbody>
          <AdminBookingRow item={ITEM} layout="table" onCancel={vi.fn()} />
        </tbody>
      </table>,
    );

    const row = screen.getByRole('row');
    const cells = within(row).getAllByRole('cell');
    expect(cells).toHaveLength(5);
    expect(cells[0]).toHaveTextContent('Mon 7 Sep');
    expect(cells[1]).toHaveTextContent('A-01');
    expect(cells[2]).toHaveTextContent('Priya Raman');
    expect(within(cells[3] as HTMLElement).getByText('Confirmed')).toBeInTheDocument();
    expect(within(cells[4] as HTMLElement).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('calls onCancel with the item when the Cancel button is clicked (US-015/AC-01)', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <table>
        <tbody>
          <AdminBookingRow item={ITEM} layout="table" onCancel={onCancel} />
        </tbody>
      </table>,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledWith(ITEM);
  });

  it('a completed row has no Cancel button, shows an em dash, and states the reason (US-015/AC-02)', () => {
    render(
      <table>
        <tbody>
          <AdminBookingRow item={{ ...ITEM, status: 'completed' }} layout="table" onCancel={vi.fn()} />
        </tbody>
      </table>,
    );

    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    const row = screen.getByRole('row');
    expect(row.textContent).toContain('—');
    expect(screen.getByText("Past bookings can't be cancelled")).toBeInTheDocument();
  });

  it('a cancelled row has no Cancel button and states "Already cancelled" (US-015/AC-02)', () => {
    render(
      <table>
        <tbody>
          <AdminBookingRow item={{ ...ITEM, status: 'cancelled' }} layout="table" onCancel={vi.fn()} />
        </tbody>
      </table>,
    );

    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByText('Already cancelled')).toBeInTheDocument();
  });

  it('cancellability is derived from status alone, never a date comparison — a future-dated cancelled row still has no Cancel button', () => {
    render(
      <table>
        <tbody>
          <AdminBookingRow item={{ ...ITEM, date: '2099-01-05', status: 'cancelled' }} layout="table" onCancel={vi.fn()} />
        </tbody>
      </table>,
    );

    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });
});

describe('AdminBookingRow — card layout (US-013/AC-03, AC-11; US-015/AC-01, AC-02)', () => {
  it('carries the same four data fields, in the same order, plus a Cancel button when confirmed', () => {
    render(
      <ul>
        <AdminBookingRow item={ITEM} layout="card" onCancel={vi.fn()} />
      </ul>,
    );

    const card = screen.getByRole('listitem');
    expect(card.textContent).toMatch(/Mon 7 Sep.*A-01.*Priya Raman/s);
    expect(within(card).getByText('Confirmed')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('a non-cancellable row states its reason in words, visibly, in the card (US-015/AC-02)', () => {
    render(
      <ul>
        <AdminBookingRow item={{ ...ITEM, status: 'completed' }} layout="card" onCancel={vi.fn()} />
      </ul>,
    );

    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByText("Past bookings can't be cancelled")).toBeInTheDocument();
  });
});

describe('AdminBookingRow — status derivation is display-only (US-013/AC-06)', () => {
  it('renders a completed status as Completed, with its own chip', () => {
    render(
      <table>
        <tbody>
          <AdminBookingRow item={{ ...ITEM, status: 'completed' }} layout="table" onCancel={vi.fn()} />
        </tbody>
      </table>,
    );

    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders a cancelled status as Cancelled', () => {
    render(
      <ul>
        <AdminBookingRow item={{ ...ITEM, status: 'cancelled' }} layout="card" onCancel={vi.fn()} />
      </ul>,
    );

    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });
});
