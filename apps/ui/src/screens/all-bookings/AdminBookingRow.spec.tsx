import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AllBookingsListItem } from '@desk-booking/contracts';
import { AdminBookingRow, AdminBookingsTableHead } from './AdminBookingRow.js';

const ITEM: AllBookingsListItem = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  date: '2026-09-07',
  deskNumber: 'A-01',
  employeeName: 'Priya Raman',
  status: 'confirmed',
};

describe('AdminBookingRow — table layout (US-013/AC-03, AC-11)', () => {
  it('renders real <th>s in order Date, Desk, Employee, Status (US-013/AC-11)', () => {
    render(
      <table>
        <AdminBookingsTableHead />
      </table>,
    );

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Date', 'Desk', 'Employee', 'Status']);
  });

  it('renders one row with all four fields, and no action cell (US-013/AC-03)', () => {
    render(
      <table>
        <tbody>
          <AdminBookingRow item={ITEM} layout="table" />
        </tbody>
      </table>,
    );

    const row = screen.getByRole('row');
    const cells = within(row).getAllByRole('cell');
    expect(cells).toHaveLength(4);
    expect(cells[0]).toHaveTextContent('Mon 7 Sep');
    expect(cells[1]).toHaveTextContent('A-01');
    expect(cells[2]).toHaveTextContent('Priya Raman');
    expect(within(cells[3] as HTMLElement).getByText('Confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    expect(row.textContent).not.toContain('—');
  });
});

describe('AdminBookingRow — card layout (US-013/AC-03, AC-11)', () => {
  it('carries the same four fields, in the same order, and no action (US-013/AC-03, US-013/AC-11)', () => {
    render(
      <ul>
        <AdminBookingRow item={ITEM} layout="card" />
      </ul>
    );

    const card = screen.getByRole('listitem');
    expect(card.textContent).toMatch(/Mon 7 Sep.*A-01.*Priya Raman/s);
    expect(within(card).getByText('Confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });
});

describe('AdminBookingRow — status derivation is display-only (US-013/AC-06)', () => {
  it('renders a completed status as Completed, with its own chip', () => {
    render(
      <table>
        <tbody>
          <AdminBookingRow item={{ ...ITEM, status: 'completed' }} layout="table" />
        </tbody>
      </table>,
    );

    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders a cancelled status as Cancelled', () => {
    render(
      <ul>
        <AdminBookingRow item={{ ...ITEM, status: 'cancelled' }} layout="card" />
      </ul>,
    );

    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });
});
