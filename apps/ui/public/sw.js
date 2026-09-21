// apps/ui/public/sw.js — Web Push ONLY (REQ-026, app-architecture.md §5.6: "The service worker
// exists only for Web Push. The app is not offline-capable and nothing should imply it is.").
//
// There is deliberately NO `fetch` handler here, no precache list and no caching strategy.
// Adding one would make an offline promise this release does not keep (US-031 design note §8.3).
//
// Registered lazily from the Settings screen (`lib/push-subscription.ts`) when an employee
// switches the toggle on — never from `main.tsx` at boot, which would install this for every
// visitor whether or not they ever opt in.
//
// This file is served as-is by Vite from `public/` (unbundled, not type-checked) in both `vite
// dev` and `vite build` — no build configuration needed. Keep it small and dependency-free.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// US-032. The server sends JSON.stringify({ title, body }) as the push payload (design note
// §7.1) — not a shared type, since this file is unbundled and imports nothing. `waitUntil` is
// mandatory: without it the browser can terminate the worker before `showNotification` resolves,
// which presents as push that works locally and silently fails in the field. Something is always
// shown, even when the payload is missing or unparseable — `userVisibleOnly: true` was promised
// at `subscribe()` time (`lib/push-subscription.ts`), and a handler that shows nothing risks the
// browser penalising the subscription. No `tag` — a shared tag would collapse a multi-booking
// cascade's several pushes into one visible notification (US-032/AC-09, design note C12).
self.addEventListener('push', (event) => {
  let title = 'Desk booking update';
  let body = 'Open the app to see the change.';

  try {
    const data = event.data ? event.data.json() : undefined;
    if (data && typeof data.title === 'string') title = data.title;
    if (data && typeof data.body === 'string') body = data.body;
  } catch {
    // Falls through to the generic copy above — an unparseable payload still shows something.
  }

  event.waitUntil(self.registration.showNotification(title, { body }));
});

// US-032. Not required to deep-link (story §UI edge cases) — close the notification, then focus
// an existing client if one is open, or open the app fresh. No action buttons.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => 'focus' in client);
      if (existing) return existing.focus();
      return self.clients.openWindow('/');
    }),
  );
});
