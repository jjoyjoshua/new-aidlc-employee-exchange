# lib

Cross-cutting browser concerns.

- `supabase-client.ts` — sign-in and token refresh only. It never reads a table (ADR-001)
- `data-refresh.ts` — the data-fetching layer's focus-regain half (ADR-008). **One** shared
  `document`/`window` listener pair for the whole app; REQ-036's refresh-on-focus is a property of
  this module, configured once — never a per-screen `useEffect`. Changing its configuration is
  Complex. Cache invalidation on mutation is this module's deferred other half — not built until a
  story needs it (ADR-008)
