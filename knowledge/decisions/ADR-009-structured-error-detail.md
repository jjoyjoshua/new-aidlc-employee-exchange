# ADR-009 — An optional, code-scoped `details` object on the shared error body

|             |                                                                          |
| ----------- | ------------------------------------------------------------------------ |
| **Status**  | accepted                                                                 |
| **Date**    | 2026-09-19                                                               |
| **Decider** | Joy Joshua (drafted by Architect persona)                                |
| **Serves**  | US-019; REQ-017, BR-001.9, V-09                                          |

## Context

`libs/contracts/src/error.ts`'s `errorBodySchema` is, today, exactly three fields —
`statusCode`, `code`, `message` — and `ai/standards/api-standards.md:39` and `http/errors.ts:6-8`
both state that as an absolute: "one shape from every route, no exceptions" / "nothing else
crosses the boundary". Every error path in the system to date fits inside `message` as a plain
sentence for a human to read.

US-019 (deactivate a desk) breaks that fit. AC-04's blocked refusal must report *how many*
upcoming Confirmed bookings the desk holds, and SCR-006's approved hi-fi frames (`214:1685`)
interpolate that number **twice, independently** — once in the dialog's body sentence, and once
in its primary button label ("See those 3 bookings"). A button label cannot be recovered from a
prose `message` string without parsing it, and `apps/ui/src/screens/desks/copy.ts` is already
explicit that this screen renders its own copy, never a server-derived string. So the count must
arrive as a value the browser can read, not as words to display verbatim.

`http/errors.ts`'s `unprocessable()` docblock already uses "this desk has 3 upcoming bookings, so
it can't be retired" as its own worked example — but that sentence exists to separate `422` from
`409` (`api-standards.md`'s "Keep the 409/422 split honest"), not to specify a wire format. Reading
it as "so the count belongs in the message" answers a different question than the one it was
written to settle.

`errorBodySchema` is a protected-path file (`libs/contracts/**`), and any change to it is felt by
`apps/api/src/http/errors.ts` and `apps/ui/src/lib/api-client.ts` simultaneously — the whole
reason ADR-002 put the contract in a shared package in the first place.

## Decision

**We will add one optional field, `details: z.record(z.unknown()).optional()`, to
`errorBodySchema`.** It is emitted only where a specific refusal has a fact to report, via a new
optional fourth argument on `HttpError`'s constructor (defaulted, so every existing call site is
unchanged) and a conditional spread in `toBody()` so the key is entirely absent — not `null`, not
`{}` — on every response that doesn't set it.

The **typed** reading of any one endpoint's `details` lives beside that endpoint's other schemas,
never inside `error.ts`. US-019's is `deskBlockedDetailsSchema` (`{ upcomingBookings:
z.number().int().positive() }`) in `libs/contracts/src/desks.ts`. `error.ts` itself never learns
the word "bookings" — it only ever declares that an unspecified, code-scoped detail object may be
present.

The browser applies the typed schema only in the one branch that expects a given `code`, and
folds a parse failure (a missing or malformed `details`) to the same outcome as a transport
failure, never to a refusal rendered with a wrong or `undefined` number. This is deliberate: a
refusal the screen cannot state correctly is worse than a retryable failure.

## Alternatives considered

| Option | Pros | Cons | Why rejected |
| ------ | ---- | ---- | ------------ |
| **The count embedded in `message`, rendered verbatim** | Zero contract change | Cannot produce the button label; makes the server the author of user-facing copy, which this codebase's own convention (`copy.ts`, `admin.router.ts`) forbids; puts a string no designer reviewed in front of an administrator | Structurally cannot meet AC-04 as the approved frames draw it |
| **The count embedded in `message`, extracted by the browser with a regex** | Zero contract change | Prose used as a wire format; a copy edit becomes a silent parse failure, and the failure mode is a dialog that renders `NaN` | Fragile in a way that fails only in production, long after the copy that broke it shipped |
| **A top-level `upcomingBookings` field directly on `errorBodySchema`** | Simple, no nesting | Puts a desk-specific field on the one shape every route in the system returns; a second rule needing a number adds a second such field, and the shape stops being one shape | The namespaced `details` object solves the same problem once instead of per-field |
| **Leave `errorBodySchema` unchanged; have the browser's HTTP client pass the raw body through, and type an extension (`errorBodySchema.extend({...})`) only at the one call site that needs it** | Shared schema keeps exactly three keys | The client's `ApiResult` then carries `body: unknown` for every caller, inviting any future caller to reach into raw JSON; the wire genuinely grows an *unannounced* fourth key, so "one shape" is amended silently per route rather than once, visibly, in the contract package | Weaker: quietly relaxes the guarantee it claims to preserve |
| **The browser refetches `GET /api/admin/desks` on the `422` and reads the row's own `bookedAhead`** | No contract change, no ADR needed at all | A second round trip on every refusal; introduces an unnumbered loading state inside ST-06 that SCR-006 does not draw; and the refetched count can itself come back `0` if the blocking booking was cancelled between the refusal and the refetch — the same self-contradicting refusal this decision exists to avoid, only rarer | The named no-ADR fallback; genuinely viable, but costs latency and a state SCR-006 never specified, for a problem the `details` field solves for one field's worth of contract surface |
| **Reusing the desk row's already-held `bookedAhead` instead of a fresh server value** | No new field anywhere | Provably wrong on the one path that matters: AC-08's race is exercised exactly when the held count is `0` (that is what showed the confirm dialog instead of the blocked one in the first place), so this option would render "0 people have it booked" on the one refusal where the number must be right | Rejected outright — the case it fails is the case the feature exists for |

## Consequences

**Easier**

- US-019's blocked refusal can state its count exactly as approved, in both places the frame
  requires, with no prose-parsing anywhere in the stack.
- The next rule that needs to report a fact in a refusal (US-025's deactivate-a-person cascade is
  the next one queued) has a declared, precedented extension point instead of re-litigating this
  question from scratch.
- Every existing error response — every test asserting one, every browser code path reading one —
  is unaffected. The field is optional and additive in both directions: an old browser tab parses
  a new body (ignoring the key it doesn't use), and a new tab parses an old body (treating the
  absent key as absent, which is its default state).

**Harder**

- `errorBodySchema` is no longer a closed three-field shape; a future reader of `api-standards.md`
  must read the one paragraph explaining the exception rather than take "one shape, no exceptions"
  fully literally.
- Each new use of `details` needs its own typed schema declared beside its endpoint, and its own
  discipline in the browser to fold a parse failure to a safe outcome rather than trust an
  unparsed value — a pattern this ADR establishes but does not enforce mechanically.

**Follow-up work created**

1. `ai/standards/api-standards.md`'s Errors section gets the one-paragraph addition pointing at
   this ADR (done in US-019's PR).
2. Any future refusal that needs to carry a fact follows this same shape — a code-scoped, typed
   `details` schema beside the sending endpoint — rather than inventing a new top-level field or
   re-opening this question.

**Not closed by this decision**

Whether `details`'s loose `z.record(z.unknown())` typing at the shared-schema level should ever
become a discriminated union keyed on `code` (so the shared schema itself, not just each
endpoint's own file, knows the shape per code). No story today needs that stronger guarantee; if
the number of `details`-carrying refusals grows, that is a future ADR's question.
