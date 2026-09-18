import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SignIn } from './SignIn.js';
import { AuthProvider } from '../../lib/auth/auth-context.js';
import type { ApiClient } from '../../lib/api-client.js';
import type { AuthenticatedUser } from '@desk-booking/contracts';

/**
 * SCR-001's five states, ST-01 – ST-05.
 *
 * Every assertion here is on what a person can observe: what is on the screen, where focus
 * landed, what was announced, and whether a request was sent. None of them assert the shape of
 * the implementation.
 */

const EMPLOYEE: AuthenticatedUser = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  email: 'priya@company.com',
  fullName: 'Priya Sharma',
  role: 'employee',
  mustChangePassword: false,
};

const ADMIN: AuthenticatedUser = { ...EMPLOYEE, role: 'admin', fullName: 'Marcus Webb' };

const SESSION = { accessToken: 'a', refreshToken: 'r', expiresAt: 1_789_200_000 };

const okFor = (user: AuthenticatedUser) => ({ kind: 'ok' as const, data: { session: SESSION, user } });
const rejected = {
  kind: 'error' as const,
  status: 401,
  code: 'invalid_credentials',
  message: 'server copy that the screen does not render',
};
const unavailable = { kind: 'unavailable' as const };

function renderSignIn(request: ApiClient['request']) {
  const client = { request } as ApiClient;
  return render(
    <MemoryRouter initialEntries={['/sign-in']}>
      <AuthProvider client={client} onSession={() => undefined} getStoredSession={async () => undefined}>
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/bookings" element={<h1>My bookings</h1>} />
          <Route path="/admin/bookings" element={<h1>All bookings</h1>} />
          <Route path="/set-password" element={<h1>Set your password</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const fill = async (email: string, password: string) => {
  await userEvent.type(screen.getByLabelText('Email'), email);
  await userEvent.type(screen.getByLabelText('Password'), password);
};

const submit = () => userEvent.click(screen.getByRole('button', { name: /^Sign in$/ }));

describe('SCR-001 structural decisions (US-003/AC-05)', () => {
  it('shows no remember-me or session-length control — the default already is remember-me (US-003/AC-05)', () => {
    renderSignIn(vi.fn());

    expect(screen.queryByText(/remember me|keep me signed in|stay signed in/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('ST-01 Default (US-001/AC-05)', () => {
  it('shows both labelled fields, an enabled Sign in, and the help text (US-001/AC-05)', () => {
    renderSignIn(vi.fn());

    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByRole('button', { name: /^Sign in$/ })).toBeEnabled();
    // Static text, not a link — self-service reset is out of scope (BRD-001 §10), and a link
    // that leads nowhere is worse than no link (PRIN-5).
    expect(screen.getByText(/Contact your office admin/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /forgot/i })).not.toBeInTheDocument();
  });

  it('shows no error region before anything has been attempted (US-001/AC-05)', () => {
    renderSignIn(vi.fn());

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ST-02 Field validation error (US-001/AC-05)', () => {
  it('sends no request when a field is empty (US-001/AC-05)', async () => {
    const request = vi.fn();
    renderSignIn(request);

    await submit();

    // The assertable half of AC-05: "no sign-in request is sent".
    expect(request).not.toHaveBeenCalled();
  });

  it('marks the offending field with the reason in text (US-001/AC-05)', async () => {
    renderSignIn(vi.fn());

    await submit();

    expect(screen.getByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('moves focus to the first field with an error (US-001/AC-05)', async () => {
    renderSignIn(vi.fn());

    await submit();

    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('leaves other fields untouched (US-001/AC-05)', async () => {
    renderSignIn(vi.fn());
    await userEvent.type(screen.getByLabelText('Password'), 'something');

    await submit();

    expect(screen.getByLabelText('Password')).toHaveValue('something');
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid');
  });

  it('rejects an implausible email in the browser (US-001/AC-05)', async () => {
    const request = vi.fn();
    renderSignIn(request);
    await fill('priya-at-company', 'correct');

    await submit();

    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps the button enabled so a correction can be resubmitted (US-001/AC-05)', async () => {
    renderSignIn(vi.fn());

    await submit();

    expect(screen.getByRole('button', { name: /^Sign in$/ })).toBeEnabled();
  });
});

describe('ST-03 Submitting (US-001/AC-06)', () => {
  it('sends exactly one request when submit is activated twice (US-001/AC-06)', async () => {
    const request = vi.fn(() => new Promise(() => undefined));
    renderSignIn(request as unknown as ApiClient['request']);
    await fill('priya@company.com', 'correct');

    await submit();
    await submit();

    // "Only one sign-in request exists" — the criterion's own wording, so counting the calls
    // is the criterion rather than an assertion about the mock.
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('shows the button busy with its label kept (US-001/AC-06)', async () => {
    const request = vi.fn(() => new Promise(() => undefined));
    renderSignIn(request as unknown as ApiClient['request']);
    await fill('priya@company.com', 'correct');

    await submit();

    const button = screen.getByRole('button', { name: /Sign in/ });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Sign in');
  });

  it('makes both fields read-only while in flight (US-001/AC-06)', async () => {
    const request = vi.fn(() => new Promise(() => undefined));
    renderSignIn(request as unknown as ApiClient['request']);
    await fill('priya@company.com', 'correct');

    await submit();

    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Password')).toHaveAttribute('readonly');
  });
});

describe('ST-04 Rejected (US-001/AC-04)', () => {
  it('announces one message for a refusal (US-001/AC-04)', async () => {
    renderSignIn(vi.fn().mockResolvedValue(rejected) as unknown as ApiClient['request']);
    await fill('priya@company.com', 'wrong');

    await submit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/don't match an active account/i);
    expect(alert).toHaveTextContent(/contact your office admin/i);
  });

  it('never reveals that an account was deactivated (US-001/AC-04)', async () => {
    renderSignIn(vi.fn().mockResolvedValue(rejected) as unknown as ApiClient['request']);
    await fill('leaver@company.com', 'correct');

    await submit();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toMatch(/deactivat|inactive|disabled|no such/i);
  });

  it('clears the password and keeps the email (US-001/AC-04)', async () => {
    renderSignIn(vi.fn().mockResolvedValue(rejected) as unknown as ApiClient['request']);
    await fill('priya@company.com', 'wrong');

    await submit();

    await waitFor(() => expect(screen.getByLabelText('Password')).toHaveValue(''));
    expect(screen.getByLabelText('Email')).toHaveValue('priya@company.com');
  });

  it('moves focus to the password field (US-001/AC-04)', async () => {
    renderSignIn(vi.fn().mockResolvedValue(rejected) as unknown as ApiClient['request']);
    await fill('priya@company.com', 'wrong');

    await submit();

    await waitFor(() => expect(screen.getByLabelText('Password')).toHaveFocus());
  });

  it('offers no Try again — a refusal is not a retry (US-001/AC-04)', async () => {
    renderSignIn(vi.fn().mockResolvedValue(rejected) as unknown as ApiClient['request']);
    await fill('priya@company.com', 'wrong');

    await submit();

    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });
});

describe('ST-05 Service unavailable (US-001/AC-07)', () => {
  it('says the service is unavailable, not that the credentials were wrong (US-001/AC-07)', async () => {
    renderSignIn(vi.fn().mockResolvedValue(unavailable) as unknown as ApiClient['request']);
    await fill('priya@company.com', 'correct');

    await submit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/can't reach the booking service/i);
    expect(alert.textContent).not.toMatch(/match an active account|password|credential/i);
  });

  it('keeps both fields, password included, so a retry is one tap (US-001/AC-07)', async () => {
    renderSignIn(vi.fn().mockResolvedValue(unavailable) as unknown as ApiClient['request']);
    await fill('priya@company.com', 'correct');

    await submit();

    await screen.findByRole('alert');
    expect(screen.getByLabelText('Email')).toHaveValue('priya@company.com');
    expect(screen.getByLabelText('Password')).toHaveValue('correct');
  });

  it('carries a Try again inside the alert, with Sign in still live below (US-001/AC-07)', async () => {
    renderSignIn(vi.fn().mockResolvedValue(unavailable) as unknown as ApiClient['request']);
    await fill('priya@company.com', 'correct');

    await submit();

    const alert = await screen.findByRole('alert');
    expect(alert).toContainElement(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByRole('button', { name: /^Sign in$/ })).toBeEnabled();
  });

  it('retries the same submission from inside the alert (US-001/AC-07)', async () => {
    const request = vi.fn().mockResolvedValue(unavailable);
    renderSignIn(request as unknown as ApiClient['request']);
    await fill('priya@company.com', 'correct');
    await submit();
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });
});

describe('Landing (US-001/AC-01, US-001/AC-02)', () => {
  it('lands an employee on My bookings (US-001/AC-01)', async () => {
    renderSignIn(vi.fn().mockResolvedValue(okFor(EMPLOYEE)) as unknown as ApiClient['request']);
    await fill('priya@company.com', 'correct');

    await submit();

    expect(await screen.findByRole('heading', { name: 'My bookings' })).toBeInTheDocument();
  });

  it('lands an administrator on All bookings (US-001/AC-02)', async () => {
    renderSignIn(vi.fn().mockResolvedValue(okFor(ADMIN)) as unknown as ApiClient['request']);
    await fill('marcus@company.com', 'correct');

    await submit();

    expect(await screen.findByRole('heading', { name: 'All bookings' })).toBeInTheDocument();
  });

  it('lands a user whose password is administrator-set on Set your password, not their usual destination (US-004/AC-01)', async () => {
    renderSignIn(
      vi.fn().mockResolvedValue(okFor({ ...EMPLOYEE, mustChangePassword: true })) as unknown as ApiClient['request'],
    );
    await fill('priya@company.com', 'the-temporary-one');

    await submit();

    expect(await screen.findByRole('heading', { name: 'Set your password' })).toBeInTheDocument();
  });

  it('submits on Enter from either field (US-001/AC-05)', async () => {
    const request = vi.fn().mockResolvedValue(okFor(EMPLOYEE));
    renderSignIn(request as unknown as ApiClient['request']);
    await fill('priya@company.com', 'correct');

    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  });

  it('trims and lower-cases the email it submits (US-001/AC-01)', async () => {
    const request = vi.fn().mockResolvedValue(okFor(EMPLOYEE));
    renderSignIn(request as unknown as ApiClient['request']);
    await fill('  Priya@Company.COM  ', 'correct');

    await submit();

    await waitFor(() => expect(request).toHaveBeenCalled());
    const body = (request.mock.calls[0]?.[2] as { body: { email: string; password: string } }).body;
    expect(body.email).toBe('priya@company.com');
    // The password is never trimmed, normalised or case-folded.
    expect(body.password).toBe('correct');
  });
});
