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

// US-032 fills these in. `userVisibleOnly: true` is promised at `subscribe()` time
// (`lib/push-subscription.ts`), so a `push` event that shows nothing risks the browser
// penalising the subscription — this story sends no push, so the handlers stay stubbed rather
// than absent, so the next story extends this file instead of adding a second one.
self.addEventListener('push', () => {
  // US-032.
});

self.addEventListener('notificationclick', () => {
  // US-032.
});
