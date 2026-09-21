/**
 * One test per SCR-004 state (US-031) — signed in through the real `AuthProvider`
 * (`MyBookings.spec.tsx`'s own reasoning: faking the context tests a stub's shape, not the
 * provider's behaviour), with a path-dispatching fake `ApiClient` standing in for the server.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser, Office } from '@desk-booking/contracts';
import { Settings } from './Settings.js';
import { AuthProvider, useAuth, type AuthContextValue } from '../../lib/auth/auth-context.js';
import type { ApiClient, ApiResult } from '../../lib/api-client.js';

const EMPLOYEE: AuthenticatedUser = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  email: 'priya@company.com',
  fullName: 'Priya Sharma',
  role: 'employee',
  mustChangePassword: false,
};

const OFFICE: Office = { timezone: 'Asia/Kolkata', today: '2026-09-16' };
const VAPID_PUBLIC_KEY = 'O88gaQz1WqucBQoIRTHLl44h3g_AiFgmOeDGCpZbOJQweweXvs4O1skpArPwIJoSaSueadKE4yJysus0Vg6da-k';

type PushHandler = (path: string, init: { method?: string }) => Promise<ApiResult<unknown>>;

function SignedIn({ pushHandler }: { pushHandler: PushHandler }) {
  const client: ApiClient = {
    request: (async (path: string, _schema: unknown, init: { method?: string } = {}) => {
      if (path === '/api/auth/session' || path === '/api/auth/sign-in') {
        return { kind: 'ok', data: { session: { accessToken: 'a', refreshToken: 'r', expiresAt: 1 }, user: EMPLOYEE, office: OFFICE } };
      }
      if (path.startsWith('/api/notifications/push')) return pushHandler(path, init);
      throw new Error(`unexpected path in Settings.spec.tsx: ${path}`);
    }) as ApiClient['request'],
    requestNoContent: (async () => ({ kind: 'ok', data: undefined })) as ApiClient['requestNoContent'],
  };

  return (
    <MemoryRouter initialEntries={['/settings']}>
      <AuthProvider client={client} onSession={() => undefined} getStoredSession={async () => undefined}>
        <Primer>
          <Settings />
        </Primer>
      </AuthProvider>
    </MemoryRouter>
  );
}

function Primer({ children }: { children: ReactNode }) {
  const auth: AuthContextValue = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void auth.signIn('priya@company.com', 'correct').then(() => setReady(true));
  }, [auth]);

  return ready ? <>{children}</> : null;
}

/**
 * `unsupported: true` makes the browser GENUINELY lack all three capabilities — `delete` and
 * "leave unset", never `value: undefined` — because `'x' in window` is true for a property
 * that EXISTS with value `undefined`, which is not what an unsupported browser looks like
 * (`isPushSupported`'s own `in` checks, `lib/push-subscription.ts`).
 */
function stubNavigator(
  overrides: { serviceWorker?: unknown; PushManager?: unknown; Notification?: unknown; unsupported?: boolean } = {},
) {
  if (overrides.unsupported) {
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    return;
  }

  Object.defineProperty(navigator, 'serviceWorker', {
    value:
      overrides.serviceWorker ?? {
        register: vi.fn().mockResolvedValue({ pushManager: { subscribe: vi.fn() } }),
        ready: Promise.resolve(),
        // The silent reconcile (design note §6.4) calls this whenever the flag is already on
        // and permission is already granted — every test must stub it, not only the ones
        // deliberately exercising ST-03/ST-07's subscribe flow.
        getRegistration: vi.fn().mockResolvedValue(undefined),
      },
    configurable: true,
  });
  vi.stubGlobal('PushManager', overrides.PushManager ?? class {});
  vi.stubGlobal('Notification', overrides.Notification ?? { permission: 'default', requestPermission: vi.fn() });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Settings — ST-01 loading (US-031/AC-09)', () => {
  it('renders Your details in full while the toggle row is a skeleton (US-031/AC-09)', async () => {
    stubNavigator();
    const pushHandler: PushHandler = () => new Promise(() => {}); // never resolves

    render(<SignedIn pushHandler={pushHandler} />);

    expect(await screen.findByText('Priya Sharma')).toBeInTheDocument();
    expect(screen.getByText('priya@company.com')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});

describe('Settings — ST-02 push off (US-031/AC-01)', () => {
  it('shows the toggle off with the email promise (US-031/AC-01)', async () => {
    stubNavigator();
    const pushHandler: PushHandler = async () => ({ kind: 'ok', data: { pushOptIn: false, vapidPublicKey: VAPID_PUBLIC_KEY } });

    render(<SignedIn pushHandler={pushHandler} />);

    await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false'));
    expect(screen.getByText(/Booking emails are always sent to priya@company.com/)).toBeInTheDocument();
  });
});

describe('Settings — ST-04 push on (US-031/AC-04)', () => {
  it('shows the toggle on with the reminders-are-email-only boundary (US-031/AC-04)', async () => {
    stubNavigator({ Notification: { permission: 'granted', requestPermission: vi.fn().mockResolvedValue('granted') } });
    const pushHandler: PushHandler = async () => ({ kind: 'ok', data: { pushOptIn: true, vapidPublicKey: VAPID_PUBLIC_KEY } });

    render(<SignedIn pushHandler={pushHandler} />);

    await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByText('Day-before reminders are email only.')).toBeInTheDocument();
  });
});

describe('Settings — ST-05 permission denied (US-031/AC-05)', () => {
  it('shows the toggle off and aria-disabled, whatever the account flag says (US-031/AC-05)', async () => {
    stubNavigator({ Notification: { permission: 'denied', requestPermission: vi.fn() } });
    const pushHandler: PushHandler = async () => ({ kind: 'ok', data: { pushOptIn: true, vapidPublicKey: VAPID_PUBLIC_KEY } });

    render(<SignedIn pushHandler={pushHandler} />);

    const switchEl = await screen.findByRole('switch');
    expect(switchEl).toHaveAttribute('aria-checked', 'false');
    expect(switchEl).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/Your browser is blocking alerts for this site/)).toBeInTheDocument();
  });
});

describe('Settings — ST-06 unsupported browser (US-031/AC-06)', () => {
  it('shows no toggle at all, and says so in different words from ST-05 (US-031/AC-06)', async () => {
    stubNavigator({ unsupported: true });
    const pushHandler: PushHandler = vi.fn();

    render(<SignedIn pushHandler={pushHandler} />);

    await screen.findByText(/Booking emails are always sent/);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText("This browser doesn't support alerts. Booking emails still arrive as usual.")).toBeInTheDocument();
    expect(pushHandler).not.toHaveBeenCalled();
  });
});

describe('Settings — ST-07 change failed (US-031/AC-07)', () => {
  it('shows the failure and reverts the toggle to its last confirmed (off) position on a failed opt-in', async () => {
    stubNavigator({
      Notification: { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') },
      serviceWorker: {
        register: vi.fn().mockResolvedValue({
          pushManager: {
            subscribe: vi.fn().mockResolvedValue({
              endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
              toJSON: () => ({ keys: { p256dh: VAPID_PUBLIC_KEY, auth: '6_vGXk9KyNjRxqt5n23www' } }),
            }),
          },
        }),
        ready: Promise.resolve(),
      },
    });
    const pushHandler: PushHandler = async (path, init) => {
      if (init.method === 'POST') return { kind: 'error', status: 500, code: 'internal_error', message: 'x' };
      return { kind: 'ok', data: { pushOptIn: false, vapidPublicKey: VAPID_PUBLIC_KEY } };
    };

    render(<SignedIn pushHandler={pushHandler} />);

    await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false'));
    await userEvent.click(screen.getByRole('switch'));

    expect(await screen.findByText("We couldn't save that change. Your alerts are still off.")).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('Settings — ST-08 load error (US-031/AC-08)', () => {
  it('renders Your details in full, with the toggle replaced by an error and Try again', async () => {
    stubNavigator();
    const pushHandler: PushHandler = async () => ({ kind: 'unavailable' });

    render(<SignedIn pushHandler={pushHandler} />);

    expect(await screen.findByText("We couldn't check your alert settings. Your booking emails are unaffected.")).toBeInTheDocument();
    expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('Settings — the responsive column (US-031/AC-11)', () => {
  it('renders the capped, narrow column the three widths share — 640px desktop, 520px at 768 (US-031/AC-11)', async () => {
    stubNavigator();
    const pushHandler: PushHandler = async () => ({ kind: 'ok', data: { pushOptIn: false, vapidPublicKey: VAPID_PUBLIC_KEY } });

    const { container } = render(<SignedIn pushHandler={pushHandler} />);

    await screen.findByText('Priya Sharma');
    // The full three-width sweep (360/768/1280, no horizontal scroll) is a manual/visual
    // check, US-033's own job (its own story: "this story verifies; it does not build").
    // What a unit test CAN prove is that the capped-column structure the breakpoints hang
    // off actually exists in the rendered DOM.
    expect(container.querySelector('.settings__column')).toBeInTheDocument();
  });
});

describe('Settings — Your details and Sign out (US-031, SCR-004)', () => {
  it('renders the read-only details and a Sign out control', async () => {
    stubNavigator();
    const pushHandler: PushHandler = async () => ({ kind: 'ok', data: { pushOptIn: false, vapidPublicKey: VAPID_PUBLIC_KEY } });

    render(<SignedIn pushHandler={pushHandler} />);

    await screen.findByText('Priya Sharma');
    expect(screen.getByText('priya@company.com')).toBeInTheDocument();
    expect(screen.getByText('Employee')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
