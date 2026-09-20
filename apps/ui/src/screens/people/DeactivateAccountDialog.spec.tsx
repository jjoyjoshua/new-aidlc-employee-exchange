import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@desk-booking/contracts';
import { DeactivateAccountDialog } from './DeactivateAccountDialog.js';
import type { DeactivateAccountDialogState } from './use-deactivate-account-dialog.js';

const DANA: AdminUser = { id: 'u1', fullName: 'Dana Silva', email: 'dana@company.com', role: 'employee', isActive: true };
const MARCUS: AdminUser = { id: 'u2', fullName: 'Marcus Vale', email: 'marcus@company.com', role: 'admin', isActive: true };

function renderDialog(dialog: DeactivateAccountDialogState, onConfirm = vi.fn(), onDismiss = vi.fn(), onRouteToPromote = vi.fn()) {
  return render(<DeactivateAccountDialog dialog={dialog} onConfirm={onConfirm} onDismiss={onDismiss} onRouteToPromote={onRouteToPromote} />);
}

describe('DeactivateAccountDialog — loading, before the preview resolves', () => {
  it('renders the title and a busy dialog with both actions disabled', () => {
    renderDialog({ account: DANA, phase: 'loading', bookings: [], busy: false });

    expect(screen.getByRole('alertdialog', { name: 'Deactivate Dana Silva?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep active' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeDisabled();
  });
});

describe('DeactivateAccountDialog — ST-05, no upcoming bookings (US-025/AC-07)', () => {
  const READY: DeactivateAccountDialogState = { account: DANA, phase: 'ready', bookings: [], busy: false };

  it('renders the simpler body — no cancellation clause, no count', () => {
    renderDialog(READY);

    expect(screen.getByText("They won't be able to sign in. Their past bookings are kept.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep active' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
  });

  it('clicking Deactivate calls onConfirm', async () => {
    const onConfirm = vi.fn();
    renderDialog(READY, onConfirm);
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('clicking Keep active calls onDismiss', async () => {
    const onDismiss = vi.fn();
    renderDialog(READY, vi.fn(), onDismiss);
    await userEvent.click(screen.getByRole('button', { name: 'Keep active' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('DeactivateAccountDialog — ST-06, upcoming bookings (US-025/AC-05, AC-06)', () => {
  const READY: DeactivateAccountDialogState = {
    account: DANA,
    phase: 'ready',
    bookings: [
      { id: 'b-1', deskNumber: 'A-01', date: '2026-09-08' },
      { id: 'b-2', deskNumber: 'B-02', date: '2026-09-10' },
      { id: 'b-3', deskNumber: 'A-01', date: '2026-09-14' },
    ],
    busy: false,
  };

  it('lists every booking individually and states the desk return and the email', () => {
    renderDialog(READY);

    expect(
      screen.getByText(
        "They won't be able to sign in, and their 3 upcoming bookings will be cancelled — A-01 on Tue 8 Sep, B-02 on Thu 10 Sep, A-01 on Mon 14 Sep. Those desks go back into the pool and Dana is emailed about each one. Past bookings are kept.",
      ),
    ).toBeInTheDocument();
  });

  it('the confirming action carries the count in its own label (US-025/AC-06)', () => {
    renderDialog(READY);
    expect(screen.getByRole('button', { name: 'Deactivate and cancel 3 bookings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
  });

  it('clicking the counted action calls onConfirm', async () => {
    const onConfirm = vi.fn();
    renderDialog(READY, onConfirm);
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate and cancel 3 bookings' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('DeactivateAccountDialog — ST-12, busy (US-025/AC-11)', () => {
  it('disables Keep active and the close icon, and keeps the confirm label with a spinner', () => {
    renderDialog({ account: DANA, phase: 'ready', bookings: [], busy: true });

    expect(screen.getByRole('button', { name: 'Keep active' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeDisabled();
    const confirm = screen.getByRole('button', { name: 'Deactivate' });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute('aria-busy', 'true');
  });
});

describe('DeactivateAccountDialog — ST-13, failed (US-025/AC-11)', () => {
  const FAILED: DeactivateAccountDialogState = { account: DANA, phase: 'ready', bookings: [], busy: false, outcome: 'failed' };

  it('shows a danger alert naming the account and stating nothing changed', () => {
    renderDialog(FAILED);
    expect(screen.getByText("We couldn't deactivate Dana Silva just now. Nothing has changed. Try again.")).toBeInTheDocument();
  });

  it('changes the dismissal to Close and the confirm to Try again', () => {
    renderDialog(FAILED);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep active' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('Try again calls onConfirm again', async () => {
    const onConfirm = vi.fn();
    renderDialog(FAILED, onConfirm);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('DeactivateAccountDialog — ST-07, blocked (US-025/AC-10)', () => {
  const BLOCKED: DeactivateAccountDialogState = { account: MARCUS, phase: 'ready', bookings: [], busy: false, outcome: 'blocked' };

  it('renders the refusal naming the account and the full consequence, never the confirm/deny pair', () => {
    renderDialog(BLOCKED);

    expect(screen.getByRole('alertdialog', { name: 'Marcus Vale is the only active admin.' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Deactivating this account would leave nobody able to manage desks, bookings or people — including nobody able to undo it. Make someone else an admin first.',
      ),
    ).toBeInTheDocument();
  });

  it('offers exactly Close and Make someone an admin — no override (US-025/AC-10)', () => {
    renderDialog(BLOCKED);

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make someone an admin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Deactivate/ })).not.toBeInTheDocument();
  });

  it('Make someone an admin calls onRouteToPromote, never onConfirm', async () => {
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

describe('DeactivateAccountDialog — preview_failed', () => {
  const PREVIEW_FAILED: DeactivateAccountDialogState = {
    account: DANA,
    phase: 'ready',
    bookings: [],
    busy: false,
    outcome: 'preview_failed',
  };

  it('offers only Close — nothing is known about upcoming bookings, so no confirming action is guessed', () => {
    renderDialog(PREVIEW_FAILED);

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Deactivate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep active' })).not.toBeInTheDocument();
  });

  it('Close calls onDismiss', async () => {
    const onDismiss = vi.fn();
    renderDialog(PREVIEW_FAILED, vi.fn(), onDismiss);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
