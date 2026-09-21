/**
 * The browser mechanics of Web Push (US-031/FR-08, FR-20) — service worker registration,
 * `Notification.requestPermission`, and `pushManager.subscribe`. Kept separate from
 * `lib/push-settings.ts`'s fetch wrappers (US-031/D-03): this is the one seam that touches
 * `navigator`/`Notification` directly, so it stays unit-testable behind a thin boundary rather
 * than mixed into the screen's data-fetching hook.
 *
 * `subscribeToPush` follows the design note's own ordered flow (§6.2): register the worker,
 * wait for it to be ready, THEN ask permission, THEN subscribe. Calling
 * `Notification.requestPermission()` explicitly — rather than letting `subscribe()` trigger the
 * prompt implicitly — is what lets this module distinguish `denied` from a dismissed prompt
 * (`default`), which ST-05 and ST-02 need to tell apart (US-031/AC-05).
 */

/** US-031/AC-06. A capability probe, not a feature-detect-and-hope: `Settings.tsx` must issue
 *  NO fetch at all when this is false (design note §6.1). */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * `pushManager.subscribe()`'s `applicationServerKey` wants a `Uint8Array`, and the VAPID public
 * key arrives from the server as unpadded base64url (design note §4.4). Eight lines, pulled out
 * so the one call that cannot be retried cheaply does not also carry an inline decoding bug.
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  // Not `Uint8Array.from({length}, ...)` — its inferred `Uint8Array<ArrayBufferLike>` fails
  // `applicationServerKey`'s `BufferSource` (wants `ArrayBuffer` specifically) under this
  // project's TypeScript/DOM lib combination. A plain constructor + loop keeps the concrete type.
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

/** What the router's `pushOptInRequestSchema` accepts — built explicitly from
 *  `PushSubscription`'s own fields, never `subscription.toJSON()` passed straight through
 *  (design note §4.4): that also carries `expirationTime`, which `.strict()` would reject. */
export interface SubscribedPush {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function toSubscribedPush(subscription: PushSubscription): SubscribedPush {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
  };
}

export type SubscribeOutcome =
  | { kind: 'subscribed'; subscription: SubscribedPush }
  /** US-031/AC-05. The browser refused outright. */
  | { kind: 'permission-denied' }
  /** The prompt was dismissed with neither an allow nor a deny — SCR-004 has no state for
   *  this; the screen returns to ST-02, the truth (design note §6.2). */
  | { kind: 'permission-default' }
  /** Worker registration, `pushManager.subscribe()`, or anything else in the chain threw —
   *  ST-07's case, not ST-06: the API existed, it just failed (design note §6.2). */
  | { kind: 'failed' };

export async function subscribeToPush(vapidPublicKey: string): Promise<SubscribeOutcome> {
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission === 'denied') return { kind: 'permission-denied' };
    if (permission !== 'granted') return { kind: 'permission-default' };

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // `as BufferSource` — this project's TypeScript/DOM lib combination infers a plain
      // `new Uint8Array(n)` as `Uint8Array<ArrayBufferLike>`, which `BufferSource` (wanting
      // `ArrayBuffer` specifically) rejects at the type level even though it is correct at
      // runtime; a real browser's `PushManager.subscribe` accepts exactly this value.
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });

    return { kind: 'subscribed', subscription: toSubscribedPush(subscription) };
  } catch {
    return { kind: 'failed' };
  }
}

/**
 * US-031 design note §6.4 — the silent reconcile. Reads what THIS browser currently holds,
 * with no side effect and no prompt. `undefined` covers both "never subscribed" and "no
 * service worker registered yet" — both mean the same thing to a caller deciding whether to
 * re-subscribe.
 */
export async function getExistingSubscription(): Promise<SubscribedPush | undefined> {
  if (!isPushSupported()) return undefined;

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? toSubscribedPush(subscription) : undefined;
}

/**
 * Opting out needs no browser round-trip to SUCCEED (BR-001.15) — this runs best-effort, AFTER
 * the server has already confirmed the flag is off, and its result is never observed by the
 * caller (design note §6.3): the account is already safe once the flag is false.
 */
export async function unsubscribeFromPush(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch {
    // Best-effort — see docblock above.
  }
}
