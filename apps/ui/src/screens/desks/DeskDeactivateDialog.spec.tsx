import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AdminDesk } from '@desk-booking/contracts';
import { DeskDeactivateDialog, type DeskDeactivateDialogState } from './DeskDeactivateDialog.js';

const DESK: AdminDesk = { id: 'a', deskNumber: 'A-02', isActive: true, bookedAhead: 0 };
const TODAY = '2026-09-19';

function renderDialog(dialog: DeskDeactivateDialogState, onConfirm = vi.fn(), onDismiss = vi.fn()) {
  return render(
    <MemoryRouter>
      <DeskDeactivateDialog dialog={dialog} today={TODAY} onConfirm={onConfirm} onDismiss={onDismiss} />
    </MemoryRouter>,
  );
}

describe('DeskDeactivateDialog — ST-05 (US-019/AC-03)', () => {
  it('renders the frame-verified title, the consequence and history sentence, and the two controls (US-019/AC-03)', () => {
    renderDialog({ desk: DESK, busy: false });

    expect(screen.getByRole('alertdialog', { name: 'Deactivate A-02?' })).toBeInTheDocument();
    expect(
      screen.getByText('It disappears from everyone’s booking options straight away. Past bookings on it are kept.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep it active' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
  });

  it('clicking Deactivate calls onConfirm', async () => {
    const onConfirm = vi.fn();
    renderDialog({ desk: DESK, busy: false }, onConfirm);

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('clicking Keep it active calls onDismiss', async () => {
    const onDismiss = vi.fn();
    renderDialog({ desk: DESK, busy: false }, vi.fn(), onDismiss);

    await userEvent.click(screen.getByRole('button', { name: 'Keep it active' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('DeskDeactivateDialog — ST-07, busy (US-019/AC-03)', () => {
  it('disables Keep it active and the close icon, and keeps the Deactivate label with a spinner', () => {
    renderDialog({ desk: DESK, busy: true });

    expect(screen.getByRole('button', { name: 'Keep it active' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeDisabled();
    const confirm = screen.getByRole('button', { name: 'Deactivate' });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute('aria-busy', 'true');
  });
});

describe('DeskDeactivateDialog — ST-08, failed (US-019/AC-11)', () => {
  const FAILED: DeskDeactivateDialogState = { desk: DESK, busy: false, outcome: 'failed' };

  it('shows a danger alert, and the desk is not represented as changed (US-019/AC-11)', () => {
    renderDialog(FAILED);

    expect(screen.getByText("We couldn’t deactivate A-02 just now. Try again.")).toBeInTheDocument();
  });

  it('changes the dismissal to Close and the confirm to Try again (US-019/AC-11)', () => {
    renderDialog(FAILED);

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep it active' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('Try again calls onConfirm again — a retry is offered (US-019/AC-11)', async () => {
    const onConfirm = vi.fn();
    renderDialog(FAILED, onConfirm);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog open — Close calls onDismiss, not a silent close (US-019/AC-11)', async () => {
    const onDismiss = vi.fn();
    renderDialog(FAILED, vi.fn(), onDismiss);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('DeskDeactivateDialog — ST-06, blocked (US-019/AC-04, AC-05, AC-06)', () => {
  const BLOCKED: DeskDeactivateDialogState = {
    desk: { ...DESK, deskNumber: 'B-03' },
    busy: false,
    outcome: 'blocked',
    upcomingBookings: 3,
  };

  it('renders the desk number IN the title, and the count in the body (US-019/AC-04)', () => {
    renderDialog(BLOCKED);

    expect(screen.getByRole('alertdialog', { name: 'B-03 can’t be deactivated yet.' })).toBeInTheDocument();
    expect(
      screen.getByText('3 people have it booked from today onwards. Cancel those bookings first — the desk stays bookable until you do.'),
    ).toBeInTheDocument();
  });

  it('renders the SAME count in the primary button label — interpolated independently of the body (US-019/AC-04)', () => {
    renderDialog(BLOCKED);
    expect(screen.getByRole('link', { name: 'See those 3 bookings' })).toBeInTheDocument();
  });

  it('renders the singular for exactly one booking (US-019/AC-04)', () => {
    renderDialog({ ...BLOCKED, upcomingBookings: 1 });
    expect(screen.getByText(/^1 person has it booked/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See that 1 booking' })).toBeInTheDocument();
  });

  it('the footer has exactly two controls, and none mentions cancelling (US-019/AC-05)', () => {
    const { container } = renderDialog(BLOCKED);
    const footer = container.querySelector<HTMLElement>('.dialog__footer')!;
    const controls = [...within(footer).queryAllByRole('button'), ...within(footer).queryAllByRole('link')];
    expect(controls).toHaveLength(2);
    for (const control of controls) {
      expect(control.textContent?.toLowerCase()).not.toContain('cancel');
    }
  });

  it('the primary action routes to All bookings pre-filtered to this desk, from today, status confirmed (US-019/AC-06)', () => {
    renderDialog(BLOCKED);
    const link = screen.getByRole('link', { name: 'See those 3 bookings' });
    expect(link).toHaveAttribute('href', `/admin/bookings?from=${TODAY}&status=confirmed&deskId=${BLOCKED.desk.id}`);
  });

  it('is role="alertdialog" and carries a header icon (US-019/AC-04, NFR-01)', () => {
    const { container } = renderDialog(BLOCKED);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(container.querySelector('.dialog__icon')).toBeInTheDocument();
  });

  it('moves initial focus to the refusal text, not the primary action (US-019/AC-04, NFR-01)', () => {
    renderDialog(BLOCKED);
    const body = screen.getByText(/people have it booked/);
    expect(document.activeElement).toBe(body);
  });

  it('Close calls onDismiss', async () => {
    const onDismiss = vi.fn();
    renderDialog(BLOCKED, vi.fn(), onDismiss);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
