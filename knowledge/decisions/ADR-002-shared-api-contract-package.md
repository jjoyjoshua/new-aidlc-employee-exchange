# ADR-002 — The browser and server share one Zod contract package, and the browser validates at runtime

|             |                                                                          |
| ----------- | ------------------------------------------------------------------------ |
| **Status**  | proposed                                                                 |
| **Date**    | 2026-09-17                                                               |
| **Decider** | Joy Joshua (drafted by Architect persona)                                |
| **Serves**  | Every story that calls the API (US-001 – US-034); specifically REQ-029 and BR-001.17, whose forced-password-change flow depends on a stable error code |

## Context

[ADR-001](ADR-001-server-mediated-supabase-access.md) routes **all** data access through
Express. That decision is what makes this one matter: the browser has no other source of
data, so every screen in SCR-001–SCR-010 depends on an HTTP contract, and the contract
surface is roughly one endpoint per screen action across 34 stories.

`app-architecture.md` §5.2 already fixes half of the picture. Every request body, query string
and path parameter is parsed by a Zod schema at the route edge, rejecting unknown fields
rather than ignoring them. What it does not say is whether the **browser** knows anything
about those schemas. Today nothing connects the two sides, so they agree only for as long as
somebody remembers to keep them agreeing.

Two facts narrow the options, both established with the decider on 2026-09-17:

- **The React app is the only consumer**, now and for the foreseeable life of this release.
  There is no second client, no separate QA repository running browser tests against a
  deployed environment, and no IT or HR integration.
- **Both sides live in one repository** and ship together, as npm workspaces.

There is also a constraint worth stating because it is easy to violate by accident. The
server holds the Supabase service-role key, which bypasses every RLS policy in the project
(ADR-001). Any mechanism that lets the browser import from `apps/api` puts a path between
browser code and that module, and the only thing preventing the key's module from being
pulled into a browser bundle would be the bundler's tree-shaking and nobody making a mistake.

### The failure this is really about

Development-time drift is not the interesting risk. TypeScript catches a renamed field the
moment both sides are typed from one definition, and in a monorepo the typecheck runs over
both.

The risk is **version skew**: a user's tab loaded before a deploy, talking to the server that
came after it. Types are erased at runtime, so that browser holds a description that stopped
being true and has no way to notice. The symptom is not an error — it is `undefined` rendered
into a screen, or a list that comes back empty, with nothing in any log saying why.

## Decision

**We will put the wire contract in one shared workspace package, `libs/contracts`, and the
browser will validate every response against it at runtime.**

- The package exports **Zod schemas** for every request and response body, plus the error body
  shape and the union of stable `code` strings. TypeScript types are inferred from those
  schemas with `z.infer`, never declared alongside them — one definition, or it is not a
  contract.
- **The server** validates incoming requests with these schemas at the route edge, as
  `app-architecture.md` §5.2 already requires, and types its response builders from them, so a
  response that no longer matches fails the build.
- **The browser** parses every response through the schema before the data reaches a
  component. A mismatch throws at the network boundary, naming the field.
- The package depends on **`zod` and nothing else**. It imports nothing from `apps/api` or
  `apps/ui`, and neither app imports the other. A lint rule enforces this, as it does for the
  other boundaries in `app-architecture.md` §3.

### What does not go in it

This is the line that keeps the package from becoming a dumping ground, and it follows from
`app-architecture.md` §2 rather than being a new rule:

| In the contracts package                                     | Stays where it is                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| The **shape** of what crosses the wire — fields, types, required vs optional, string formats | The **rules** — `domain/`, server-side, pure functions                |
| The error body and its `code` strings                        | Which error a given situation produces — the module that decides it    |
| The pagination envelope                                      | Database row shapes; anything that is never sent over HTTP             |

So "a desk number is a non-empty string of at most N characters" is a contract. "This desk
number is already taken, in its normalized form" is BR-001.4 and BR-001.8, lives in `domain/`,
and is answered with a `409`. The browser may not evaluate business rules; it never has the
data to do so correctly, and duplicating them is how two answers to one question appear.

### The error codes are the most valuable thing in the package

`app-architecture.md` §5.3 gives every failure a stable machine-readable `code`, and REQ-029 /
BR-001.17 make one of them load-bearing: when `must_change_password` is set, every route but
two returns `403` with a distinguishable code, and the React app routes to SCR-010 on it
rather than showing an error. That string is a contract between a middleware and a screen,
currently agreed by nothing. Exporting it as a shared constant makes a typo a compile error
instead of a user stranded on an error page they cannot leave.

## Alternatives considered

| Option | Pros | Cons | Why rejected |
| ------ | ---- | ---- | ------------ |
| **Each side declares its own types** | Nothing to set up. No new workspace, no build ordering, no lint rules. Each side shapes data the way it finds convenient. | Two descriptions of one contract, kept in agreement by memory across roughly 40 endpoints and 34 stories. Nothing fails when they diverge — not the build, not the tests, not CI. The first symptom is a user seeing a blank field. | The cost is not paid at the moment of the mistake, which is what makes it expensive. It is the cheapest option today and the most expensive on the day something goes wrong. |
| **Generate a typed client from an OpenAPI description** | The description is a real artifact other teams can code against without reading source. Familiar, well-tooled path. Would suit a public or multi-team API. | A generator, a spec file and a generated-code review burden, all to serve one consumer that lives in the same repository and ships in the same deploy. The previous standards assumed NestJS's swagger plugin to produce this cheaply; Express has no equivalent, so the spec would be hand-maintained — a third description to keep true. | No second consumer exists. Building contract-publishing machinery for one in-repo client is speculative generality. If a mobile app or an external integration ever appears, generating OpenAPI **from these Zod schemas** is a well-trodden path, so this decision does not close the door. |
| **Browser imports types from `apps/api` via TypeScript path mapping** | No new workspace at all. Zero ceremony, one source of truth, works today. | Opens an import path from browser code into the server package — the same package that holds `infra/supabase` and the service-role key. The only thing keeping that module out of a browser bundle would be tree-shaking and nobody importing the wrong file. The boundary cannot be expressed as a lint rule, because the whole mechanism is that the path is open. | A security boundary that depends on nobody making a mistake is not a boundary. ADR-001 confines the service-role key to one module precisely so its exposure stays reviewable; this would make it diffuse again. |
| **Shared package, TypeScript types only (no runtime schemas in the browser)** | Nothing added to the browser bundle. Slightly less to wire up. Still one definition, so development-time drift is caught by the typecheck. | Types are erased at runtime, so the browser cannot detect version skew. A tab loaded before a deploy trusts a description that is no longer true, and the mismatch presents as a UI bug rather than an error. | Rejected by the decider on 2026-09-17. The failure it permits is precisely the one that is hardest to diagnose, and roughly 13 KB gzipped is not a meaningful cost for an internal tool serving one office. |
| **Shared Zod package, browser validates at runtime (chosen)** | One definition of every wire shape. Skew throws at the boundary, naming the field, instead of rendering `undefined`. The error `code` strings become compile-checked. Request and response shapes are testable with no server and no browser. Keeps a clean path to OpenAPI if a second consumer appears. | A third workspace, with build ordering. Roughly 13 KB gzipped and a few milliseconds per response. A standing temptation to put business rules in it, which the table above exists to resist. | — |

## Consequences

**Easier**

- "What does this endpoint return?" has one answer, in one file, that both sides are compiled
  against and one side checks at runtime.
- A renamed or newly-nullable field fails the build across both apps in the same commit.
- The `password_change_required` code, and every other code the React app switches on, becomes
  a shared constant rather than a string typed twice.
- Contract shapes can be unit-tested with no server and no browser — they are plain values.
- Mock data in UI tests is built from the schema, so a fixture cannot describe a response the
  server could never send. This is the quiet win: most UI suites drift from reality through
  their fixtures rather than their assertions.

**Harder**

- Three workspaces instead of two, with a build order. The contracts package must build before
  either app, and the root `workspaces` field currently lists `apps/*` only.
- Every new endpoint touches three places — schema, server route, browser call — instead of
  two. That is what it costs for the contract to be real, and it is paid roughly 40 times.
- The package will attract things that do not belong in it. The table above is the defence,
  and PR review is where it gets applied.
- **A runtime validation failure needs designed behaviour, not a crash.** A parse throwing in
  the data-fetching layer must land on the screen's existing error state and be logged with
  the endpoint and the field, or this decision trades a silent bug for a white screen. See
  follow-up 3.

**Follow-up work created**

1. **Create the contracts workspace**: `zod` as its only dependency, the root `workspaces`
   field extended to include `libs/*`, build ordering wired. Owner: DEV, as groundwork before
   US-001.
2. **Two lint rules**, added beside the existing boundary rules in `eslint.config.mjs`: the
   contracts package may import nothing from `apps/**`, and `apps/ui` may import nothing from
   `apps/api`. The second is what keeps the service-role key's module unreachable from the
   browser, and it is the reason this option was chosen over path mapping. Verify each fires
   against a deliberate violation before trusting it — a boundary rule that never fires is
   decoration.
3. **Decide what a failed response parse does to the user**, and implement it once in the
   data-fetching layer rather than per screen: which existing `ST-##` error state it lands on,
   and what is logged. Owner: DEV with UX, at the first story that fetches data.
4. **Add the contracts package to the protected paths** in `ai/standards/task-surfaces.md`. It
   is the contract, so changing it is Complex by definition, and the existing "changed response
   shape → Complex" rule should point at it.
5. **Close the open question** in `ai/standards/api-standards.md`, which currently records this
   as undecided and says to record the answer there.
6. **Server-side response validation is deliberately not required at runtime.** The server's
   responses are typed from the schemas, so a mismatch fails the build; parsing them again in
   production would spend time catching what the compiler already caught. Route tests should
   parse the response through the schema, so the assertion is made against the contract rather
   than against a hand-written literal.

**Not closed by this decision**

If a second consumer ever appears — a mobile app, an IT integration, browser tests in a
separate QA repository — generating an OpenAPI description from these Zod schemas is the
expected next step. That would supersede only the "no published description" part of this ADR,
not the shared package itself.
