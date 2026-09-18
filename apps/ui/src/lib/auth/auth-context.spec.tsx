import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth-context.js';

/**
 * US-002 — the mechanism `signOut` builds on: the browser must actually have the token to send
 * (§6.2 of the design note names the gap this closes — `getAccessToken` returned `undefined`
 * unconditionally before this story), and the request must reach the server before local state
 * is cleared, not after.
 *
 * This exercises the **real** `defaultClient` (no `client` override), against a stubbed global
 * `fetch`, so the assertion is on what actually crossed the wire — the same discipline
 * `api-client.spec.ts` uses, and the reason a UI-only sign-out test is the trap the story warns
 * about (US-002/AC-02).
 */

const SESSION = { accessToken: 'the-session-token', refreshToken: 'r', expiresAt: 1_789_200_000 };
const USER = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  email: 'priya@company.com',
  fullName: 'Priya Sharma',
  role: 'employee' as const,
  mustChangePassword: false,
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Harness() {
  const { user, signIn, signOut, setPassword } = useAuth();
  const [setPasswordResult, setSetPasswordResult] = useState('idle');
  return (
    <div>
      <div data-testid="user">{user ? user.email : 'none'}</div>
      <div data-testid="mustChangePassword">{user ? String(user.mustChangePassword) : 'n/a'}</div>
      <div data-testid="setPasswordResult">{setPasswordResult}</div>
      <button onClick={() => void signIn('priya@company.com', 'correct')}>sign in</button>
      <button onClick={() => void signOut()}>sign out</button>
      <button onClick={() => void setPassword('NewPassword1!').then((r) => setSetPasswordResult(r.kind))}>
        set password
      </button>
    </div>
  );
}

function renderHarness(onSignOut: () => void = () => undefined) {
  return render(
    <AuthProvider
      onSession={() => undefined}
      onSignOut={onSignOut}
      // No stored session for these tests — they start from a clean sign-in, not a cold boot
      // (US-003's own boot sequence is covered separately below).
      getStoredSession={async () => undefined}
    >
      <Harness />
    </AuthProvider>,
  );
}

/**
 * NFR-009 — a cold boot (a page reload) must not ask for a password again while a session is
 * still inside its 30-day window, and must land on sign-in when it is not. `getStoredSession`
 * is the injectable seam over `supabaseBrowserClient` — a test never needs `VITE_SUPABASE_*`
 * (US-003 design note §5.1).
 */
describe('AuthProvider — cold-boot rehydration (US-003)', () => {
  function BootHarness() {
    const { user, status } = useAuth();
    return (
      <div>
        <div data-testid="status">{status}</div>
        <div data-testid="user">{user ? user.email : 'none'}</div>
      </div>
    );
  }

  it('renders signed in after a stored session is confirmed by the server, with no password prompt (US-003/AC-01)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: USER }));

    render(
      <AuthProvider getStoredSession={async () => ({ accessToken: SESSION.accessToken })}>
        <BootHarness />
      </AuthProvider>,
    );

    expect(await screen.findByTestId('status')).toHaveTextContent('signedIn');
    expect(screen.getByTestId('user')).toHaveTextContent('priya@company.com');
  });

  it('resolves straight to signed out with no network call when nothing is stored', async () => {
    render(
      <AuthProvider getStoredSession={async () => undefined}>
        <BootHarness />
      </AuthProvider>,
    );

    expect(await screen.findByTestId('status')).toHaveTextContent('signedOut');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs out when the server refuses the stored session (US-003/AC-03)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ statusCode: 401, code: 'session_expired', message: 'Your session has ended. Sign in again.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const onSignOut = vi.fn(async () => undefined);

    render(
      <AuthProvider getStoredSession={async () => ({ accessToken: 'a-dead-token' })} onSignOut={onSignOut}>
        <BootHarness />
      </AuthProvider>,
    );

    expect(await screen.findByTestId('status')).toHaveTextContent('signedOut');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(onSignOut).toHaveBeenCalled();
  });

  it('does not forget the stored session when the server is unreachable — an outage is not an expiry (US-003)', async () => {
    // Renders SCR-001 like any other "not signed in this tab" outcome, but — unlike AC-03's
    // expiry — never tells the browser's own Supabase client to forget the session, so the
    // NEXT boot (once the server is reachable again) can still succeed (design note §5.1, step 5).
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const onSignOut = vi.fn(async () => undefined);

    render(
      <AuthProvider getStoredSession={async () => ({ accessToken: SESSION.accessToken })} onSignOut={onSignOut}>
        <BootHarness />
      </AuthProvider>,
    );

    expect(await screen.findByTestId('status')).toHaveTextContent('signedOut');
    expect(onSignOut).not.toHaveBeenCalled();
  });
});

describe('signOut — the request carries the token this tab actually holds (US-002/AC-02)', () => {
  it('sends the bearer token obtained at sign-in, not none', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { session: SESSION, user: USER }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    renderHarness();

    await userEvent.click(screen.getByRole('button', { name: 'sign in' }));
    await screen.findByText('priya@company.com');

    await userEvent.click(screen.getByRole('button', { name: 'sign out' }));

    const signOutCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/auth/sign-out'));
    expect(signOutCall).toBeDefined();
    const init = signOutCall?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${SESSION.accessToken}`);
  });

  it('clears the signed-in user after the server confirms', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { session: SESSION, user: USER }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    renderHarness();

    await userEvent.click(screen.getByRole('button', { name: 'sign in' }));
    await screen.findByText('priya@company.com');

    await userEvent.click(screen.getByRole('button', { name: 'sign out' }));

    expect(await screen.findByText('none')).toBeInTheDocument();
  });

  it('still clears local state when the sign-out request fails to reach the server (US-002/D-04)', async () => {
    // A transport failure must not strand someone on a signed-in screen. There is no UI state
    // for a failed sign-out anywhere in the design.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { session: SESSION, user: USER })).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    renderHarness();

    await userEvent.click(screen.getByRole('button', { name: 'sign in' }));
    await screen.findByText('priya@company.com');

    await userEvent.click(screen.getByRole('button', { name: 'sign out' }));

    expect(await screen.findByText('none')).toBeInTheDocument();
  });

  it('still clears local state when forgetting the browser copy fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { session: SESSION, user: USER }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    renderHarness(() => {
      throw new Error('the browser client is unavailable');
    });

    await userEvent.click(screen.getByRole('button', { name: 'sign in' }));
    await screen.findByText('priya@company.com');

    await userEvent.click(screen.getByRole('button', { name: 'sign out' }));

    expect(await screen.findByText('none')).toBeInTheDocument();
  });
});

const MUST_CHANGE_USER = { ...USER, mustChangePassword: true };

describe('setPassword (US-004)', () => {
  it('sets the returned user, with the mark cleared, before resolving (US-004/AC-06, US-004/AC-07)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { session: SESSION, user: MUST_CHANGE_USER }))
      .mockResolvedValueOnce(jsonResponse(200, { user: { ...MUST_CHANGE_USER, mustChangePassword: false } }));

    renderHarness();

    await userEvent.click(screen.getByRole('button', { name: 'sign in' }));
    await screen.findByText('true'); // mustChangePassword testid, right after sign-in

    await userEvent.click(screen.getByRole('button', { name: 'set password' }));

    expect(await screen.findByText('ok')).toBeInTheDocument();
    expect(screen.getByTestId('mustChangePassword')).toHaveTextContent('false');
  });

  it('sends only newPassword in the body — no confirm field crosses the wire (design note §2.2)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { session: SESSION, user: MUST_CHANGE_USER }))
      .mockResolvedValueOnce(jsonResponse(200, { user: { ...MUST_CHANGE_USER, mustChangePassword: false } }));

    renderHarness();

    await userEvent.click(screen.getByRole('button', { name: 'sign in' }));
    await screen.findByText('true');
    await userEvent.click(screen.getByRole('button', { name: 'set password' }));
    await screen.findByText('ok');

    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/auth/set-password'));
    expect(call).toBeDefined();
    const body = JSON.parse((call?.[1] as RequestInit).body as string);
    expect(body).toEqual({ newPassword: 'NewPassword1!' });
  });

  it('maps password_same_as_current to same-as-current, leaving the mark untouched (US-004/AC-05)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { session: SESSION, user: MUST_CHANGE_USER }))
      .mockResolvedValueOnce(
        jsonResponse(422, {
          statusCode: 422,
          code: 'password_same_as_current',
          message: "That's the password your admin gave you.",
        }),
      );

    renderHarness();

    await userEvent.click(screen.getByRole('button', { name: 'sign in' }));
    await screen.findByText('true');

    await userEvent.click(screen.getByRole('button', { name: 'set password' }));

    expect(await screen.findByText('same-as-current')).toBeInTheDocument();
    expect(screen.getByTestId('mustChangePassword')).toHaveTextContent('true');
  });

  it('maps every other server refusal to failed — ST-06 is one state for all of them (US-004)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { session: SESSION, user: MUST_CHANGE_USER }))
      .mockResolvedValueOnce(
        jsonResponse(503, { statusCode: 503, code: 'service_unavailable', message: 'unavailable' }),
      );

    renderHarness();

    await userEvent.click(screen.getByRole('button', { name: 'sign in' }));
    await screen.findByText('true');

    await userEvent.click(screen.getByRole('button', { name: 'set password' }));

    expect(await screen.findByText('failed')).toBeInTheDocument();
  });

  it('stores a fresh session when one travels in the response, and uses it on the next request (design note §6.4)', async () => {
    // Confirmed 2026-09-18 against the real Supabase project: the password write revokes the
    // token the request itself was authorised with. Proven here the same way US-002 proved
    // signOut's token handling — by asserting what actually crosses the wire next.
    const freshSession = { accessToken: 'fresh-token', refreshToken: 'fresh-refresh', expiresAt: 1_789_200_000 };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { session: SESSION, user: MUST_CHANGE_USER }))
      .mockResolvedValueOnce(
        jsonResponse(200, { user: { ...MUST_CHANGE_USER, mustChangePassword: false }, session: freshSession }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    renderHarness();

    await userEvent.click(screen.getByRole('button', { name: 'sign in' }));
    await screen.findByText('true');
    await userEvent.click(screen.getByRole('button', { name: 'set password' }));
    await screen.findByText('ok');

    await userEvent.click(screen.getByRole('button', { name: 'sign out' }));

    const signOutCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/auth/sign-out'));
    const init = signOutCall?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${freshSession.accessToken}`);
  });

  it('maps a transport failure to failed as well (US-004 edge case — a save failure that is not AC-05)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { session: SESSION, user: MUST_CHANGE_USER }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    renderHarness();

    await userEvent.click(screen.getByRole('button', { name: 'sign in' }));
    await screen.findByText('true');

    await userEvent.click(screen.getByRole('button', { name: 'set password' }));

    expect(await screen.findByText('failed')).toBeInTheDocument();
  });
});
