import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@desk-booking/contracts';
import { RoleChangeDialog, type RoleChangeDialogState } from './RoleChangeDialog.js';

const EMPLOYEE: AdminUser = { id: 'u1', fullName: 'Priya Raman', email: 'priya@company.com', role: 'employee', isActive: true };
const ADMIN: AdminUser = { id: 'u2', fullName: 'Marcus Vale', email: 'marcus@company.com', role: 'admin', isActive: true };

function renderDialog(dialog: RoleChangeDialogState, onConfirm = vi.fn(), onDismiss = vi.fn(), onRouteToPromote = vi.fn()) {
  return render(<RoleChangeDialog dialog={dialog} onConfirm={onConfirm} onDismiss={onDismiss} onRouteToPromote={onRouteToPromote} />);
}

describe('RoleChangeDialog — ST-08, promotion (US-024/AC-02)', () => {
  it('renders the promotion title, body, and the two controls', () => {
    renderDialog({ account: EMPLOYEE, targetRole: 'admin', busy: false });

    expect(screen.getByRole('alertdialog', { name: 'Make Priya Raman an admin?' })).toBeInTheDocument();
    expect(
      screen.getByText("They'll be able to see and cancel everyone's bookings, and manage desks and people."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep as is' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change role' })).toBeInTheDocument();
  });

  it('clicking Change role calls onConfirm', async () => {
    const onConfirm = vi.fn();
    renderDialog({ account: EMPLOYEE, targetRole: 'admin', busy: false }, onConfirm);

    await userEvent.click(screen.getByRole('button', { name: 'Change role' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('clicking Keep as is calls onDismiss', async () => {
    const onDismiss = vi.fn();
    renderDialog({ account: EMPLOYEE, targetRole: 'admin', busy: false }, vi.fn(), onDismiss);

    await userEvent.click(screen.getByRole('button', { name: 'Keep as is' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('RoleChangeDialog — ST-08, demotion (US-024/AC-02, edge case)', () => {
  it('renders the demotion title and body, including the booking-eligibility clause', () => {
    renderDialog({ account: ADMIN, targetRole: 'employee', busy: false });

    expect(screen.getByRole('alertdialog', { name: 'Make Marcus Vale an employee?' })).toBeInTheDocument();
    expect(
      screen.getByText("They'll lose access to bookings, desks and people — and they'll be able to book a desk for themselves."),
    ).toBeInTheDocument();
  });
});

describe('RoleChangeDialog — ST-12, busy (US-024/AC-09)', () => {
  it('disables Keep as is and the close icon, and keeps the Change role label with a spinner (US-024/AC-09)', () => {
    renderDialog({ account: EMPLOYEE, targetRole: 'admin', busy: true });

    expect(screen.getByRole('button', { name: 'Keep as is' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeDisabled();
    const confirm = screen.getByRole('button', { name: 'Change role' });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute('aria-busy', 'true');
  });
});

describe('RoleChangeDialog — ST-13, failed (US-024/AC-10)', () => {
  const FAILED: RoleChangeDialogState = { account: EMPLOYEE, targetRole: 'admin', busy: false, outcome: 'failed' };

  it('shows a danger alert naming the account and stating nothing changed', () => {
    renderDialog(FAILED);
    expect(screen.getByText("We couldn't change Priya Raman's role just now. Nothing has changed. Try again.")).toBeInTheDocument();
  });

  it('changes the dismissal to Close and the confirm to Try again', () => {
    renderDialog(FAILED);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep as is' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('Try again calls onConfirm again', async () => {
    const onConfirm = vi.fn();
    renderDialog(FAILED, onConfirm);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('RoleChangeDialog — ST-09, blocked (US-024/AC-04, AC-05, AC-06)', () => {
  const BLOCKED: RoleChangeDialogState = { account: ADMIN, targetRole: 'employee', busy: false, outcome: 'blocked' };

  it('renders the refusal naming the account and the consequence, never the confirm/deny pair', () => {
    renderDialog(BLOCKED);

    expect(screen.getByRole('alertdialog', { name: 'Marcus Vale is the only active admin.' })).toBeInTheDocument();
    expect(
      screen.getByText('Making this account an employee would leave nobody able to manage the system. Make someone else an admin first.'),
    ).toBeInTheDocument();
  });

  it('offers exactly Close and Make someone an admin — no override, no "I understand the risk" (US-024/AC-06)', () => {
    renderDialog(BLOCKED);

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make someone an admin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change role' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /understand the risk/i })).not.toBeInTheDocument();
  });

  it('Make someone an admin calls onRouteToPromote, never onConfirm (US-024/AC-05)', async () => {
    const onConfirm = vi.fn();
    const onRouteToPromote = vi.fn();
    renderDialog(BLOCKED, onConfirm, vi.fn(), onRouteToPromote);

    await userEvent.click(screen.getByRole('button', { name: 'Make someone an admin' }));

    expect(onRouteToPromote).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Close calls onDismiss', async () => {
    const onDismiss = vi.fn();
    renderDialog(BLOCKED, vi.fn(), onDismiss);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
