import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePushSettings, type UsePushSettingsBrowserDeps, type UsePushSettingsDeps } from './use-push-settings.js';

const READ_OK = { kind: 'ok' as const, data: { pushOptIn: false, vapidPublicKey: 'vapid-key' } };
const SUBSCRIPTION = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'p', auth: 'a' };

type Deps = Required<UsePushSettingsDeps & UsePushSettingsBrowserDeps>;

function baseDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    fetchPushSettings: vi.fn().mockResolvedValue(READ_OK),
    optIntoPush: vi.fn().mockResolvedValue({ kind: 'ok', data: { pushOptIn: true } }),
    optOutOfPush: vi.fn().mockResolvedValue({ kind: 'ok', data: { pushOptIn: false } }),
    isPushSupported: vi.fn().mockReturnValue(true),
    subscribeToPush: vi.fn().mockResolvedValue({ kind: 'subscribed', subscription: SUBSCRIPTION }),
    getExistingSubscription: vi.fn().mockResolvedValue(SUBSCRIPTION),
    unsubscribeFromPush: vi.fn().mockResolvedValue(undefined),
    getPermission: vi.fn().mockReturnValue('default' as const),
    ...overrides,
  } as unknown as Deps;
}

describe('usePushSettings — loading and capability (US-031/AC-06, AC-09)', () => {
  it('reports ST-01 while the read is in flight', () => {
    const deps = baseDeps({ fetchPushSettings: vi.fn(() => new Promise<never>(() => {})) });
    const { result } = renderHook(() => usePushSettings(deps));

    expect(result.current.st).toBe('ST-01');
  });

  it('reports ST-06 and issues NO fetch at all when push is unsupported (AC-06)', async () => {
    const fetchPushSettings = vi.fn().mockResolvedValue(READ_OK);
    const deps = baseDeps({ isPushSupported: vi.fn().mockReturnValue(false), fetchPushSettings });

    const { result } = renderHook(() => usePushSettings(deps));

    await waitFor(() => expect(result.current.st).toBe('ST-06'));
    expect(fetchPushSettings).not.toHaveBeenCalled();
  });

  it('reports ST-08 with a retry when the read fails (AC-08)', async () => {
    const deps = baseDeps({ fetchPushSettings: vi.fn().mockResolvedValue({ kind: 'failed' }) });
    const { result } = renderHook(() => usePushSettings(deps));

    await waitFor(() => expect(result.current.st).toBe('ST-08'));
    expect(result.current).toHaveProperty('retry');
  });
});

describe('usePushSettings — the flag drives ST-02/ST-04 (AC-01, AC-04)', () => {
  it('reports ST-02 when the account is not opted in', async () => {
    const deps = baseDeps({ fetchPushSettings: vi.fn().mockResolvedValue(READ_OK) });
    const { result } = renderHook(() => usePushSettings(deps));

    await waitFor(() => expect(result.current.st).toBe('ST-02'));
  });

  it('reports ST-04 when the account is opted in and permission is granted', async () => {
    const deps = baseDeps({
      fetchPushSettings: vi.fn().mockResolvedValue({ kind: 'ok', data: { pushOptIn: true, vapidPublicKey: 'k' } }),
      getPermission: vi.fn().mockReturnValue('granted'),
    });
    const { result } = renderHook(() => usePushSettings(deps));

    await waitFor(() => expect(result.current.st).toBe('ST-04'));
  });
});

describe('usePushSettings — permission outranks the flag (US-031/AC-05, design note §6.4)', () => {
  it('reports ST-05 when the account is opted in but permission is denied — never ST-04', async () => {
    const deps = baseDeps({
      fetchPushSettings: vi.fn().mockResolvedValue({ kind: 'ok', data: { pushOptIn: true, vapidPublicKey: 'k' } }),
      getPermission: vi.fn().mockReturnValue('denied'),
    });
    const { result } = renderHook(() => usePushSettings(deps));

    await waitFor(() => expect(result.current.st).toBe('ST-05'));
  });

  it('does not write the flag to reconcile a denied permission (open item 5)', async () => {
    const optOutOfPush = vi.fn();
    const deps = baseDeps({
      fetchPushSettings: vi.fn().mockResolvedValue({ kind: 'ok', data: { pushOptIn: true, vapidPublicKey: 'k' } }),
      getPermission: vi.fn().mockReturnValue('denied'),
      optOutOfPush,
    });
    renderHook(() => usePushSettings(deps));

    await waitFor(() => expect(optOutOfPush).not.toHaveBeenCalled());
  });
});

describe('usePushSettings — turning it on (US-031/AC-02, AC-07)', () => {
  it('subscribes, posts opt-in, and reports ST-04 on success', async () => {
    const optIntoPush = vi.fn().mockResolvedValue({ kind: 'ok', data: { pushOptIn: true } });
    const deps = baseDeps({ optIntoPush, getPermission: vi.fn().mockReturnValue('granted') });
    const { result } = renderHook(() => usePushSettings(deps));

    await waitFor(() => expect(result.current.st).toBe('ST-02'));
    await act(async () => {
      await (result.current as unknown as { onToggleOn: () => Promise<void> }).onToggleOn();
    });

    expect(optIntoPush).toHaveBeenCalledWith(SUBSCRIPTION);
    expect(result.current.st).toBe('ST-04');
  });

  it('resolves to ST-02, not ST-07, when the prompt is dismissed rather than answered', async () => {
    const deps = baseDeps({ subscribeToPush: vi.fn().mockResolvedValue({ kind: 'permission-default' }) });
    const { result } = renderHook(() => usePushSettings(deps));

    await waitFor(() => expect(result.current.st).toBe('ST-02'));
    await act(async () => {
      await (result.current as unknown as { onToggleOn: () => Promise<void> }).onToggleOn();
    });

    expect(result.current.st).toBe('ST-02');
  });

  it("reports ST-07 direction opt-in, toggle staying off, when the server save fails after a successful browser subscribe (AC-07's exact case)", async () => {
    const optIntoPush = vi.fn().mockResolvedValue({ kind: 'failed' });
    const deps = baseDeps({ optIntoPush });
    const { result } = renderHook(() => usePushSettings(deps));

    await waitFor(() => expect(result.current.st).toBe('ST-02'));
    await act(async () => {
      await (result.current as unknown as { onToggleOn: () => Promise<void> }).onToggleOn();
    });

    expect(result.current).toMatchObject({ st: 'ST-07', direction: 'opt-in' });
  });
});

describe('usePushSettings — turning it off (US-031/AC-03, AC-07)', () => {
  it('opts out and reports ST-02 on success, then unsubscribes best-effort (US-031/AC-03)', async () => {
    const optOutOfPush = vi.fn().mockResolvedValue({ kind: 'ok', data: { pushOptIn: false } });
    const unsubscribeFromPush = vi.fn().mockResolvedValue(undefined);
    const deps = baseDeps({
      fetchPushSettings: vi.fn().mockResolvedValue({ kind: 'ok', data: { pushOptIn: true, vapidPublicKey: 'k' } }),
      getPermission: vi.fn().mockReturnValue('granted'),
      optOutOfPush,
      unsubscribeFromPush,
    });
    const { result } = renderHook(() => usePushSettings(deps));

    await waitFor(() => expect(result.current.st).toBe('ST-04'));
    await act(async () => {
      await (result.current as unknown as { onToggleOff: () => Promise<void> }).onToggleOff();
    });

    expect(optOutOfPush).toHaveBeenCalled();
    expect(result.current.st).toBe('ST-02');
    await waitFor(() => expect(unsubscribeFromPush).toHaveBeenCalled());
  });

  it('reports ST-07 direction opt-out, toggle staying on, when the flag write fails', async () => {
    const optOutOfPush = vi.fn().mockResolvedValue({ kind: 'failed' });
    const deps = baseDeps({
      fetchPushSettings: vi.fn().mockResolvedValue({ kind: 'ok', data: { pushOptIn: true, vapidPublicKey: 'k' } }),
      getPermission: vi.fn().mockReturnValue('granted'),
      optOutOfPush,
    });
    const { result } = renderHook(() => usePushSettings(deps));

    await waitFor(() => expect(result.current.st).toBe('ST-04'));
    await act(async () => {
      await (result.current as unknown as { onToggleOff: () => Promise<void> }).onToggleOff();
    });

    expect(result.current).toMatchObject({ st: 'ST-07', direction: 'opt-out' });
  });
});

describe('usePushSettings — the silent reconcile (design note §6.4, C18)', () => {
  it('re-subscribes with no visible change when the flag is on but this browser holds no subscription', async () => {
    const optIntoPush = vi.fn().mockResolvedValue({ kind: 'ok', data: { pushOptIn: true } });
    const subscribeToPush = vi.fn().mockResolvedValue({ kind: 'subscribed', subscription: SUBSCRIPTION });
    const deps = baseDeps({
      fetchPushSettings: vi.fn().mockResolvedValue({ kind: 'ok', data: { pushOptIn: true, vapidPublicKey: 'k' } }),
      getPermission: vi.fn().mockReturnValue('granted'),
      getExistingSubscription: vi.fn().mockResolvedValue(undefined),
      subscribeToPush,
      optIntoPush,
    });
    const { result } = renderHook(() => usePushSettings(deps));

    await waitFor(() => expect(optIntoPush).toHaveBeenCalledWith(SUBSCRIPTION));
    expect(result.current.st).toBe('ST-04');
  });

  it('stays ST-04, never ST-07, when the silent reconcile itself fails', async () => {
    const deps = baseDeps({
      fetchPushSettings: vi.fn().mockResolvedValue({ kind: 'ok', data: { pushOptIn: true, vapidPublicKey: 'k' } }),
      getPermission: vi.fn().mockReturnValue('granted'),
      getExistingSubscription: vi.fn().mockResolvedValue(undefined),
      subscribeToPush: vi.fn().mockResolvedValue({ kind: 'failed' }),
    });
    const { result } = renderHook(() => usePushSettings(deps));

    await waitFor(() => expect(result.current.st).toBe('ST-04'));
  });

  it('does not attempt to reconcile when a subscription already exists', async () => {
    const subscribeToPush = vi.fn().mockResolvedValue({ kind: 'subscribed', subscription: SUBSCRIPTION });
    const deps = baseDeps({
      fetchPushSettings: vi.fn().mockResolvedValue({ kind: 'ok', data: { pushOptIn: true, vapidPublicKey: 'k' } }),
      getPermission: vi.fn().mockReturnValue('granted'),
      getExistingSubscription: vi.fn().mockResolvedValue(SUBSCRIPTION),
      subscribeToPush,
    });
    renderHook(() => usePushSettings(deps));

    await waitFor(() => expect(deps.getExistingSubscription).toHaveBeenCalled());
    expect(subscribeToPush).not.toHaveBeenCalled();
  });
});
