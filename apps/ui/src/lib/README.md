# lib

Cross-cutting browser concerns.

- `supabase-client.ts` — sign-in and token refresh only. It never reads a table (ADR-001)
- the data-fetching layer, when it lands: **one** layer, with cache invalidation on mutation.
  REQ-036's refresh-on-focus is a property of that layer, configured once for the whole app —
  never a per-screen `useEffect`. Changing its configuration is Complex
