import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminDesk } from '@desk-booking/contracts';
import { DeskInventoryRow } from './DeskInventoryRow.js';
import { UNAVAILABLE_CONTROL_REASON } from './copy.js';

const ACTIVE_DESK: AdminDesk = { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 3 };
const INACTIVE_DESK: AdminDesk = { id: 'b', deskNumber: 'C-05', isActive: false, bookedAhead: 0 };

function renderTableRow(desk: AdminDesk, onEdit: (desk: AdminDesk) => void = vi.fn()) {
  return render(
    <table>
      <tbody>
        <DeskInventoryRow desk={desk} layout="table" onEdit={onEdit} />
      </tbody>
    </table>,
  );
}

function renderCardRow(desk: AdminDesk, onEdit: (desk: AdminDesk) => void = vi.fn()) {
  return render(
    <ul>
      <DeskInventoryRow desk={desk} layout="card" onEdit={onEdit} />
    </ul>,
  );
}

describe.each([
  ['table' as const, renderTableRow],
  ['card' as const, renderCardRow],
])('DeskInventoryRow — %s layout', (_layout, renderRow) => {
  it('renders the desk number', () => {
    renderRow(ACTIVE_DESK);
    expect(screen.getByText('A-01')).toBeInTheDocument();
  });

  it('renders the Active chip with word and icon (US-016/AC-02)', () => {
    const { container } = renderRow(ACTIVE_DESK);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(container.querySelector('.status-chip__icon')).toBeInTheDocument();
  });

  it('renders the Inactive chip, quiet-neutral, never danger (US-016/AC-02, AC-03)', () => {
    const { container } = renderRow(INACTIVE_DESK);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(container.querySelector('.status-chip--inactive')).toBeInTheDocument();
    expect(container.querySelector('[class*="danger"]')).not.toBeInTheDocument();
  });

  it('renders a non-zero booked-ahead count as text (US-016/AC-04)', () => {
    renderRow(ACTIVE_DESK);
    expect(screen.getByText('3 upcoming')).toBeInTheDocument();
  });

  it('renders zero booked-ahead as an em dash paired with accessible words, never blank (US-016/AC-05)', () => {
    const { container } = renderRow(INACTIVE_DESK);
    expect(container.textContent).toContain('—');
    expect(screen.getByText('No upcoming bookings')).toBeInTheDocument();
  });

  it('renders both Edit and Deactivate as present, correctly labelled controls (US-016/AC-08)', () => {
    renderRow(ACTIVE_DESK);
    expect(screen.getByRole('button', { name: /^Edit/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Deactivate/ })).toBeInTheDocument();
  });

  it('renders Activate (not Deactivate) for an inactive desk (US-016/AC-08)', () => {
    renderRow(INACTIVE_DESK);
    expect(screen.getByRole('button', { name: /^Activate/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Deactivate/ })).not.toBeInTheDocument();
  });

  it('never renders an overflow/more menu (US-016/AC-08)', () => {
    renderRow(ACTIVE_DESK);
    expect(screen.queryByRole('button', { name: /more|options|⋯/i })).not.toBeInTheDocument();
  });

  it('the activate/deactivate control is disabled with an accessible reason (US-016/AC-06, AC-08 — removed once its own story ships)', () => {
    renderRow(ACTIVE_DESK);
    const deactivate = screen.getByRole('button', { name: /^Deactivate/ });

    expect(deactivate).toBeDisabled();
    expect(within(deactivate).getByText(UNAVAILABLE_CONTROL_REASON)).toBeInTheDocument();
  });

  it('Edit is enabled and calls onEdit with the desk (US-018/AC-01)', async () => {
    const onEdit = vi.fn();
    renderRow(ACTIVE_DESK, onEdit);
    const edit = screen.getByRole('button', { name: 'Edit' });

    expect(edit).toBeEnabled();
    expect(within(edit).queryByText(UNAVAILABLE_CONTROL_REASON)).not.toBeInTheDocument();

    await userEvent.click(edit);
    expect(onEdit).toHaveBeenCalledWith(ACTIVE_DESK);
  });
});
