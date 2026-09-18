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
});
