/**
 * The state machine behind SCR-004's eight states (US-031). Mirrors `use-my-bookings.ts`'s
 * shape (`status`, `retry()`) where the two screens share a need, and diverges where SCR-004's
 * own rules demand it — most of what follows exists to satisfy design note §6.
 *
 * **The one rule everything else is a consequence of (US-031/AC-07): the toggle's rendered
 * position is set only from a server response, never from the click that requested it.** There
 * is no optimistic update anywhere in this hook.
 *
 * **Precedence at render, in order: unsupported → denied → the flag** (design note §6.4). A
 * naive binding to `pushOptIn` alone would render ST-04 (on) while the browser is refusing —
 * exactly the falsehood AC-05 forbids. `Notification.permission` is read FRESH on every render
 * via `checkPermission`, never cached in state, so a permission change between renders (the
 * user answering the browser's own prompt) is picked up without an extra effect.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PushReadResponse } from '@desk-booking/contracts';
import type { FetchPushSettings, OptIntoPush, OptOutOfPush } from '../../lib/push-settings.js';
import {
  getExistingSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  type SubscribedPush,
} from '../../lib/push-subscription.js';

export type PermissionState = 'granted' | 'denied' | 'default';

export type PushSettingsState =
  | { st: 'ST-01' }
  | { st: 'ST-02'; onToggleOn: () => void }
  | { st: 'ST-03' }
  | { st: 'ST-04'; onToggleOff: () => void }
  | { st: 'ST-05' }
  | { st: 'ST-06' }
  | { st: 'ST-07'; direction: 'opt-in' | 'opt-out'; retry: () => void }
  | { st: 'ST-08'; retry: () => void };

/** Internal, not the render state directly — `render()` below derives the ST-## from this
 *  PLUS a fresh permission read, which is what makes the precedence rule hold on every call. */
type Phase =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'load-error' }
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'change-failed'; direction: 'opt-in' | 'opt-out' };

export interface UsePushSettingsDeps {
  fetchPushSettings: FetchPushSettings;
  optIntoPush: OptIntoPush;
  optOutOfPush: OptOutOfPush;
}

/** Test seam for the three browser-facing functions — real ones by default, so production
 *  callers pass nothing. */
export interface UsePushSettingsBrowserDeps {
  isPushSupported?: typeof isPushSupported;
  subscribeToPush?: typeof subscribeToPush;
  getExistingSubscription?: typeof getExistingSubscription;
  unsubscribeFromPush?: typeof unsubscribeFromPush;
  getPermission?: () => PermissionState;
}

function defaultGetPermission(): PermissionState {
  if (typeof Notification === 'undefined') return 'default';
  return Notification.permission;
}

export function usePushSettings(deps: UsePushSettingsDeps & UsePushSettingsBrowserDeps): PushSettingsState {
  const {
    fetchPushSettings,
    optIntoPush,
    optOutOfPush,
    isPushSupported: checkSupported = isPushSupported,
    subscribeToPush: subscribe = subscribeToPush,
    getExistingSubscription: getExisting = getExistingSubscription,
    unsubscribeFromPush: unsubscribe = unsubscribeFromPush,
    getPermission = defaultGetPermission,
  } = deps;

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [pushOptIn, setPushOptIn] = useState(false);
  const vapidPublicKeyRef = useRef('');
  // Guards the silent reconcile (design note §6.4) to run at most once per successful load —
  // it is a background repair, not something a re-render should repeat.
  const reconciledRef = useRef(false);

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    reconciledRef.current = false;

    if (!checkSupported()) {
      setPhase({ kind: 'unsupported' });
      return;
    }

    const result = await fetchPushSettings();
    if (result.kind !== 'ok') {
      setPhase({ kind: 'load-error' });
      return;
    }

    const data: PushReadResponse = result.data;
    vapidPublicKeyRef.current = data.vapidPublicKey;
    setPushOptIn(data.pushOptIn);
    setPhase({ kind: 'idle' });

    // The silent reconcile: flag on, permission already granted, but this browser holds no
    // subscription (the common case is a push service rotating an endpoint). Re-subscribe with
    // no prompt and no visible change; a failure here stays ST-04, never ST-07 — the account
    // IS opted in, and the employee performed no action to have failed (design note §6.4, C18).
    if (data.pushOptIn && !reconciledRef.current && getPermission() === 'granted') {
      reconciledRef.current = true;
      const existing = await getExisting();
      if (!existing) {
        const outcome = await subscribe(vapidPublicKeyRef.current);
        if (outcome.kind === 'subscribed') {
          await optIntoPush(outcome.subscription).catch(() => undefined);
        }
      }
    }
  }, [checkSupported, fetchPushSettings, getExisting, getPermission, optIntoPush, subscribe]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleOn = useCallback(async () => {
    setPhase({ kind: 'requesting' });

    const outcome = await subscribe(vapidPublicKeyRef.current);

    if (outcome.kind === 'permission-denied') {
      // No separate phase for this — the NEXT render's fresh permission read resolves to
      // ST-05 on its own (the precedence rule), which is what makes this branch this simple.
      setPhase({ kind: 'idle' });
      return;
    }
    if (outcome.kind === 'permission-default') {
      // The prompt was dismissed, not refused. SCR-004 has no state for that; ST-02 is the
      // truth (design note §6.2).
      setPhase({ kind: 'idle' });
      return;
    }
    if (outcome.kind === 'failed') {
      setPhase({ kind: 'change-failed', direction: 'opt-in' });
      return;
    }

    const write = await optIntoPush(outcome.subscription as SubscribedPush);
    if (write.kind !== 'ok') {
      setPhase({ kind: 'change-failed', direction: 'opt-in' });
      return;
    }

    setPushOptIn(write.data.pushOptIn);
    setPhase({ kind: 'idle' });
  }, [optIntoPush, subscribe]);

  const handleToggleOff = useCallback(async () => {
    setPhase({ kind: 'requesting' });

    const write = await optOutOfPush();
    if (write.kind !== 'ok') {
      setPhase({ kind: 'change-failed', direction: 'opt-out' });
      return;
    }

    setPushOptIn(write.data.pushOptIn);
    setPhase({ kind: 'idle' });
    // Best-effort, unobserved (BR-001.15) — the account is already safe once the flag above
    // is false; this never produces ST-07 (design note §4.3, §6.3).
    void unsubscribe();
  }, [optOutOfPush, unsubscribe]);

  const retry = useCallback(() => {
    if (phase.kind === 'change-failed') {
      if (phase.direction === 'opt-in') void handleToggleOn();
      else void handleToggleOff();
      return;
    }
    void load();
  }, [handleToggleOff, handleToggleOn, load, phase]);

  // ---- render: derive the ST-## from phase + a FRESH permission read (precedence rule) ------

  if (phase.kind === 'loading') return { st: 'ST-01' };
  if (phase.kind === 'unsupported') return { st: 'ST-06' };
  if (phase.kind === 'load-error') return { st: 'ST-08', retry };

  const permission = checkSupported() ? getPermission() : 'default';

  // Precedence: unsupported (handled above) → denied → the flag. A revoked permission is never
  // reconciled by writing the flag false — the story's own edge cases exclude it, and open item
  // 5 confirmed no reconciling write (design note §6.4).
  if (permission === 'denied') return { st: 'ST-05' };

  if (phase.kind === 'requesting') return { st: 'ST-03' };
  if (phase.kind === 'change-failed') return { st: 'ST-07', direction: phase.direction, retry };

  return pushOptIn ? { st: 'ST-04', onToggleOff: handleToggleOff } : { st: 'ST-02', onToggleOn: handleToggleOn };
}
