import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeskFormDialog } from './DeskFormDialog.js';
import type { DeskFormDialogState } from './use-desk-form-dialog.js';

const OPEN: DeskFormDialogState = { mode: 'add', busy: false, collidedOnCaseOnly: false };

const BOOKED_DESK = { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 3 };
const UNBOOKED_DESK = { id: 'b', deskNumber: 'A-02', isActive: true, bookedAhead: 0 };
const ONE_HOLDER_DESK = { id: 'c', deskNumber: 'A-03', isActive: true, bookedAhead: 1 };

function editDialog(patch: Partial<DeskFormDialogState> = {}): DeskFormDialogState {
  return { mode: 'edit', desk: BOOKED_DESK, busy: false, collidedOnCaseOnly: false, ...patch };
}

describe('DeskFormDialog — ST-01 default (US-017/AC-01, AC-09)', () => {
  it('renders the title, the desk-number field with its helper, and Cancel/Add desk actions', () => {
    render(<DeskFormDialog mode="add" dialog={OPEN} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Add desk' })).toBeInTheDocument();
    expect(screen.getByLabelText('Desk number')).toBeInTheDocument();
    expect(screen.getByText(/groups desks into zones/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add desk' })).toBeInTheDocument();
  });

  it('focuses the desk-number field on open', () => {
    render(<DeskFormDialog mode="add" dialog={OPEN} onSubmit={vi.fn()} onDismiss={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByLabelText('Desk number'));
  });

  it('calls onDismiss when Cancel is activated', async () => {
    const onDismiss = vi.fn();
    render(<DeskFormDialog mode="add" dialog={OPEN} onSubmit={vi.fn()} onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('DeskFormDialog — ST-03 field validation (US-017/AC-02)', () => {
  it('calls onSubmit with a valid entry', async () => {
    const onSubmit = vi.fn();
    render(<DeskFormDialog mode="add" dialog={OPEN} onSubmit={onSubmit} onDismiss={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Desk number'), 'a-07');
    await userEvent.click(screen.getByRole('button', { name: 'Add desk' }));

    expect(onSubmit).toHaveBeenCalledWith('a-07');
  });

  it('refuses an empty entry with "Give the desk a number." and never calls onSubmit', async () => {
    const onSubmit = vi.fn();
    render(<DeskFormDialog mode="add" dialog={OPEN} onSubmit={onSubmit} onDismiss={vi.fn()} />);

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
    render(<DeskFormDialog mode="add" dialog={OPEN} onSubmit={onSubmit} onDismiss={vi.fn()} />);

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
    render(<DeskFormDialog mode="add" dialog={OPEN} onSubmit={onSubmit} onDismiss={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add desk' }));

    expect(screen.getByRole('button', { name: 'Add desk' })).toBeEnabled();
  });
});

describe('DeskFormDialog — ST-04 duplicate (US-017/AC-04)', () => {
  it('renders the collision title and keeps the typed value, WITHOUT the case sentence for an exact collision', async () => {
    const dialog: DeskFormDialogState = { mode: 'add', busy: false, outcome: 'duplicate', collidedOnCaseOnly: false };
    render(<DeskFormDialog mode="add" dialog={dialog} onSubmit={vi.fn()} onDismiss={vi.fn()} initialValue="A-01" />);

    expect(screen.getByText('A-01 is already taken by another desk.')).toBeInTheDocument();
    expect(screen.queryByText(/a-01 and A-01 count as the same/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Desk number')).toHaveValue('A-01');
  });

  it('adds the case sentence when the collision was case-only', () => {
    const dialog: DeskFormDialogState = { mode: 'add', busy: false, outcome: 'duplicate', collidedOnCaseOnly: true };
    render(<DeskFormDialog mode="add" dialog={dialog} onSubmit={vi.fn()} onDismiss={vi.fn()} initialValue="a-01" />);

    expect(screen.getByText(/a-01 and A-01 count as the same/)).toBeInTheDocument();
  });
});

describe('DeskFormDialog — ST-05 saving / AC-06', () => {
  it('shows the confirm action busy with its label kept, the field read-only, and Cancel disabled', () => {
    const dialog: DeskFormDialogState = { mode: 'add', busy: true, collidedOnCaseOnly: false };
    render(<DeskFormDialog mode="add" dialog={dialog} onSubmit={vi.fn()} onDismiss={vi.fn()} initialValue="A-01" />);

    const confirm = screen.getByRole('button', { name: 'Add desk' });
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText('Desk number')).toHaveAttribute('readonly');
  });
});

describe('DeskFormDialog — ST-07 save failed (US-017/AC-07)', () => {
  it('renders the failure alert, keeps the typed value, and the confirm label becomes Try again', () => {
    const dialog: DeskFormDialogState = { mode: 'add', busy: false, outcome: 'failed', collidedOnCaseOnly: false };
    render(<DeskFormDialog mode="add" dialog={dialog} onSubmit={vi.fn()} onDismiss={vi.fn()} initialValue="A-01" />);

    expect(screen.getByText("We couldn't save that just now. Try again.")).toBeInTheDocument();
    expect(screen.getByLabelText('Desk number')).toHaveValue('A-01');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('the field is not marked invalid on a save failure — nothing is wrong with the entry', () => {
    const dialog: DeskFormDialogState = { mode: 'add', busy: false, outcome: 'failed', collidedOnCaseOnly: false };
    render(<DeskFormDialog mode="add" dialog={dialog} onSubmit={vi.fn()} onDismiss={vi.fn()} initialValue="A-01" />);

    expect(screen.getByLabelText('Desk number')).not.toHaveAttribute('aria-invalid');
  });
});

describe('DeskFormDialog — ST-02 edit default (US-018/AC-01, AC-04, AC-09)', () => {
  it('renders "Edit desk A-01", the field prefilled, and Cancel/Save changes actions — no status radio', () => {
    render(<DeskFormDialog mode="edit" desk={BOOKED_DESK} dialog={editDialog()} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Edit desk A-01' })).toBeInTheDocument();
    expect(screen.getByLabelText('Desk number')).toHaveValue('A-01');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('prefills the field fully SELECTED, so overtyping is one action', () => {
    render(<DeskFormDialog mode="edit" desk={BOOKED_DESK} dialog={editDialog()} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    const field = screen.getByLabelText('Desk number') as HTMLInputElement;
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
  });

  it('shows the upcoming-holders warning with the real count when bookedAhead is non-zero (US-018/AC-04)', () => {
    render(<DeskFormDialog mode="edit" desk={BOOKED_DESK} dialog={editDialog()} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    expect(
      screen.getByText("3 people have this desk booked. Renaming it changes what they see — they won't be told."),
    ).toBeInTheDocument();
  });

  it('renders NO warning at all when bookedAhead is zero — absence, not a zero-count sentence (US-018/AC-04)', () => {
    render(
      <DeskFormDialog
        mode="edit"
        desk={UNBOOKED_DESK}
        dialog={editDialog({ desk: UNBOOKED_DESK })}
        onSubmit={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.queryByText(/have this desk booked/)).not.toBeInTheDocument();
    expect(screen.queryByText(/has this desk booked/)).not.toBeInTheDocument();
  });

  it('uses the singular for exactly one holder', () => {
    render(
      <DeskFormDialog
        mode="edit"
        desk={ONE_HOLDER_DESK}
        dialog={editDialog({ desk: ONE_HOLDER_DESK })}
        onSubmit={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.getByText("1 person has this desk booked. Renaming it changes what they see — they won't be told."),
    ).toBeInTheDocument();
  });

  it('associates the warning with the field via aria-describedby — read as part of the control (US-018/NFR-01)', () => {
    render(<DeskFormDialog mode="edit" desk={BOOKED_DESK} dialog={editDialog()} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    const field = screen.getByLabelText('Desk number');
    const describedBy = (field.getAttribute('aria-describedby') ?? '').split(' ');
    const warning = screen.getByText(/have this desk booked/);
    expect(describedBy).toContain(warning.closest('[id]')?.id);
  });

  it('the warning is NOT re-announced on open (live="off") — it was already true when the dialog opened', () => {
    render(<DeskFormDialog mode="edit" desk={BOOKED_DESK} dialog={editDialog()} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    const warning = screen.getByText(/have this desk booked/).closest('.alert');
    expect(warning).not.toHaveAttribute('role', 'alert');
  });

  it('calls onSubmit with the edited value', async () => {
    const onSubmit = vi.fn();
    render(<DeskFormDialog mode="edit" desk={BOOKED_DESK} dialog={editDialog()} onSubmit={onSubmit} onDismiss={vi.fn()} />);

    const field = screen.getByLabelText('Desk number');
    await userEvent.clear(field);
    await userEvent.type(field, 'b-05');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSubmit).toHaveBeenCalledWith('b-05');
  });
});

describe('DeskFormDialog — edit mode reuses ST-03/ST-04/ST-05/ST-07 unchanged (US-018)', () => {
  it('ST-04 duplicate refusal renders in edit mode with Save changes still the confirm label context', () => {
    const dialog = editDialog({ outcome: 'duplicate', collidedOnCaseOnly: false });
    render(<DeskFormDialog mode="edit" desk={BOOKED_DESK} dialog={dialog} onSubmit={vi.fn()} onDismiss={vi.fn()} initialValue="A-09" />);

    expect(screen.getByText('A-09 is already taken by another desk.')).toBeInTheDocument();
  });

  it('ST-07 failure in edit mode shows Try again and keeps the typed value (US-018/AC-08)', () => {
    const dialog = editDialog({ outcome: 'failed', collidedOnCaseOnly: false });
    render(<DeskFormDialog mode="edit" desk={BOOKED_DESK} dialog={dialog} onSubmit={vi.fn()} onDismiss={vi.fn()} initialValue="A-09" />);

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByLabelText('Desk number')).toHaveValue('A-09');
  });

  it('ST-05 saving in edit mode: Save changes busy, field read-only, Cancel disabled', () => {
    const dialog = editDialog({ busy: true });
    render(<DeskFormDialog mode="edit" desk={BOOKED_DESK} dialog={dialog} onSubmit={vi.fn()} onDismiss={vi.fn()} initialValue="A-09" />);

    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText('Desk number')).toHaveAttribute('readonly');
  });
});
