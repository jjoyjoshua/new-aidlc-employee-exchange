import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@desk-booking/contracts';
import { UserFormDialog } from './UserFormDialog.js';
import type { UserFormDialogState } from './use-user-form-dialog.js';

const OPEN: UserFormDialogState = { mode: 'create', busy: false };
const VALID_PASSWORD = 'Correct-Horse7';

const EXISTING_ACCOUNT: AdminUser = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  fullName: 'Dana Silva',
  email: 'dana@company.com',
  role: 'employee',
  isActive: true,
};

async function fillValidForm() {
  await userEvent.type(screen.getByLabelText('Full name'), 'Dana Silva');
  await userEvent.type(screen.getByLabelText('Email'), 'dana@company.com');
  await userEvent.type(screen.getByLabelText('Initial password'), VALID_PASSWORD);
}

describe('UserFormDialog — ST-01 default (US-021/AC-07)', () => {
  it('renders the title, every field, both roles, and the delivery warning — always, before saving (US-021/AC-07)', () => {
    render(<UserFormDialog dialog={OPEN} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Add person' })).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Employee/ })).toBeChecked();
    expect(screen.getByLabelText('Initial password')).toBeInTheDocument();
    expect(screen.getByText(/isn't emailed/)).toBeInTheDocument();
  });

  it('focuses the full-name field on open', () => {
    render(<UserFormDialog dialog={OPEN} onSubmit={vi.fn()} onDismiss={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByLabelText('Full name'));
  });

  it('the five V-12 rules render pending, never blocking, before any save attempt (US-021/AC-04)', () => {
    render(<UserFormDialog dialog={OPEN} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByText('8 characters or more')).toBeInTheDocument();
    expect(screen.getByText('An upper-case letter')).toBeInTheDocument();
    expect(screen.getByText('A lower-case letter')).toBeInTheDocument();
    expect(screen.getByText('A number')).toBeInTheDocument();
    expect(screen.getByText('A special character')).toBeInTheDocument();
  });

  it('calls onDismiss when Cancel is activated', async () => {
    const onDismiss = vi.fn();
    render(<UserFormDialog dialog={OPEN} onSubmit={vi.fn()} onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('UserFormDialog — ST-03 field validation (US-021/AC-03, AC-05)', () => {
  it('calls onSubmit with the trimmed fields and the chosen role on a valid entry', async () => {
    const onSubmit = vi.fn();
    render(<UserFormDialog dialog={OPEN} onSubmit={onSubmit} onDismiss={vi.fn()} />);

    await fillValidForm();
    await userEvent.click(screen.getByRole('radio', { name: /Admin/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));

    expect(onSubmit).toHaveBeenCalledWith({
      fullName: 'Dana Silva',
      email: 'dana@company.com',
      role: 'admin',
      password: VALID_PASSWORD,
    });
  });

  it('refuses an empty full name and an implausible email, in the browser, with no request sent (US-021/AC-05)', async () => {
    const onSubmit = vi.fn();
    render(<UserFormDialog dialog={OPEN} onSubmit={onSubmit} onDismiss={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Initial password'), VALID_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));

    expect(screen.getByText('Enter a name.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('a password failing any V-12 rule is caught client-side, with no request sent (US-021/AC-03)', async () => {
    const onSubmit = vi.fn();
    render(<UserFormDialog dialog={OPEN} onSubmit={onSubmit} onDismiss={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Full name'), 'Dana Silva');
    await userEvent.type(screen.getByLabelText('Email'), 'dana@company.com');
    await userEvent.type(screen.getByLabelText('Initial password'), 'tooweak');
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('the confirming action stays enabled while the form is invalid (US-021/AC-03)', async () => {
    render(<UserFormDialog dialog={OPEN} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));

    expect(screen.getByRole('button', { name: 'Add person' })).toBeEnabled();
  });
});

describe('UserFormDialog — ST-09 all rules met (US-021/AC-04)', () => {
  it('every rule reads met once a compliant password is typed', async () => {
    render(<UserFormDialog dialog={OPEN} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Initial password'), VALID_PASSWORD);

    for (const label of ['8 characters or more', 'An upper-case letter', 'A lower-case letter', 'A number', 'A special character']) {
      expect(screen.getByText(label).closest('li')).toHaveClass('policy-checklist__row--met');
    }
  });

  it('Suggest a password fills a compliant, REVEALED value, checklist all met (US-021/AC-04, D-07, US-022/AC-01, AC-03 — no point hiding a value that must be read aloud)', async () => {
    render(<UserFormDialog dialog={OPEN} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Suggest a password' }));

    const field = screen.getByLabelText('Initial password') as HTMLInputElement;
    expect(field).toHaveAttribute('type', 'text');
    expect(field.value.length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument();
    for (const label of ['8 characters or more', 'An upper-case letter', 'A lower-case letter', 'A number', 'A special character']) {
      expect(screen.getByText(label).closest('li')).toHaveClass('policy-checklist__row--met');
    }
  });

  it('Suggest a password produces a different value on a second use (US-022/AC-04)', async () => {
    render(<UserFormDialog dialog={OPEN} onSubmit={vi.fn()} onDismiss={vi.fn()} />);
    const field = screen.getByLabelText('Initial password') as HTMLInputElement;
    const suggest = screen.getByRole('button', { name: 'Suggest a password' });

    await userEvent.click(suggest);
    const first = field.value;
    await userEvent.click(suggest);
    const second = field.value;

    expect(second).not.toBe(first);
  });

  it('a generated password is still editable — typing over it is accepted or refused by the ordinary rules (US-022/AC-05)', async () => {
    render(<UserFormDialog dialog={OPEN} onSubmit={vi.fn()} onDismiss={vi.fn()} />);
    const field = screen.getByLabelText('Initial password') as HTMLInputElement;

    await userEvent.click(screen.getByRole('button', { name: 'Suggest a password' }));
    const generated = field.value;

    await userEvent.clear(field);
    await userEvent.type(field, 'tooweak');
    expect(field.value).toBe('tooweak');
    expect(field.value).not.toBe(generated);
    expect(screen.getByText('8 characters or more').closest('li')).not.toHaveClass('policy-checklist__row--met');

    await userEvent.clear(field);
    await userEvent.type(field, VALID_PASSWORD);
    for (const label of ['8 characters or more', 'An upper-case letter', 'A lower-case letter', 'A number', 'A special character']) {
      expect(screen.getByText(label).closest('li')).toHaveClass('policy-checklist__row--met');
    }
  });

  it('a generated password submits exactly like a typed one — same shape, no marker (US-022/AC-06)', async () => {
    const onSubmit = vi.fn();
    render(<UserFormDialog dialog={OPEN} onSubmit={onSubmit} onDismiss={vi.fn()} />);
    const field = screen.getByLabelText('Initial password') as HTMLInputElement;

    await userEvent.type(screen.getByLabelText('Full name'), 'Dana Silva');
    await userEvent.type(screen.getByLabelText('Email'), 'dana@company.com');
    await userEvent.click(screen.getByRole('button', { name: 'Suggest a password' }));
    const generated = field.value;
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));

    expect(onSubmit).toHaveBeenCalledWith({
      fullName: 'Dana Silva',
      email: 'dana@company.com',
      role: 'employee',
      password: generated,
    });
  });
});

describe('UserFormDialog — ST-04 duplicate email (US-021/AC-06)', () => {
  it('renders the holder\'s name for an active account, and the field\'s own short message', () => {
    const dialog: UserFormDialogState = {
      mode: 'create',
      busy: false,
      outcome: 'duplicate',
      duplicateFullName: 'Dana Silva',
      duplicateIsActive: true,
    };
    render(<UserFormDialog dialog={dialog} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByText('already belongs to Dana Silva.')).toBeInTheDocument();
    expect(screen.getByText('Already in use.')).toBeInTheDocument();
  });

  it('adds the reactivation sentence for a deactivated holder', () => {
    const dialog: UserFormDialogState = {
      mode: 'create',
      busy: false,
      outcome: 'duplicate',
      duplicateFullName: 'Former Employee',
      duplicateIsActive: false,
    };
    render(<UserFormDialog dialog={dialog} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByText(/reactivate it on the people list/)).toBeInTheDocument();
  });
});

describe('UserFormDialog — ST-06 saving (US-021/AC-11)', () => {
  it('the confirming action is busy and fields are read-only while saving', () => {
    render(<UserFormDialog dialog={{ mode: 'create', busy: true }} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByLabelText('Full name')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});

describe('UserFormDialog — ST-08 save failed (US-021/AC-11)', () => {
  it('retains every typed value, including the password', async () => {
    const { rerender } = render(<UserFormDialog dialog={OPEN} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    await fillValidForm();
    rerender(<UserFormDialog dialog={{ mode: 'create', busy: false, outcome: 'failed' }} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByText(/couldn't save that just now/)).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveValue('Dana Silva');
    expect(screen.getByLabelText('Email')).toHaveValue('dana@company.com');
    expect(screen.getByLabelText('Initial password')).toHaveValue(VALID_PASSWORD);
  });
});

describe('UserFormDialog — ST-02 edit default (US-023/AC-01)', () => {
  const EDIT_OPEN: UserFormDialogState = { mode: 'edit', account: EXISTING_ACCOUNT, busy: false };

  it('renders the edit title, prefilled name/email, no password field, and the reset-password note', () => {
    render(<UserFormDialog dialog={EDIT_OPEN} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Edit person — Dana Silva' })).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveValue('Dana Silva');
    expect(screen.getByLabelText('Email')).toHaveValue('dana@company.com');
    expect(screen.queryByLabelText('Initial password')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suggest a password' })).not.toBeInTheDocument();
    expect(screen.queryByText(/isn't emailed/)).not.toBeInTheDocument();
    expect(screen.getByText('To change their password, use Reset password on the people list.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('appends the (you) marker when editing the signed-in administrator\'s own account (US-023/AC-01, SCR-009:191)', () => {
    render(<UserFormDialog dialog={EDIT_OPEN} onSubmit={vi.fn()} onDismiss={vi.fn()} currentUserId={EXISTING_ACCOUNT.id} />);

    expect(screen.getByRole('dialog', { name: 'Edit person — Dana Silva (you)' })).toBeInTheDocument();
  });

  it('does not show (you) when editing a different account', () => {
    render(<UserFormDialog dialog={EDIT_OPEN} onSubmit={vi.fn()} onDismiss={vi.fn()} currentUserId="someone-else" />);

    expect(screen.getByRole('dialog', { name: 'Edit person — Dana Silva' })).toBeInTheDocument();
  });

  it('the role radios show the current role and are LIVE — no aria-disabled, US-024 is this control\'s destination', () => {
    render(<UserFormDialog dialog={EDIT_OPEN} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    const employeeRadio = screen.getByRole('radio', { name: /Employee/ });
    expect(employeeRadio).toBeChecked();
    expect(employeeRadio).not.toBeDisabled();
    expect(employeeRadio).not.toHaveAttribute('aria-disabled');
  });

  it('calls onSubmit with fullName/email AND the current role — no password (US-023/AC-01, AC-07; US-024/AC-01)', async () => {
    const onSubmit = vi.fn();
    render(<UserFormDialog dialog={EDIT_OPEN} onSubmit={onSubmit} onDismiss={vi.fn()} />);

    await userEvent.clear(screen.getByLabelText('Full name'));
    await userEvent.type(screen.getByLabelText('Full name'), 'Dana Okafor');
    await userEvent.clear(screen.getByLabelText('Email'));
    await userEvent.type(screen.getByLabelText('Email'), 'dana.okafor@company.com');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSubmit).toHaveBeenCalledWith({ fullName: 'Dana Okafor', email: 'dana.okafor@company.com', role: 'employee' });
  });

  it('selecting a different role radio and saving submits the NEW role (US-024/AC-01)', async () => {
    const onSubmit = vi.fn();
    render(<UserFormDialog dialog={EDIT_OPEN} onSubmit={onSubmit} onDismiss={vi.fn()} />);

    await userEvent.click(screen.getByRole('radio', { name: /Admin/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSubmit).toHaveBeenCalledWith({ fullName: 'Dana Silva', email: 'dana@company.com', role: 'admin' });
  });

  it('refuses an empty full name and an implausible email, in the browser, with no request sent (US-023/AC-04)', async () => {
    const onSubmit = vi.fn();
    render(<UserFormDialog dialog={EDIT_OPEN} onSubmit={onSubmit} onDismiss={vi.fn()} />);

    await userEvent.clear(screen.getByLabelText('Full name'));
    await userEvent.clear(screen.getByLabelText('Email'));
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByText('Enter a name.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('UserFormDialog — ST-04 duplicate email in edit mode (US-023/AC-02)', () => {
  it('reuses the SAME Alert/field-message shape create mode uses (SCR-009, one state, two forms)', () => {
    const dialog: UserFormDialogState = {
      mode: 'edit',
      account: EXISTING_ACCOUNT,
      busy: false,
      outcome: 'duplicate',
      duplicateFullName: 'Existing Holder',
      duplicateIsActive: true,
    };
    render(<UserFormDialog dialog={dialog} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByText('already belongs to Existing Holder.')).toBeInTheDocument();
    expect(screen.getByText('Already in use.')).toBeInTheDocument();
  });
});

describe('UserFormDialog — ST-05 role change would remove the last admin (US-024/AC-04, AC-06, AC-08)', () => {
  const ADMIN_ACCOUNT: AdminUser = { ...EXISTING_ACCOUNT, fullName: 'Marcus Vale', role: 'admin' };
  const LAST_ADMIN_DIALOG: UserFormDialogState = {
    mode: 'edit',
    account: ADMIN_ACCOUNT,
    busy: false,
    outcome: 'lastAdmin',
  };

  it('renders the refusal directly above the role radios, naming the account and the consequence (D-03, shared with SCR-008 ST-09)', () => {
    render(<UserFormDialog dialog={LAST_ADMIN_DIALOG} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByText('Marcus Vale is the only active admin.')).toBeInTheDocument();
    expect(
      screen.getByText('Making this account an employee would leave nobody able to manage the system. Make someone else an admin first.'),
    ).toBeInTheDocument();
  });

  it('the role radio reverts to the stored (Admin) role — the attempted Employee selection is undone', () => {
    render(<UserFormDialog dialog={LAST_ADMIN_DIALOG} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByRole('radio', { name: /Admin/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Employee/ })).not.toBeChecked();
  });

  it('other edits (name/email) are preserved and still saveable — a rejected role change does not hold the rest of the form hostage (US-024/AC-08)', async () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <UserFormDialog dialog={{ mode: 'edit', account: ADMIN_ACCOUNT, busy: false }} onSubmit={onSubmit} onDismiss={vi.fn()} />,
    );

    await userEvent.clear(screen.getByLabelText('Full name'));
    await userEvent.type(screen.getByLabelText('Full name'), 'Marcus Webb');
    await userEvent.click(screen.getByRole('radio', { name: /Employee/ }));

    rerender(<UserFormDialog dialog={LAST_ADMIN_DIALOG} onSubmit={onSubmit} onDismiss={vi.fn()} />);

    expect(screen.getByLabelText('Full name')).toHaveValue('Marcus Webb');

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSubmit).toHaveBeenCalledWith({ fullName: 'Marcus Webb', email: 'dana@company.com', role: 'admin' });
  });

  it('no override control exists on this refusal (US-024/AC-06)', () => {
    render(<UserFormDialog dialog={LAST_ADMIN_DIALOG} onSubmit={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /understand the risk/i })).not.toBeInTheDocument();
  });
});

describe('UserFormDialog — ST-06/ST-08 saving and save-failed in edit mode (US-023/AC-08)', () => {
  it('the confirming action is busy and fields are read-only while saving', () => {
    render(
      <UserFormDialog
        dialog={{ mode: 'edit', account: EXISTING_ACCOUNT, busy: true }}
        onSubmit={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Full name')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('a save failure retains every typed value (US-023/AC-08)', async () => {
    const { rerender } = render(
      <UserFormDialog
        dialog={{ mode: 'edit', account: EXISTING_ACCOUNT, busy: false }}
        onSubmit={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    await userEvent.clear(screen.getByLabelText('Full name'));
    await userEvent.type(screen.getByLabelText('Full name'), 'Dana Okafor');
    rerender(
      <UserFormDialog
        dialog={{ mode: 'edit', account: EXISTING_ACCOUNT, busy: false, outcome: 'failed' }}
        onSubmit={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText(/couldn't save that just now/)).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveValue('Dana Okafor');
  });
});
