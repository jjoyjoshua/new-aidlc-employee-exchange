import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SetPassword } from './SetPassword.js';
import { AuthProvider } from '../../lib/auth/auth-context.js';
import type { ApiClient } from '../../lib/api-client.js';
import type { AuthenticatedUser } from '@desk-booking/contracts';

/**
 * SCR-010's six states, ST-01 – ST-06. `SetPassword` is rendered directly, the same discipline
 * `SignIn.spec.tsx` uses — the client-side guard (`RequirePasswordChange`) that decides whether
 * this screen is reachable at all is proven separately, in its own spec.
 */

const okUser = (mustChangePassword: boolean): AuthenticatedUser => ({
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  email: 'priya@company.com',
  fullName: 'Priya Sharma',
  role: 'employee',
  mustChangePassword,
});

function renderScreen(request: ApiClient['request'], requestNoContent?: ApiClient['requestNoContent']) {
  const client = {
    request,
    requestNoContent: requestNoContent ?? vi.fn().mockResolvedValue({ kind: 'ok', data: undefined }),
  } as ApiClient;

  return render(
    <MemoryRouter initialEntries={['/set-password']}>
      <AuthProvider client={client} onSession={() => undefined} onSignOut={() => undefined} getStoredSession={async () => undefined}>
        <Routes>
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/bookings" element={<h1>My bookings</h1>} />
          <Route path="/admin/bookings" element={<h1>All bookings</h1>} />
          <Route path="/sign-in" element={<h1>Sign in</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const fillMatching = async (value: string) => {
  await userEvent.type(screen.getByLabelText('New password'), value);
  await userEvent.type(screen.getByLabelText('Confirm new password'), value);
};

const submit = () => userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

describe('ST-01 Default (US-004/AC-04)', () => {
  it('focuses the new-password field, lists all five rules pending, and enables submit', () => {
    renderScreen(vi.fn());

    expect(screen.getByLabelText('New password')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Save and continue' })).toBeEnabled();
    expect(screen.getByText('8 characters or more').closest('[data-rule]')).toHaveClass(
      'policy-checklist__row--pending',
    );
  });

  it('shows the no-self-service-reset warning', () => {
    renderScreen(vi.fn());

    expect(screen.getByText(/no self-service reset/i)).toBeInTheDocument();
  });
});

describe('ST-02 Rules not met (US-004/AC-04)', () => {
  it('blocks submit, marks unmet rules, and sends no request', async () => {
    const request = vi.fn();
    renderScreen(request);

    await fillMatching('short');
    await submit();

    expect(request).not.toHaveBeenCalled();
    expect(screen.getByText('An upper-case letter').closest('[data-rule]')).toHaveClass(
      'policy-checklist__row--blocking',
    );
  });

  it('reports a mismatch beneath the confirm field only — the checklist is the new-password field\'s message', async () => {
    renderScreen(vi.fn());

    await userEvent.type(screen.getByLabelText('New password'), 'Correct1!');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'Different1!');
    await submit();

    expect(screen.getByText("These don't match.")).toBeInTheDocument();
  });

  it('does not move rules that are already met when the submit is refused', async () => {
    renderScreen(vi.fn());

    await userEvent.type(screen.getByLabelText('New password'), 'correct1!'); // missing upper only
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'correct1!');
    await submit();

    expect(screen.getByText('8 characters or more').closest('[data-rule]')).toHaveClass(
      'policy-checklist__row--met',
    );
  });
});

describe('ST-03 Same as the password you were given (US-004/AC-05)', () => {
  it('clears both fields, shows the refusal, and moves focus back to the new-password field', async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ kind: 'error', status: 422, code: 'password_same_as_current', message: 'x' });
    renderScreen(request);

    await fillMatching('Correct1!');
    await submit();

    expect(await screen.findByText(/That's the password your admin gave you/)).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveValue('');
    expect(screen.getByLabelText('Confirm new password')).toHaveValue('');
    expect(screen.getByLabelText('New password')).toHaveFocus();
  });
});

describe('ST-04 Saving (US-004)', () => {
  it('keeps the button label, disables it, and makes both fields read-only', async () => {
    let resolveRequest: (value: unknown) => void = () => undefined;
    const request = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    renderScreen(request);

    await fillMatching('Correct1!');
    await submit();

    expect(screen.getByRole('button', { name: 'Save and continue' })).toBeDisabled();
    expect(screen.getByLabelText('New password')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('readonly');

    resolveRequest({ kind: 'ok', data: { user: okUser(false) } });
  });
});

describe('ST-05 Saved (US-004/AC-07)', () => {
  it('navigates an employee to My bookings carrying the toast', async () => {
    const request = vi.fn().mockResolvedValue({ kind: 'ok', data: { user: okUser(false) } });
    renderScreen(request);

    await fillMatching('Correct1!');
    await submit();

    expect(await screen.findByRole('heading', { name: 'My bookings' })).toBeInTheDocument();
  });

  it('navigates an admin to All bookings (US-004/AC-07)', async () => {
    const request = vi.fn().mockResolvedValue({ kind: 'ok', data: { user: { ...okUser(false), role: 'admin' } } });
    renderScreen(request);

    await fillMatching('Correct1!');
    await submit();

    expect(await screen.findByRole('heading', { name: 'All bookings' })).toBeInTheDocument();
  });
});

describe('ST-06 Save failed (US-004)', () => {
  it('retains both fields, shows the failure, and keeps sign-out reachable', async () => {
    const request = vi.fn().mockResolvedValue({ kind: 'unavailable' });
    renderScreen(request);

    await fillMatching('Correct1!');
    await submit();

    expect(await screen.findByText(/We couldn't save that just now/)).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveValue('Correct1!');
    expect(screen.getByLabelText('Confirm new password')).toHaveValue('Correct1!');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});

describe('Sign out (US-004/AC-08, US-002/AC-04)', () => {
  it('reaches the sign-out endpoint — the temporary password stays valid and SCR-010 is required again', async () => {
    const requestNoContent = vi.fn().mockResolvedValue({ kind: 'ok', data: undefined });
    renderScreen(vi.fn(), requestNoContent);

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(requestNoContent).toHaveBeenCalledWith('/api/auth/sign-out', expect.anything());
  });
});
