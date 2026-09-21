import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog.js';

describe('ConfirmDialog — generic, no bookings vocabulary (D-06)', () => {
  it('renders the title and body it is given', () => {
    render(
      <ConfirmDialog
        title="Cancel this booking?"
        body="A-02 for Wed 9 Sep."
        confirmLabel="Cancel booking"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByText('Cancel this booking?')).toBeInTheDocument();
    expect(screen.getByText('A-02 for Wed 9 Sep.')).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm action, styled with the solid danger fill, is activated', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="Cancel this booking?"
        body="A-02 for Wed 9 Sep."
        confirmLabel="Cancel booking"
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );

    const confirm = screen.getByRole('button', { name: 'Cancel booking' });
    expect(confirm).toHaveClass('button--danger');
    await userEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the cancel action is activated', async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Cancel this booking?"
        body="A-02 for Wed 9 Sep."
        confirmLabel="Cancel booking"
        onConfirm={() => undefined}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel on Escape, without cancelling (i.e. without calling onConfirm)', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="Cancel this booking?"
        body="A-02 for Wed 9 Sep."
        confirmLabel="Cancel booking"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('busy disables the cancel action and shows the confirm action busy', () => {
    render(
      <ConfirmDialog
        title="Cancel this booking?"
        body="A-02 for Wed 9 Sep."
        confirmLabel="Cancel booking"
        onConfirm={() => undefined}
        onCancel={() => undefined}
        busy
      />,
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel booking' })).toHaveAttribute('aria-busy', 'true');
  });

  // US-011/AC-07, AC-08, AC-09, AC-03 — added while extending this component for its own cancel
  // flow (design note §5.1). These also cover SCR-003's existing consumer, which gets the fixes
  // for free with no prop/behaviour change to its own call shape.

  it('renders an error region via Alert when the error prop is given, announced (US-011/AC-08)', () => {
    render(
      <ConfirmDialog
        title="Cancel your desk?"
        body="A-01 · Wed 9 Sep."
        confirmLabel="Cancel booking"
        onConfirm={() => undefined}
        onCancel={() => undefined}
        error="We couldn't cancel that just now. Try again."
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("We couldn't cancel that just now. Try again.");
  });

  it('renders no error region when `error` is omitted', () => {
    render(
      <ConfirmDialog
        title="Cancel this booking?"
        body="A-02 for Wed 9 Sep."
        confirmLabel="Cancel booking"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('singleAction collapses the footer to one dismissal action, using cancelLabel, and does not render the confirm action (US-011/AC-09)', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Cancel your desk?"
        body="A-01 · Wed 9 Sep."
        confirmLabel="Cancel booking"
        cancelLabel="Close"
        onConfirm={onConfirm}
        onCancel={onCancel}
        error="That booking has already been cancelled."
        singleAction
      />,
    );

    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument();
    const close = screen.getByRole('button', { name: 'Close' });
    await userEvent.click(close);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Escape does nothing while busy — no onCancel, dialog stays as-is (US-011/AC-07, a fix — this was previously unconditional)', async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Cancel this booking?"
        body="A-02 for Wed 9 Sep."
        confirmLabel="Cancel booking"
        onConfirm={() => undefined}
        onCancel={onCancel}
        busy
      />,
    );

    await userEvent.keyboard('{Escape}');

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('renders a close (✕) icon in the header that calls onCancel, and is disabled while busy (US-011/AC-03)', async () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConfirmDialog
        title="Cancel this booking?"
        body="A-02 for Wed 9 Sep."
        confirmLabel="Cancel booking"
        onConfirm={() => undefined}
        onCancel={onCancel}
      />,
    );

    const closeIcon = screen.getByRole('button', { name: /dismiss/i });
    await userEvent.click(closeIcon);
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(
      <ConfirmDialog
        title="Cancel this booking?"
        body="A-02 for Wed 9 Sep."
        confirmLabel="Cancel booking"
        onConfirm={() => undefined}
        onCancel={onCancel}
        busy
      />,
    );
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeDisabled();
  });

  it('traps Tab focus within the dialog (US-011/AC-03, US-033/AC-07)', async () => {
    render(
      <ConfirmDialog
        title="Cancel this booking?"
        body="A-02 for Wed 9 Sep."
        confirmLabel="Cancel booking"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    const dialog = screen.getByRole('alertdialog');
    const focusables = Array.from(dialog.querySelectorAll('button')) as HTMLElement[];
    expect(focusables.length).toBeGreaterThan(0);

    // Tabbing from the last focusable wraps back to the first, never escaping the dialog.
    focusables[focusables.length - 1]?.focus();
    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Shift+Tab from the first focusable wraps to the last.
    focusables[0]?.focus();
    await userEvent.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('restores focus to the element that had it before the dialog opened, on unmount (US-011/AC-03, US-033/AC-07)', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Cancel';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      <ConfirmDialog
        title="Cancel this booking?"
        body="A-02 for Wed 9 Sep."
        confirmLabel="Cancel booking"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(document.activeElement).not.toBe(trigger);

    unmount();

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
