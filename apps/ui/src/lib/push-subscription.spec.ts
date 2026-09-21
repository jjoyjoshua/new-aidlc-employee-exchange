import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getExistingSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  urlBase64ToUint8Array,
} from './push-subscription.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('urlBase64ToUint8Array (US-031, design note §8.3)', () => {
  it('decodes an unpadded base64url string to its raw bytes', () => {
    // 'hello' → base64 'aGVsbG8=' → base64url 'aGVsbG8' (no padding).
    const result = urlBase64ToUint8Array('aGVsbG8');
    expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]);
  });

  it('decodes a string that needs the URL-safe characters translated back', () => {
    // Bytes chosen so the base64 output contains both '+' and '/', encoded here as '-' and '_'.
    const withPlusSlash = Buffer.from([0xfb, 0xff, 0xbf]).toString('base64'); // "+/+/"-ish
    const base64Url = withPlusSlash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const expected = Array.from(Buffer.from(withPlusSlash, 'base64'));
    expect(Array.from(urlBase64ToUint8Array(base64Url))).toEqual(expected);
  });
});

describe('isPushSupported (US-031/AC-06)', () => {
  it('is false when serviceWorker, PushManager or Notification is absent — jsdom carries none of them by default', () => {
    expect(isPushSupported()).toBe(false);
  });

  it('is true only once all three are present', () => {
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', class {});
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });

    expect(isPushSupported()).toBe(true);
  });
});

function fakeSubscription(overrides: Partial<{ endpoint: string; p256dh: string; auth: string }> = {}) {
  const endpoint = overrides.endpoint ?? 'https://fcm.googleapis.com/fcm/send/abc123';
  const p256dh = overrides.p256dh ?? 'p256dh-value';
  const auth = overrides.auth ?? 'auth-value';
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh, auth } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

describe('subscribeToPush (US-031/AC-02, AC-05, design note §6.2)', () => {
  it('registers, waits for ready, requests permission, subscribes, and builds the payload explicitly', async () => {
    const subscription = fakeSubscription();
    const register = vi.fn().mockResolvedValue({
      pushManager: { subscribe: vi.fn().mockResolvedValue(subscription) },
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register, ready: Promise.resolve() },
      configurable: true,
    });
    vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue('granted') });

    const result = await subscribeToPush('vapid-public-key');

    expect(register).toHaveBeenCalledWith('/sw.js');
    expect(result).toEqual({
      kind: 'subscribed',
      subscription: { endpoint: subscription.endpoint, p256dh: 'p256dh-value', auth: 'auth-value' },
    });
  });

  it('returns permission-denied, never subscribing, when the browser refuses (AC-05)', async () => {
    const subscribe = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: vi.fn().mockResolvedValue({ pushManager: { subscribe } }),
        ready: Promise.resolve(),
      },
      configurable: true,
    });
    vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue('denied') });

    const result = await subscribeToPush('vapid-public-key');

    expect(result).toEqual({ kind: 'permission-denied' });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('returns permission-default, not failed, when the prompt is dismissed rather than answered', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: vi.fn().mockResolvedValue({ pushManager: { subscribe: vi.fn() } }),
        ready: Promise.resolve(),
      },
      configurable: true,
    });
    vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue('default') });

    const result = await subscribeToPush('vapid-public-key');

    expect(result).toEqual({ kind: 'permission-default' });
  });

  it('returns failed when registration throws — the API existed, so this is not ST-06', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: vi.fn().mockRejectedValue(new Error('registration blocked')) },
      configurable: true,
    });
    vi.stubGlobal('Notification', { requestPermission: vi.fn() });

    const result = await subscribeToPush('vapid-public-key');

    expect(result).toEqual({ kind: 'failed' });
  });

  it('returns failed when pushManager.subscribe itself throws', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: vi.fn().mockResolvedValue({ pushManager: { subscribe: vi.fn().mockRejectedValue(new Error('boom')) } }),
        ready: Promise.resolve(),
      },
      configurable: true,
    });
    vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue('granted') });

    const result = await subscribeToPush('vapid-public-key');

    expect(result).toEqual({ kind: 'failed' });
  });
});

describe('getExistingSubscription (US-031 design note §6.4 — the silent reconcile)', () => {
  it('returns undefined when push is unsupported, without touching serviceWorker at all', async () => {
    const result = await getExistingSubscription();
    expect(result).toBeUndefined();
  });

  it('returns undefined when no registration exists yet', async () => {
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', class {});
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    expect(await getExistingSubscription()).toBeUndefined();
  });

  it('returns the subscribed payload when this browser holds one', async () => {
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', class {});
    const subscription = fakeSubscription();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistration: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) } }),
      },
      configurable: true,
    });

    const result = await getExistingSubscription();
    expect(result).toEqual({ endpoint: subscription.endpoint, p256dh: 'p256dh-value', auth: 'auth-value' });
  });
});

describe('unsubscribeFromPush (US-031/AC-03 — best-effort, never observed)', () => {
  it('calls unsubscribe on the existing subscription, if any', async () => {
    const subscription = fakeSubscription();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistration: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) } }),
      },
      configurable: true,
    });

    await unsubscribeFromPush();

    expect(subscription.unsubscribe).toHaveBeenCalled();
  });

  it('never throws, even when the browser has no service worker at all', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
    await expect(unsubscribeFromPush()).resolves.toBeUndefined();
  });
});
