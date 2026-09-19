import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRegainFocus, useFocusRefresh } from './data-refresh.js';

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

afterEach(() => {
  setVisibility('visible');
  vi.restoreAllMocks();
});

describe('useFocusRefresh (US-012/AC-01, FR-01)', () => {
  it('fires once when the document becomes visible', async () => {
    const onRegain = vi.fn();
    renderHook(() => useFocusRefresh(onRegain, { enabled: true }));

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();

    expect(onRegain).toHaveBeenCalledTimes(1);
  });

  it('fires once on a bare window focus event', async () => {
    const onRegain = vi.fn();
    renderHook(() => useFocusRefresh(onRegain, { enabled: true }));

    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();

    expect(onRegain).toHaveBeenCalledTimes(1);
  });

  it('does not fire on visibilitychange when the document is not the visible one', async () => {
    const onRegain = vi.fn();
    renderHook(() => useFocusRefresh(onRegain, { enabled: true }));

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();

    expect(onRegain).not.toHaveBeenCalled();
  });

  it('does not fire while disabled', async () => {
    const onRegain = vi.fn();
    renderHook(() => useFocusRefresh(onRegain, { enabled: false }));

    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();

    expect(onRegain).not.toHaveBeenCalled();
  });

  it('fires again on a second, separate regain (not permanently suppressed) (FR-03)', async () => {
    const onRegain = vi.fn();
    renderHook(() => useFocusRefresh(onRegain, { enabled: true }));

    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();

    expect(onRegain).toHaveBeenCalledTimes(2);
  });

  it('stops listening after unmount', async () => {
    const onRegain = vi.fn();
    const { unmount } = renderHook(() => useFocusRefresh(onRegain, { enabled: true }));
    unmount();

    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();

    expect(onRegain).not.toHaveBeenCalled();
  });
});

describe('data-refresh — coalescing across the same regain (US-012 edge case: rapid focus changes, FR-02)', () => {
  it('calls a subscriber once when visibilitychange and focus both fire for the same regain', async () => {
    const onRegain = vi.fn();
    renderHook(() => useFocusRefresh(onRegain, { enabled: true }));

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();

    expect(onRegain).toHaveBeenCalledTimes(1);
  });

  it('coalesces across every current subscriber, not per-subscriber', async () => {
    const first = vi.fn();
    const second = vi.fn();
    renderHook(() => useFocusRefresh(first, { enabled: true }));
    renderHook(() => useFocusRefresh(second, { enabled: true }));

    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('data-refresh — one underlying listener pair for the whole app (ADR-008, FR-01)', () => {
  it('attaches document/window listeners exactly once no matter how many subscribers mount', () => {
    const addDocumentListener = vi.spyOn(document, 'addEventListener');
    const addWindowListener = vi.spyOn(window, 'addEventListener');

    renderHook(() => useFocusRefresh(vi.fn(), { enabled: true }));
    renderHook(() => useFocusRefresh(vi.fn(), { enabled: true }));
    renderHook(() => useFocusRefresh(vi.fn(), { enabled: true }));

    expect(addDocumentListener.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(1);
    expect(addWindowListener.mock.calls.filter(([type]) => type === 'focus')).toHaveLength(1);
  });

  it('tears the shared listener pair down once the last subscriber unmounts, and re-wires for a fresh one', () => {
    const addDocumentListener = vi.spyOn(document, 'addEventListener');
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener');

    const first = renderHook(() => useFocusRefresh(vi.fn(), { enabled: true }));
    const second = renderHook(() => useFocusRefresh(vi.fn(), { enabled: true }));
    first.unmount();
    expect(removeDocumentListener.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(0);

    second.unmount();
    expect(removeDocumentListener.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(1);

    renderHook(() => useFocusRefresh(vi.fn(), { enabled: true }));
    expect(addDocumentListener.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(2);
  });

  it('a subscriber added after another unsubscribes does not resurrect a stale coalescing flag', async () => {
    const stale = vi.fn();
    const staleSubscription = renderHook(() => useFocusRefresh(stale, { enabled: true }));
    staleSubscription.unmount();

    const fresh = vi.fn();
    renderHook(() => useFocusRefresh(fresh, { enabled: true }));

    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();

    expect(fresh).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();
  });
});

describe('onRegainFocus — the non-React primitive', () => {
  it('returns an unsubscribe function that stops further calls', async () => {
    const listener = vi.fn();
    const unsubscribe = onRegainFocus(listener);

    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
