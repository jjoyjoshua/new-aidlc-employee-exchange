/**
 * The data-fetching layer's focus-regain half (ADR-008; `README.md` for this directory).
 * REQ-036 requires this to be a property of one shared layer, "configured once for the whole
 * app — never a per-screen `useEffect`" — so there is exactly one `document`/`window` listener
 * pair for the entire application lifetime, wired lazily on the first subscriber and torn down
 * once the last one leaves, fanning out to any number of subscribers via `onRegainFocus`.
 *
 * Neither underlying event alone catches every regain: `visibilitychange` misses switching back
 * to the browser's OS window while this tab was already frontmost; a bare `focus` listener misses
 * switching from a background tab to this one within the same window. Both are wired, and a
 * microtask-reset flag coalesces the common case where a single regain fires both into one
 * notification to every subscriber — the story's own "rapid focus changes" edge case — without
 * suppressing a second, later regain.
 *
 * Cache invalidation on mutation is this module's deferred other half (ADR-008) — not built until
 * a story needs one tab's mutation to update another screen's list within the same tab.
 */
import { useEffect, useRef } from 'react';

type Listener = () => void;

const listeners = new Set<Listener>();
let wired = false;
let coalescing = false;
let teardown: (() => void) | null = null;

function notifyAll() {
  for (const listener of listeners) listener();
}

function regained() {
  if (coalescing) return;
  coalescing = true;
  queueMicrotask(() => {
    coalescing = false;
  });
  notifyAll();
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') regained();
}

function wire() {
  if (wired) return;
  wired = true;
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', regained);
  teardown = () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('focus', regained);
  };
}

function unwire() {
  if (!wired) return;
  wired = false;
  teardown?.();
  teardown = null;
}

/** The non-React primitive. Wires the shared listener pair on the first subscriber; tears it
 *  down once the returned unsubscribe function brings the subscriber count back to zero. */
export function onRegainFocus(listener: Listener): () => void {
  wire();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) unwire();
  };
}

export interface UseFocusRefreshOptions {
  enabled: boolean;
}

/** The React API. A screen calls this instead of writing its own `visibilitychange`/`focus`
 *  wiring — that per-screen `useEffect` is exactly what ADR-008 exists to rule out. */
export function useFocusRefresh(onRegain: () => void, { enabled }: UseFocusRefreshOptions): void {
  const onRegainRef = useRef(onRegain);
  onRegainRef.current = onRegain;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(
    () =>
      onRegainFocus(() => {
        if (enabledRef.current) onRegainRef.current();
      }),
    [],
  );
}
