# ADR-008 — REQ-036's focus-regain refresh is one singleton browser-event module in `apps/ui/src/lib/`; cache invalidation on mutation is deferred, not built speculatively

|             |                                                                          |
| ----------- | ------------------------------------------------------------------------ |
| **Status**  | proposed                                                                 |
| **Date**    | 2026-09-19                                                               |
| **Decider** | Joy Joshua (drafted by Architect persona)                                |
| **Serves**  | US-012, US-013 (future); REQ-036                                         |

## Context

`inception/architecture/app-architecture.md` §5.6 already commits to this, at Gate 1:

> Server state is fetched through one data-fetching layer with cache invalidation on
> mutation. REQ-036's refresh-on-focus is a property of that layer, set once, not a
> per-screen concern.

`apps/ui/src/lib/README.md` repeats it in code, naming US-012 directly:

> the data-fetching layer, when it lands: **one** layer, with cache invalidation on
> mutation. REQ-036's refresh-on-focus is a property of that layer, configured once for
> the whole app — never a per-screen `useEffect`. Changing its configuration is Complex

**That layer does not exist.** Every screen that fetches server state today hand-rolls its own hook with its own `loading`/`ready`/`error` state machine and its own `fetch-*.ts` adapter over `ApiClient`: `screens/my-bookings/use-my-bookings.ts` and `screens/book-a-desk/use-availability.ts` are the only two so far, and they duplicate the same shape (request-id/generation guards, abort-on-supersede, a `retry()`) by design — `use-availability.ts`'s own docblock says the pattern is "mirrored" from the other, not shared. Eleven stories (US-001–US-011) have shipped without the promised layer ever being built, because none of them needed the one property it exists for. US-012 is the first that does, which is why the gap surfaces only now — not a regression, a promise not yet redeemed.

DEV reached this ADR the hard way: US-012 was tiered Medium and planned as a per-screen `useFocusRefresh` hook local to `screens/my-bookings/`, coded and green (`use-focus-refresh.ts` + its spec, 7 passing tests), before the README note above was read. That code was removed rather than left as a second, independent implementation of the exact thing this note forbids. `inception/specs/US-012-refresh-booking-list-on-focus/` holds the record: `implementation-plan.md` (superseded), `decisions.md` (D-02 through D-05 — the coalescing strategy, the merge-by-id quiet refresh, the dialog-suppression choice — all still valid and independent of where the event source lives), and `change-log.md` (the halt, and why).

## Decision

**We will add one new module, `apps/ui/src/lib/data-refresh.ts`, that owns exactly one `document`/`window` event-listener pair for the whole application lifetime, fanning out to any number of subscribers via a `useFocusRefresh(refresh, { enabled })` hook. Cache invalidation on mutation is named as this module's future second half and deferred — not built until a story needs one tab's mutation to update another list in the same tab.**

Concretely:

- `onRegainFocus(listener): () => void` is the primitive: a module-level `Set<Listener>`, with the actual `visibilitychange`/`focus` wiring attached lazily on the first subscriber and torn down when the last one leaves. There is exactly one listener pair regardless of how many screens are mounted — this is what "configured once for the whole app" means concretely, not merely "the code lives in one file."
- The same microtask-coalescing this ADR's context inherits from the removed `use-focus-refresh.ts` (two events firing for one regain must call listeners once, not twice) lives inside this single wiring, so every subscriber gets it for free instead of re-deriving it.
- `useFocusRefresh(refresh: () => void, { enabled: boolean }): void` is the public React API — a thin `useEffect` that subscribes to `onRegainFocus` and unsubscribes on unmount. A screen calls this hook; it does not write its own listener. `MyBookings.tsx` (US-012) is the first caller; `AllBookings.tsx` (US-013, once it has a real list) is the second, unchanged.
- `use-my-bookings.ts`'s `refreshQuietly()` design from the (superseded) implementation plan carries over verbatim — merge the fresh default page into `items` by `id`, leave `nextBefore` and any `loadOlder()`-fetched pages untouched, surface a failure via `quietRefreshFailed` rather than a full error state. None of that logic depended on where the focus event came from.
- **No third-party dependency is introduced.** `apps/ui/package.json` gains nothing.
- **Cache invalidation on mutation is not built in this ADR.** No story today needs a mutation in one screen (e.g., US-011's cancel) to refresh a *different* screen's list within the same tab — REQ-036's own cross-actor case (AC-02) is already covered by focus-regain re-fetching from the server, which sees every other actor's writes regardless of any in-memory pub-sub. The module's name and shape (`data-refresh.ts`, a subscriber-registry pattern) deliberately leave room for an `invalidate(key)` / `onInvalidate(key, listener)` pair to join later without a rewrite, but nothing calls it until a story needs it.
- `apps/ui/src/lib/README.md` gets its "when it lands" line updated by whichever PR lands this — DEV's, at US-012 — to point at the real file instead of describing a future.

This ADR is the Complex-tier design note `apps/ui/src/lib/README.md:8`'s "changing its configuration is Complex" requires before that code is written; US-012 re-tiers from Medium to Complex accordingly.

## Alternatives considered

| Option | Pros | Cons | Why rejected |
| ------ | ---- | ---- | ------------ |
| **Adopt a query/cache library (TanStack Query or SWR)** | `refetchOnWindowFocus` and `invalidateQueries` are exactly this problem, built-in, and heavily battle-tested; would eventually let every screen's hand-rolled state machine (loading/ready/error, abort-on-supersede, retry) collapse into `useQuery` calls | A **new dependency** — always the human's call, never mine to decide (`ai/roles/architect.md` guardrails; `ai/context/task-classification.md`'s hard override). Bundle size and a learning curve for a codebase that has, so far, hand-rolled every comparable concern (auth, the cancel dialog's state machine, pagination) with the same care a library would replace. To get real value from it, the existing `use-my-bookings.ts`/`use-availability.ts` would want migrating to its query-key model too — a refactor no story is asking for | No story today needs the library's other features (request de-duplication across components, background polling, SSR). Buying a dependency, and the implicit pressure to migrate shipped code onto it, to get one ~50-line property is disproportionate. Left open below as a later option if the number of ad hoc hooks grows |
| **Build the full "one data-fetching layer" now — replace `use-my-bookings.ts` and `use-availability.ts` with one generic resource hook** | Fully closes the Gate-1 architecture sentence in one PR; no drift left anywhere | Forces a refactor of already-shipped, already-tested US-005/006/007/009/010/011 code that no approved story asks for — exactly the "speculative generality" `ai/roles/architect.md`'s own guardrail warns against. High regression risk (pagination, latest-wins guards, abort-on-supersede all need re-proving) for zero new AC coverage | The architecture sentence describes where *new* server-state wiring should plug in going forward, not a mandate to rewrite what already works. US-012 needs the focus-refresh property, not a rewrite of `book-a-desk` |
| **Grant US-012 an exception; keep DEV's original per-screen `useFocusRefresh`; revise the README/architecture note instead** | Zero new code beyond what DEV already wrote and green-tested | Already declined by the human when DEV raised it. Leaves the actual problem unsolved: US-013's All bookings list would need the identical hook a second time, either duplicating it (the drift the note exists to prevent) or triggering this exact decision later, just with two independent implementations to reconcile instead of none | Defers the decision rather than making it, and the architecture note's reasoning (one listener, one coalescing strategy, used everywhere) does not stop being true because acting on it is inconvenient this week |
| **Singleton shared module in `apps/ui/src/lib/`, focus-refresh only, invalidation deferred (chosen)** | Resolves "configured once for the whole app" literally, in ~50 lines, no new dependency, no touched shipped code; US-013 subscribes instead of reimplementing; the invalidation half has an obvious home when a story needs it | Does not fully realize "one data-fetching layer" as a single generic fetch/cache abstraction — `use-my-bookings.ts` and `use-availability.ts` keep their own state machines, so two hook shapes (bespoke-per-screen vs shared-event-subscriber) coexist and a future reader must know why | Proportionate to what one Should-priority story needs today; unblocks US-012 without a dependency decision or a refactor no one asked for; the fuller consolidation stays available as a later ADR if more screens' needs justify it |

## Consequences

**Easier**

- US-012 is unblocked without a new dependency and without touching any shipped screen.
- US-013 (All bookings' real list, once built) gets the same `useFocusRefresh` for free — one call, no reimplementation, no second coalescing strategy to get right.
- The Gate-1 architecture sentence and `lib/README.md`'s promise are honored by actual code for the property that currently matters (REQ-036), closing the gap between architecture-as-declared and architecture-as-built for that one property specifically.
- US-012's superseded `decisions.md` (D-02 microtask coalescing, D-03 merge-by-id quiet refresh, D-04 the `Alert`-based failure banner, D-05 suppress-while-dialog-open) all carry forward unchanged — only D-01's "where does the event come from" question is what this ADR answers.

**Harder**

- Two data-fetching shapes now coexist on purpose: `use-my-bookings.ts`/`use-availability.ts`'s bespoke per-screen state machines, and the new shared `useFocusRefresh` subscriber. A future contributor needs this ADR to understand why the app doesn't have one uniform pattern yet.
- Cache invalidation on mutation stays a documented intention, not code. A reader of `app-architecture.md` §5.6 today would reasonably expect it to exist; it does not, and won't until a story needs it.
- `book-a-desk/use-availability.ts` is untouched and still cannot pick up REQ-036-style behaviour without its own opt-in — it simply has no requirement to, today.

**Follow-up work created**

1. **DEV resumes US-012 at Complex tier**, with this ADR as the design note `lib/README.md:8` requires. The event-source design is settled; the per-story `implementation-plan.md`/`traceability.md`/`decisions.md` still belong to DEV, per `ai/roles/architect.md`'s own guardrail against the Architect authoring a story's decisions file.
2. **US-013 (All bookings) must call `useFocusRefresh` from `apps/ui/src/lib/data-refresh.ts`**, not write a second one — closing the tracked gap in US-012's `decisions.md` D-01.
3. **`apps/ui/src/lib/README.md`'s "when it lands" line** gets updated to reference the real file, in the PR that lands it (US-012's).
4. Cache invalidation on mutation is **not** scheduled work. It becomes the next story's problem the day a mutation in one screen needs to be reflected in another screen's list within the same tab — most plausibly an Admin's All-bookings view while an Employee cancels elsewhere in the same session, or vice versa.

**Not closed by this decision**

Whether to eventually adopt a query/cache library (the first alternative above) if the number of hand-rolled per-screen hooks and their duplicated loading/error/retry scaffolding grows into a real maintenance cost. That is a future ADR's question, to be raised if and when that cost actually materializes — not decided defensively here against a cost that has not yet shown up.
