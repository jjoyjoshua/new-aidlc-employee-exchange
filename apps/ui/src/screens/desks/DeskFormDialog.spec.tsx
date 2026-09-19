import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeskFormDialog } from './DeskFormDialog.js';
import type { AddDeskDialogState } from './use-add-desk-dialog.js';

const OPEN: AddDeskDialogState = { busy: false, collidedOnCaseOnly: false };

describe('DeskFormDialog — ST-01 default (US-017/AC-01, AC-09)', () => {
  it('renders the title, the desk-number field with its helper, and Cancel/Add desk actions', () => {
    render(<DeskFormDialog dialog={OPEN} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Add desk' })).toBeInTheDocument();
    expect(screen.getByLabelText('Desk number')).toBeInTheDocument();
    expect(screen.getByText(/groups desks into zones/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add desk' })).toBeInTheDocument();
  });

  it('focuses the desk-number field on open', () => {
    render(<DeskFormDialog dialog={OPEN} onSubmit={vi.fn()} onDismiss={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByLabelText('Desk number'));
  });

  it('calls onDismiss when Cancel is activated', async () => {
    const onDismiss = vi.fn();
    render(<DeskFormDialog dialog={OPEN} onSubmit={vi.fn()} onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('DeskFormDialog — ST-03 field validation (US-017/AC-02)', () => {
  it('calls onSubmit with a valid entry', async () => {
    const onSubmit = vi.fn();
    render(<DeskFormDialog dialog={OPEN} onSubmit={onSubmit} onDismiss={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Desk number'), 'a-07');
    await userEvent.click(screen.getByRole('button', { name: 'Add desk' }));

    expect(onSubmit).toHaveBeenCalledWith('a-07');
  });

  it('refuses an empty entry with "Give the desk a number." and never calls onSubmit', async () => {
    const onSubmit = vi.fn();
    render(<DeskFormDialog dialog={OPEN} onSubmit={onSubmit} onDismiss={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add desk' }));

    expect(screen.getByText('Give the desk a number.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ['whitespace only', '   '],
    ['a single letter and one digit', 'A-1'],
    ['two letters', 'AA-01'],
    ['three digits', 'A-001'],
    ['free text', 'Window seat 3'],
  ])('refuses %s with the shape message and never calls onSubmit (US-017/AC-02)', async (_label, bad) => {
    const onSubmit = vi.fn();
    render(<DeskFormDialog dialog={OPEN} onSubmit={onSubmit} onDismiss={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Desk number'), bad);
    await userEvent.click(screen.getByRole('button', { name: 'Add desk' }));

    if (bad.trim().length === 0) {
      expect(screen.getByText('Give the desk a number.')).toBeInTheDocument();
    } else {
      expect(screen.getByText('Use one letter, a dash and two digits — like A-01.')).toBeInTheDocument();
    }
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('the confirming action stays enabled while the field is invalid', async () => {
    const onSubmit = vi.fn();
    render(<DeskFormDialog dialog={OPEN} onSubmit={onSubmit} onDismiss={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add desk' }));

    expect(screen.getByRole('button', { name: 'Add desk' })).toBeEnabled();
  });
});

describe('DeskFormDialog — ST-04 duplicate (US-017/AC-04)', () => {
  it('renders the collision title and keeps the typed value, WITHOUT the case sentence for an exact collision', async () => {
    const dialog: AddDeskDialogState = { busy: false, outcome: 'duplicate', collidedOnCaseOnly: false };
    render(<DeskFormDialog dialog={dialog} onSubmit={vi.fn()} onDismiss={vi.fn()} initialValue="A-01" />);

    expect(screen.getByText('A-01 is already taken by another desk.')).toBeInTheDocument();
    expect(screen.queryByText(/a-01 and A-01 count as the same/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Desk number')).toHaveValue('A-01');
  });

  it('adds the case sentence when the collision was case-only', () => {
    const dialog: AddDeskDialogState = { busy: false, outcome: 'duplicate', collidedOnCaseOnly: true };
    render(<DeskFormDialog dialog={dialog} onSubmit={vi.fn()} onDismiss={vi.fn()} initialValue="a-01" />);

    expect(screen.getByText(/a-01 and A-01 count as the same/)).toBeInTheDocument();
  });
});

describe('DeskFormDialog — ST-05 saving / AC-06', () => {
  it('shows the confirm action busy with its label kept, the field read-only, and Cancel disabled', () => {
    const dialog: AddDeskDialogState = { busy: true, collidedOnCaseOnly: false };
    render(<DeskFormDialog dialog={dialog} onSubmit={vi.fn()} onDismiss={vi.fn()} initialValue="A-01" />);

    const confirm = screen.getByRole('button', { name: 'Add desk' });
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText('Desk number')).toHaveAttribute('readonly');
  });
});

describe('DeskFormDialog — ST-07 save failed (US-017/AC-07)', () => {
  it('renders the failure alert, keeps the typed value, and the confirm label becomes Try again', () => {
    const dialog: AddDeskDialogState = { busy: false, outcome: 'failed', collidedOnCaseOnly: false };
    render(<DeskFormDialog dialog={dialog} onSubmit={vi.fn()} onDismiss={vi.fn()} initialValue="A-01" />);

    expect(screen.getByText("We couldn't save that just now. Try again.")).toBeInTheDocument();
    expect(screen.getByLabelText('Desk number')).toHaveValue('A-01');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('the field is not marked invalid on a save failure — nothing is wrong with the entry', () => {
    const dialog: AddDeskDialogState = { busy: false, outcome: 'failed', collidedOnCaseOnly: false };
    render(<DeskFormDialog dialog={dialog} onSubmit={vi.fn()} onDismiss={vi.fn()} initialValue="A-01" />);

    expect(screen.getByLabelText('Desk number')).not.toHaveAttribute('aria-invalid');
  });
});
