import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@desk-booking/contracts';
import { ResetPasswordDialog } from './ResetPasswordDialog.js';
import type { ResetPasswordDialogState } from './use-reset-password-dialog.js';

const EMPLOYEE: AdminUser = { id: 'u1', fullName: 'Dana Silva', email: 'dana@company.com', role: 'employee', isActive: true };
const PASSWORD = 'q4Lm1I0oTz8v';

function renderDialog(dialog: ResetPasswordDialogState, onConfirm = vi.fn(), onDismiss = vi.fn()) {
  return render(<ResetPasswordDialog dialog={dialog} onConfirm={onConfirm} onDismiss={onDismiss} />);
}

describe('ResetPasswordDialog — ST-10, confirm (US-027/AC-02)', () => {
  it('renders the title, all four body clauses, and the two controls (US-027/AC-02)', () => {
    renderDialog({ phase: 'confirm', account: EMPLOYEE, busy: false });

    expect(screen.getByRole('alertdialog', { name: "Reset Dana Silva's password?" })).toBeInTheDocument();
    expect(screen.getByText(/show it to you once/)).toBeInTheDocument();
    expect(screen.getByText(/isn't emailed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset password' })).toBeInTheDocument();
  });

  it('clicking Reset password calls onConfirm', async () => {
    const onConfirm = vi.fn();
    renderDialog({ phase: 'confirm', account: EMPLOYEE, busy: false }, onConfirm);

    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('clicking Cancel calls onDismiss', async () => {
    const onDismiss = vi.fn();
    renderDialog({ phase: 'confirm', account: EMPLOYEE, busy: false }, vi.fn(), onDismiss);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('ResetPasswordDialog — ST-12, busy (US-027/AC-09)', () => {
  it('disables Cancel and the close icon, and keeps the Reset password label with a spinner', () => {
    renderDialog({ phase: 'confirm', account: EMPLOYEE, busy: true });

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeDisabled();
    const confirm = screen.getByRole('button', { name: 'Reset password' });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute('aria-busy', 'true');
  });

  it('Escape does nothing while busy (inherited Dialog behaviour)', async () => {
    const onDismiss = vi.fn();
    renderDialog({ phase: 'confirm', account: EMPLOYEE, busy: true }, vi.fn(), onDismiss);
    await userEvent.keyboard('{Escape}');
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('ResetPasswordDialog — ST-13, failed (US-027/AC-09)', () => {
  const FAILED: ResetPasswordDialogState = { phase: 'confirm', account: EMPLOYEE, busy: false, outcome: 'failed' };

  it('shows a danger alert naming the account and stating nothing changed', () => {
    renderDialog(FAILED);
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't reset Dana Silva's password just now. Nothing has changed. Try again.");
  });

  it('changes the dismissal to Close and the confirm to Try again', () => {
    renderDialog(FAILED);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('Try again calls onConfirm again', async () => {
    const onConfirm = vi.fn();
    renderDialog(FAILED, onConfirm);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('ResetPasswordDialog — ST-11, result — shown once (US-027/AC-03, AC-04, AC-05)', () => {
  const RESULT: ResetPasswordDialogState = { phase: 'result', account: EMPLOYEE, password: PASSWORD };

  it('renders the title naming the account, the body, and the password in a read-only field', () => {
    renderDialog(RESULT);

    expect(screen.getByRole('alertdialog', { name: "Dana Silva's new password" })).toBeInTheDocument();
    expect(screen.getByText(/only time/)).toBeInTheDocument();
    const field = screen.getByDisplayValue(PASSWORD);
    expect(field).toHaveAttribute('readonly');
  });

  it('renders NO close icon — dismissible={false} wired for the result phase (US-027/AC-04)', () => {
    renderDialog(RESULT);
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it('Escape does nothing — the result cannot be dismissed except by Done (US-027/AC-04)', async () => {
    const onDismiss = vi.fn();
    renderDialog(RESULT, vi.fn(), onDismiss);
    await userEvent.keyboard('{Escape}');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('offers exactly Done — no Cancel, no Copy-and-close conflation', () => {
    renderDialog(RESULT);
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('clicking Done calls onDismiss', async () => {
    const onDismiss = vi.fn();
    renderDialog(RESULT, vi.fn(), onDismiss);
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('the password field gets initial focus — a screen-reader user hears the credential before the instructions (US-027/AC-03)', () => {
    renderDialog(RESULT);
    expect(document.activeElement).toBe(screen.getByDisplayValue(PASSWORD));
  });

  it('Copy writes the exact password to the clipboard and confirms IN PLACE, announced via a live region (US-027/AC-03)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderDialog(RESULT);

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith(PASSWORD);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(screen.getByText('Copied', { selector: '[aria-live="polite"]' })).toBeInTheDocument();
  });
});
