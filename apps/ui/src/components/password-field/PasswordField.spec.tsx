import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PasswordField } from './PasswordField.js';

describe('PasswordField (US-001/AC-05)', () => {
  it('hides the password by default (US-001/AC-05)', () => {
    render(<PasswordField label="Password" />);

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('reveals and re-hides the password (US-001/AC-05)', async () => {
    render(<PasswordField label="Password" />);

    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('announces which mode it is in, not just that it was pressed (US-001/AC-05)', async () => {
    render(<PasswordField label="Password" />);

    const toggle = screen.getByRole('button', { name: 'Show' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('puts the field before the toggle in tab order (US-001/AC-05)', async () => {
    // SCR-001 used to specify the opposite; corrected 2026-09-10. Built as originally written,
    // the tab after email would land on a visibility toggle for a field the user had not
    // reached yet.
    render(<PasswordField label="Password" />);

    await userEvent.tab();
    expect(screen.getByLabelText('Password')).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Show' })).toHaveFocus();
  });

  it('does not persist visibility across mounts (US-001/AC-05)', async () => {
    // SCR-001's security surface: the show/hide toggle does not persist across loads.
    const { unmount } = render(<PasswordField label="Password" />);
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    unmount();

    render(<PasswordField label="Password" />);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('disables the toggle while the field is read-only (US-001/AC-06)', () => {
    render(<PasswordField label="Password" readOnly value="" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'Show' })).toBeDisabled();
  });

  it('renders revealed when a caller passes visible={true} (US-021/AC-04, D-07 — Suggest a password)', () => {
    render(<PasswordField label="Password" visible onVisibleChange={() => {}} />);

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onVisibleChange rather than managing its own state once controlled (US-021/D-07)', async () => {
    const calls: boolean[] = [];
    render(<PasswordField label="Password" visible={false} onVisibleChange={(v) => calls.push(v)} />);

    await userEvent.click(screen.getByRole('button', { name: 'Show' }));

    expect(calls).toEqual([true]);
    // The field itself did not flip — the parent owns the value and re-renders with it.
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });
});
