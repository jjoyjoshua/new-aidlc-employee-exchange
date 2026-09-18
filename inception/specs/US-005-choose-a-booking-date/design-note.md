# US-005 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-005 — Choose a booking date inside the window](../../stories/user-stories/US-005-choose-a-booking-date.md) |
| **Screen**   | [SCR-003](../../design/screens/SCR-003-book-a-desk.md) **ST-01, ST-02, ST-03** — the date controls only. The availability list and the confirm action are US-006/US-007 |
| **Tier**     | Complex — but on two surfaces, not five (see §0). Smaller than US-001–US-004 |
| **Author**   | Architect persona (AI draft), 2026-09-18                                 |
| **Rests on** | [ADR-001](../../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md), [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md) — **no new ADR** (§6) |

**Advisory.** The human's GitHub review is the authority. This note exists so the shape is
argued before the code, not in a review thread. `decisions.md` in this package stays DEV's.

The story hands one thing to `/architect` by name: *"Needs the office timezone as configuration
and availability keyed by an office-local date. Shape is `/architect`'s to settle — no OpenAPI
contract exists in this repository yet."* The configuration half is already done
(`apps/api/src/config/index.ts:47`, no default, deliberately). What is unsettled is the wire:
**how does the browser learn what "today in the office" is, and does US-005 need an endpoint of
its own to find out?**

The answer is §1, and it is the reason this note is short.

---

## 0. The tiering

**Complex, and it stays Complex** — but on **two** surfaces, and it is worth saying which, because
a plan written from US-001's or US-003's shape will be three times too big.

- **`libs/contracts/**`** — a protected path (`ai/standards/task-surfaces.md:25`). Two existing
  response shapes gain one nested object (§1.3), and a new module of shared pure functions lands
  beside `password.ts` (§2.3). "A changed response shape" is Complex by
  `ai/context/task-classification.md` §Complex.1 on its own.
- **Browser: the props of a shared component.** AC-07 puts the office timezone in the page header,
  and SCR-003's component table (line 152) assigns that to `app-shell`. `app-shell` is shared —
  its props are a Complex surface (`task-surfaces.md` §Browser).

**What it is not, and every one of these is a section a plan does not need:**

| Not this | Why |
| --- | --- |
| **No new endpoint** | §1. The window and weekday rule are computable from two values that ride an existing response |
| **No new route mount in `http/app.ts`** | follows from the above; `bookings` still mounts nothing |
| **No migration** | nothing is read from or written to `bookings` in this story |
| **No new config key** | `OFFICE_TIMEZONE` already exists and is already required. §2.6 — the 30 must **not** become one |
| **No middleware change** | `require-session.ts` is untouched |
| **No new dependency** | `Intl` is the platform; no date library is needed and none should be added (§2.7) |
| **No new client route** | `/book` is already reserved (US-001 design note §9.1); this story lands SCR-003 there |

**One thing the story's framing understates.** AC-01's *"that date's availability is already
loading or loaded"* and AC-08's response-ordering race are both about a request whose endpoint
belongs to US-006. They are still US-005's to satisfy. §4 says how, without designing US-006's
endpoint.

---

## 1. US-005 needs **no new endpoint**

### 1.1 The reduction: exactly one step in this story needs a timezone

Work the rules backwards from what the screen renders:

| What the screen needs | What it takes |
| --- | --- |
| Is `2026-10-03` inside the window? | `today` and `today + 30`, as calendar dates |
| Is `2026-10-03` a weekend? | the day of week of a **calendar date** |
| Which date to preselect? | the first non-weekend calendar date from `today` |
| Where does the calendar stop? | the month of `today`, the month of `today + 30` |
| What is today? | **an instant, plus the office's IANA zone** |

Only the last row involves a timezone. Everything above it is arithmetic on a *civil date* — a
`YYYY-MM-DD` with no instant and no zone attached — and civil-date arithmetic gives the same
answer in Kolkata, in London and in a CI runner pinned to UTC.

**That is the whole design.** Reduce "today in the office" to a `YYYY-MM-DD` string **once**, and
the remaining seven acceptance criteria contain no timezone at all. This is not a convenience: it
is the same reasoning `db-design.md` §1.3 already applied to the column — *"A `date` has no
timezone to get wrong. The office's own 'today' is computed once, **on the server**, from the
configured office timezone."* US-005 is the first story that has to make that sentence executable.

### 1.2 So the wire carries two values, not a resource

The browser needs:

| Value | Shape | What it is for | Why the server must supply it |
| --- | --- | --- | --- |
| `today` | `YYYY-MM-DD` | the window's left edge, and `+30` its right edge | it is the office's fact, and the only fact in this story a device clock can get wrong |
| `timezone` | IANA name, e.g. `Asia/Kolkata` | AC-07's *"stated once in the page header"* | it is server configuration; the browser has no other way to know it |

That is two scalars. A resource is a thing you `GET`, `POST` and version; this is boot state.
**`today` is deliberately sent instead of the browser deriving it** from its own clock with
`Intl`, and that is the one judgement in §1 worth challenging:

- A device whose clock is a day out would render a window starting a day late, let the employee
  select a date, and have the server refuse it at `POST /api/bookings` — a refusal *after* she
  commits, which is precisely what SCR-003's stated principle PRIN-2 forbids
  (*"five business rules can refuse a booking, and none of them should refuse it after she
  commits"*).
- NFR-001's whole content is that "today" is an office fact, not a device fact. Deriving it from
  the device's clock leaves one device dependency in a chain built to remove them.
- It costs one field on a request the browser already makes.

**Staleness is inside the requirement, not a gap in it.** `today` is fixed at boot. The story's own
edge cases say: *"Midnight in the office while the screen is open: ... The screen is not required to
re-derive 'today' without a reload."* A boot-time value is exactly as fresh as US-005 asks for. Say
so in the PR, because it looks like an oversight and is not.

### 1.3 Where the two values ride: the boot responses that already exist

Add one nested object to `libs/contracts/src/auth.ts`, and put it on the **two** responses through
which a browser obtains its boot state:

```ts
/** An office-local calendar date. No instant, no zone — see the design note §1.1. */
export const officeDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type OfficeDate = z.infer<typeof officeDateSchema>;

/**
 * The office's own clock, as the browser is allowed to know it (NFR-001).
 * `today` is the server's answer, not the device's: it is stale only across an office midnight
 * with the tab left open, which US-005's edge cases explicitly do not require re-deriving.
 */
export const officeSchema = z.object({
  timezone: z.string().min(1),
  today: officeDateSchema,
});
export type Office = z.infer<typeof officeSchema>;

export const signInResponseSchema  = z.object({ session: sessionSchema, user: authenticatedUserSchema, office: officeSchema });
export const sessionResponseSchema = z.object({ user: authenticatedUserSchema, office: officeSchema });
```

Both, not one: `POST /api/auth/sign-in` is how a warm sign-in obtains boot state, and
`GET /api/auth/session` is how a cold boot does (US-003 design note §5.1). Today the UI takes
`user` from whichever of the two it got, and `office` follows the same path for the same reason.
`setPasswordResponseSchema` needs **nothing** — a browser reaching SCR-010 already signed in, and
already holds `office`.

Responses stay non-`.strict()` (`auth.ts:63-70`), so this is an additive change a tab loaded
before the deploy survives.

**Is `office` on an auth response honest?** It is the objection to answer at review, so answer it
in the PR. `sessionResponseSchema` is not "auth data" — it already carries `role` and
`mustChangePassword`, which are routing facts, not authentication facts. What it really is is
*"everything this browser needs before it can render its first screen"*. The office's zone and the
office's today are boot facts of the same kind: constant for the session, needed before the first
render, and wrong to fetch per screen. Nesting them under `office` rather than flattening
`officeTimezone` next to `user` keeps them from reading as properties of the person.

**Where it comes from on the server.** `auth.router.ts`'s `GET /session` handler currently answers
`res.json({ user })`. It gains `office`, built from the configured zone and
`officeToday(nowMs(), timezone)` (§2.2). The router already receives `nowMs`
(`AuthRouterDeps`), so **no new clock is threaded**; the timezone arrives as a
`createAuthRouter` dep rather than by calling `config()` in the handler, so
`buildApp({ officeTimezone })` becomes the test seam for AC-07 exactly as `sessionLifetimeMs` is
for NFR-009 (`composition.ts` `BuildAppOptions`).

### 1.4 What was rejected, and why

- **A new `GET /api/office`, or `GET /api/bookings/window`.** The cleanest-looking option and the
  wrong one. It buys a second round trip on every cold boot to fetch two scalars the first round
  trip could have carried, adds a route mount and a router to a module that otherwise stays empty
  in this story, and — because `today` is time-varying — it is not even cacheable, which is the
  usual reason to separate configuration from session. It also saves nothing on tier: §0 stays
  Complex either way. **If the team later grows a real settings surface** (office hours, holidays,
  a second office under NFR-002), that endpoint is the right home and `office` moves to it.
  Nothing here makes that move harder: it is one field group on two responses.
- **`VITE_OFFICE_TIMEZONE` baked into the UI bundle at build time.** It duplicates a server
  configuration value into a build artefact, so the zone can be changed on the server and remain
  wrong in the browser until someone rebuilds. `OFFICE_TIMEZONE` deliberately has no default
  precisely so a wrong zone cannot be silent (`config/index.ts:31-36`); a build-time copy hands
  that silence straight back.
- **A `GET /api/bookings/availability?date=` response that also carries the window.** That is
  US-006's endpoint and it is the wrong shape anyway: the window must be known **before** the
  first availability request, because the preselected date (AC-01) is derived from it.
- **The browser computing `today` from `Intl` and its own clock.** §1.2. If you disagree, the
  fallback is clean — drop `today` from `officeSchema`, keep `timezone`, and compute with
  `Intl.DateTimeFormat(…, { timeZone }).formatToParts(new Date())`. Record it in `decisions.md`
  as an accepted device-clock dependency; do not leave it unstated.

---

## 2. The domain logic

### 2.1 The split: the zone-dependent step is server-only, the arithmetic is shared

Both sides need the *same* window and weekday rule — the browser to render 30 chips, the server to
refuse a bad date at US-006's read and US-007's write. Two implementations of BR-001.3 is the drift
ADR-002 exists to prevent. But only the server may derive `today`. So:

```
libs/contracts/src/booking-window.ts     pure civil-date arithmetic: no Intl, no clock, no zone
                                         -> imported by apps/ui AND by apps/api/src/domain

apps/api/src/domain/booking-window.ts    officeToday(nowMs, timeZone) — the ONE zone-dependent
                                         step, and the one function the browser must never run
```

**Precedent, not novelty.** `libs/contracts/src/password.ts:26` already holds
`evaluatePasswordPolicy` — V-12, a business rule, evaluated by the same function on both sides,
justified by US-004's design note as ADR-002's payoff. This is the identical case: a
requirement-level rule that a screen and a route must answer identically.

**One honest wrinkle DEV must not step over.** `libs/contracts/src/index.ts`'s docblock, and
`eslint.config.mjs` Boundary 5's message, both say *"It describes what crosses the wire; the rules
live in `apps/api/src/domain`."* `password.ts` already contradicts that sentence. Either update the
two comments to say what is actually true — *the wire shapes, plus the rules both sides must
evaluate identically* — or move the shared predicates into `apps/ui` and accept a second copy.
**Recommendation: update the comments.** A duplicated weekday rule is worse than an inaccurate
docblock, and the docblock is already inaccurate.

`apps/api/src/domain/**` importing `@desk-booking/contracts` is **permitted** by Boundary 2: its
forbidden patterns are `modules/`, `infra/`, `http/`, `config/`, `express` and `@supabase/*`, none
of which matches, and `contracts` depends on zod alone, so `domain/` stays pure. Confirm it by
running lint rather than by reading the config, and paste the result in the PR.

### 2.2 `officeToday` — the only function in the story that knows what a timezone is

```ts
// apps/api/src/domain/booking-window.ts
/**
 * NFR-001 — the office's own calendar date at a given instant. The ONE zone-dependent step in
 * US-005 (design note §1.1); everything downstream is civil-date arithmetic.
 *
 * Every input is an argument, including the clock reading — `domain/` never reads the clock and
 * never reads config (eslint Boundary 2). `Intl` is neither: it is a pure function of an instant
 * and a zone.
 */
export function officeToday(nowMs: number, timeZone: string): OfficeDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(nowMs));
  const at = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${at('year')}-${at('month')}-${at('day')}`;
}
```

**`formatToParts`, not `format` with a locale that happens to emit ISO.** The `en-CA` trick works
today and is a bet on locale data staying put; assembling the parts is not a bet. This is the same
class of decision as `config/index.ts:19-29` validating the zone by asking the platform.

The zone is already validated at boot, so `officeToday` may assume a real IANA name and needs no
error path of its own.

### 2.3 The shared predicates

```ts
// libs/contracts/src/booking-window.ts  — pure, total, no Intl, no Date.now, no zone.

/** REQ-006 — today through today + 30 calendar days, INCLUSIVE. Calendar days, not working
 *  days: the story's edge cases are explicit that the window's end does not skip weekends. */
export const BOOKING_WINDOW_DAYS = 30;

/** AC-04's three reasons, as codes. Copy lives in the UI, keyed on the code (US-001/D-10):
 *  'past' -> "Past", 'too-far-ahead' -> "Too far ahead", 'closed' -> "Closed". */
export type DateRefusal = 'past' | 'too-far-ahead' | 'closed';

export function addDays(date: OfficeDate, days: number): OfficeDate;
/** BR-001.3 — Saturday or Sunday. */
export function isWeekend(date: OfficeDate): boolean;
/** REQ-006's right edge: addDays(today, BOOKING_WINDOW_DAYS). */
export function lastBookableDate(today: OfficeDate): OfficeDate;
/** `undefined` means bookable. AC-02, AC-03 and AC-04 in one function — see §2.4. */
export function refusalFor(date: OfficeDate, today: OfficeDate): DateRefusal | undefined;
/** AC-01's preselection. Total — see §2.5. */
export function nextBookableDate(today: OfficeDate): OfficeDate;
```

`addDays` is implemented through `Date.UTC(y, m - 1, d + days)` and read back with `getUTC*`. UTC
has no daylight saving and no half-hour surprises, so it is a pure calendar calculator here, not a
timezone — the arithmetic never touches the office's zone and must not.

### 2.4 One function returning a reason, not three booleans — and the precedence is load-bearing

AC-04 requires the refusal to be *readable as text*, and the three reasons are mutually exclusive
in a fixed order:

```
past            date <  today
too-far-ahead   date >  today + 30
closed          weekend                       <- checked LAST
otherwise       bookable (undefined)
```

**A Saturday two weeks ago is `past`, not `closed`.** Checking the weekend rule first produces
"Closed" on a date whose real problem is that it has gone, which is a worse answer for a screen
reader than no answer. The order costs nothing and is the kind of thing only ever noticed by the
test that pins it, so pin it: a past Saturday and a Saturday beyond the window each get one
assertion.

Returning `DateRefusal | undefined` rather than a boolean is what lets `date-strip` and the
calendar footer render AC-04's text from the same call. The UI never re-derives *why*.

**Comparison is string comparison.** Zero-padded `YYYY-MM-DD` sorts lexicographically exactly as it
sorts chronologically, so `date < today` and `date > last` are `<` and `>` on strings. No parsing,
no `Date` objects, no timezone. Say this in the code comment — a reviewer's instinct will be that
it is a bug.

### 2.5 `nextBookableDate` is total, and that matters for the UI

Scan forward from `today` until a non-weekend date. At most two steps: Saturday → Monday, Sunday →
Monday. The window is 30 days, so the result is always inside it, which means the function returns
`OfficeDate` and **not** `OfficeDate | undefined`. That absence is deliberate: an optional return
would push an unreachable empty state into SCR-003 ST-01, and an unreachable state is one nobody
maintains. The proof of totality belongs in the docblock, because it depends on
`BOOKING_WINDOW_DAYS >= 2` — which §2.6 is about keeping true.

AC-05's calendar clamp falls out of the same two values with no new function: the first navigable
month is `today`'s, the last is `lastBookableDate(today)`'s. A 30-day window spans two calendar
months, or three only when it starts late in a 31-day month — the component must handle the
general case rather than assuming two.

### 2.6 The 30 is a constant, **not** a configuration key

DEV will reasonably ask whether this mirrors `SESSION_LIFETIME_DAYS`. It must not.
`SESSION_LIFETIME_DAYS` is configurable because shortening a session window is a real incident
lever (US-003 design note §3). Nothing analogous exists here: REQ-006 says a month, no NFR or risk
asks an operator to change it, and a deployable booking horizon is a product decision arriving
through Gate 1, not through an `.env` file. Making it configurable would also make
`nextBookableDate` partial (§2.5) for no gain.

One constant, in `libs/contracts/src/booking-window.ts`, imported by both sides. The number appears
once in the codebase, exactly as NFR-009's 30 does.

### 2.7 No date library

`date-fns`, `luxon` and `dayjs` all solve this, and all of them are a human decision
(`task-surfaces.md` §Escalate) for arithmetic that is two `Date.UTC` calls and one
`Intl.DateTimeFormat`. The one place such a library genuinely earns its place is zone conversion,
and this design has exactly one zone conversion, on the server, in five lines. Do not add one; if a
later story disagrees, that is its argument to make.

### 2.8 The formatting trap, which will otherwise be found in review

```js
new Date('2026-10-03')            // parsed as UTC MIDNIGHT
  .toLocaleDateString(undefined)  // renders "Oct 2" for any viewer west of Greenwich
```

Every date label on SCR-003 is a civil date, so **no label may be produced by handing a
`YYYY-MM-DD` string to `new Date()` and formatting it in local time.** Format from the parts, or
construct with `Date.UTC(...)` and format with `{ timeZone: 'UTC' }`. This is the single most
likely defect in the story, it reproduces only for a subset of viewers, and AC-07's test — device
timezone deliberately different from the office's — is what catches it. One small shared formatter
in the UI, used by the strip, the calendar and the footer, is worth more than three call sites
getting it right independently.

---

## 3. Where US-005's contract ends and US-006/US-007's begins

Stated so the boundary is not renegotiated in a review thread:

| Concern | Story | Surface |
| --- | --- | --- |
| Is this date open at all — window + weekday, in office time | **US-005** | `booking-window.ts`, both sides |
| The office's zone and today reaching the browser | **US-005** | `office` on the two boot responses (§1.3) |
| How many desks are free on a given date, and which | US-006 | `GET /api/bookings/availability?date=` — **not designed here** |
| Taking a desk, and the two unique indexes arbitrating a race | US-007 | `POST /api/bookings`, `app-architecture.md` §4.1 step 4 |

**What US-006 and US-007 inherit rather than rebuild:** `refusalFor(date, officeToday(...))` is the
server-side date check for both of them — `app-architecture.md` §4.1's step 3, *"`domain/` decides
whether the date is bookable at all"*, is this function, called from their services. US-005 builds
it; they call it. Their PRs should not introduce a second window check, and a reviewer should
refuse one.

**A note for whoever writes US-006's plan:** the availability endpoint must re-derive `today`
server-side and refuse an out-of-window date itself. The browser's copy of the window is for
rendering; it is never the authority, and a request carrying a weekend date must be refused by the
server even though US-005's UI makes it unreachable by mouse.

---

## 4. AC-01's "already loading" and AC-08's race, without designing US-006

Both criteria are US-005's, and both are about a request whose endpoint does not exist yet. The
resolution is a seam, not a stub screen:

- SCR-003's screen folder owns the fetch lifecycle — *when* a request is issued for the selected
  date, and *which* response is allowed to paint. That is US-005's.
- *What* the request returns is US-006's, behind one narrow function
  (`fetchAvailability(date, signal)`) that US-005 declares and US-006 fills in.

**AC-01** is then provable today: mounting SCR-003 with no `?date=` preselects
`nextBookableDate(office.today)` and issues exactly one request for it. Assert the preselected date
and that the request was issued — *"already loading or loaded"* is satisfied by the loading state,
which is ST-02 and exists in the approved screen spec.

**AC-08** is *latest-wins*, and it has a right and a wrong implementation:

- **Right:** a monotonically increasing request id (or an `AbortController` per request plus a
  generation check on arrival). A response whose id is not the current one is **discarded**, not
  rendered. The date controls are never disabled — ST-02's own words are *"the date strip fully
  interactive (changing your mind mid-load must not be blocked)"*.
- **Wrong, and it passes a careless test:** disabling the strip while loading. That makes the race
  unreachable and satisfies AC-08 by removing the behaviour AC-08 is about — and it contradicts
  ST-02 directly.

The QA note is right that asserting only the final rendering will hide an overwrite: resolve the
**first** request *after* the second and assert the first's payload never appears.

Where this lives: a hook in `apps/ui/src/screens/book-a-desk/`, private to the screen, **not** in
`lib/api-client.ts`. Latest-wins is a property of this screen's interaction, not of the transport,
and US-001 design note §9.4 already fixed what the transport does.

---

## 5. Configuration: nothing to add

`OFFICE_TIMEZONE` is already required, already validated as a real IANA name, and already fails the
boot when absent (`config/index.ts:47`, `:19-29`; `config/index.spec.ts:44-55` proves all three).
US-005 is its first consumer. **The config module is not modified**, which is what keeps the
"newly required config value" Complex trigger out of §0 — and a reviewer should expect to find no
diff there.

The test seam for AC-07 is `buildApp({ officeTimezone })` (§1.3), not an environment variable, for
the same reason US-003 made `sessionLifetimeMs` an injection rather than an `.env` value.

---

## 6. No new ADR

The test is the one US-002 and US-003 applied: does a decision bind work beyond the story that made
it, with a rejected alternative a future author would otherwise re-litigate?

The one candidate is real and should be named rather than skipped: **the server tells the browser
what today is, instead of the browser deriving it.** It binds every later screen that needs an
office date — SCR-002's Completed derivation (BR-001.5), SCR-005's filters. But it is **already
decided, and already written down**, in the Gate 1 architecture deliverable, with its reason
(`db-design.md` §1.3):

> **`booking_date` is a `date`, never a timestamp.** ... A `date` has no timezone to get wrong. The
> office's own "today" is computed once, on the server, from the configured office timezone.

Writing an ADR now would transcribe an existing decision into a second document, which the charter
explicitly says the architecture deliverable exists to avoid. The rest of this note is a field
group on two responses (§1.3), a file split (§2.1), a precedence order (§2.4) and a constant (§2.6)
— none of which binds anything beyond US-005 and its two successors.

**It rests on the two ADRs rather than bending them.** ADR-002 is exercised, not amended: a
requirement-level rule evaluated identically on both sides is what `evaluatePasswordPolicy` already
is. ADR-001 is untouched — nothing new reaches Supabase in this story at all.

**Where this note contradicts a written sentence, it says so** (§2.1: `libs/contracts`'s docblock
and eslint Boundary 5's message both claim the rules live only in `apps/api/src/domain`). That is a
comment to correct in this PR, not an ADR.

---

## 7. File placement

**New**

```
libs/contracts/src/booking-window.ts (+ .spec.ts)   <- BOOKING_WINDOW_DAYS, addDays, isWeekend,
                                                       lastBookableDate, refusalFor,
                                                       nextBookableDate (§2.3). Pure, shared
                                                       <- protected path

apps/api/src/domain/booking-window.ts (+ .spec.ts)  <- officeToday(nowMs, timeZone) only (§2.2)

apps/ui/src/screens/book-a-desk/BookADesk.tsx (+ .spec.tsx, .css)   <- SCR-003 ST-01/02/03,
                                                       date controls only
apps/ui/src/screens/book-a-desk/use-availability.ts (+ .spec.ts)    <- the latest-wins seam (§4)
apps/ui/src/components/date-strip/   (+ .spec.tsx, .css)            <- SCR-003 component table
apps/ui/src/components/date-picker/  (+ .spec.tsx, .css)            <- clamped calendar, AC-05/06
```

**Modified**

```
libs/contracts/src/auth.ts        + officeDateSchema, officeSchema; office on
                                    signInResponseSchema and sessionResponseSchema (§1.3)
                                    <- protected path
libs/contracts/src/index.ts       + export ./booking-window.js; correct the docblock (§2.1)
                                    <- protected path
eslint.config.mjs                 Boundary 5 message, same correction (§2.1)
                                    <- protected path; message text only, no rule change

apps/api/src/modules/auth/auth.router.ts   GET /session and the sign-in response build office;
                                           deps gain officeTimezone (§1.3)
apps/api/src/composition.ts                officeTimezone from config into createAuthRouter;
                                           BuildAppOptions gains the override (§5)
apps/api/src/modules/auth/auth.routes.spec.ts   + the US-005/AC-07 describe block
apps/api/src/modules/bookings/README.md    say what the module owns; the window rule lives in
                                           domain/ and libs/contracts, not here

apps/ui/src/lib/auth/auth-context.tsx      carry office alongside user from both responses
apps/ui/src/lib/auth/auth-context.spec.tsx
apps/ui/src/components/app-shell/AppShell.tsx  the header states the office timezone once (AC-07)
                                               <- shared component props: a Complex surface
apps/ui/src/components/app-shell/AppShell.spec.tsx
apps/ui/src/routes.tsx                     /book -> SCR-003 (reserved in US-001 design note §9.1)

inception/specs/index.md                   the US-005 row
knowledge/traceability/manifest.json       US-005 tests[]
```

**Not modified, and worth saying so:**

- **`supabase/migrations/`** — nothing is read from or written to `bookings` in this story.
- **`apps/api/src/config/index.ts`** — §5. `OFFICE_TIMEZONE` already exists.
- **`apps/api/src/http/app.ts`** — no new mount; `bookings` still has no router.
- **`apps/api/src/http/middleware/`** — the chain is untouched.
- **`libs/contracts/src/error.ts`** — US-005 introduces no refusal that crosses the wire. AC-04's
  three reasons are rendered from `DateRefusal`, which is a domain code, not an error code. If a
  later story needs the server to refuse a date on the wire, that is `422` plus a new code, and it
  is US-006's or US-007's to add (`app-architecture.md` §5.3 — the rule says no).

---

## 8. Test placement summary

The organising constraint is the QA note: *"a fixed injectable 'now' so a test run on a Friday and
one on a Monday assert the same thing."* Every seam needed for that already exists or is created
here — `officeToday(nowMs, tz)` takes both as arguments, and everything downstream takes a
`YYYY-MM-DD` string, so **most of this story's criteria are proven with no clock at all.**

| AC | Proven where | Level |
| --- | --- | --- |
| AC-01 | `booking-window.spec.ts` — `nextBookableDate` for a Wed (itself), a Sat (Mon), a Sun (Mon) | unit |
| AC-01 | `BookADesk.spec.tsx` — mount with a fixed `office.today`; the preselected chip, and exactly one availability request issued for it | component |
| AC-02 | `booking-window.spec.ts` — `refusalFor` at `today` (bookable), `today+30` (bookable), `today+31` (`too-far-ahead`), `today-1` (`past`). **The off-by-one the QA note names** | unit (boundary) |
| AC-03 | `booking-window.spec.ts` — a Sat and a Sun inside the window give `closed` | unit |
| AC-03 | `date-strip.spec.tsx` — the weekend chip is rendered, is not selectable, and its **text** contains "Closed" (not a class, not a colour) | component |
| AC-04 | `booking-window.spec.ts` — the precedence: a **past Saturday** is `past`, a Saturday **beyond the window** is `too-far-ahead` (§2.4) | unit |
| AC-04 | `date-strip.spec.tsx` — all three reasons readable as text | component |
| AC-05 | `booking-window.spec.ts` — first and last navigable month from `today` and `lastBookableDate`, including a `today` late in a 31-day month | unit |
| AC-05 | `date-picker.spec.tsx` — navigation refuses to leave those two months | component |
| AC-06 | `date-picker.spec.tsx` — a refused cell carries the strikethrough treatment; the footer states both rules once, naming the last bookable date | component |
| **AC-07** | `booking-window.spec.ts` (server) — `officeToday` at an instant that is **a different calendar day** in `Asia/Kolkata` than in UTC: `2026-10-02T19:30:00Z` is `2026-10-03` in Kolkata | unit — the one test that needs a zone |
| AC-07 | `auth.routes.spec.ts` — `GET /session` returns `office.timezone` and an `office.today` derived from the injected `nowMs` and the injected zone, not the runner's | API |
| AC-07 | `AppShell.spec.tsx` — the timezone appears once in the header | component |
| AC-07 | `BookADesk.spec.tsx` — with the runner's `TZ` set west of UTC, labels still read the office's date (§2.8's trap) | component |
| AC-08 | `use-availability.spec.ts` — issue for date A, then date B, **resolve A last**; assert B's payload is rendered, A's never appears, and the date control was interactive throughout | unit (the race) |

**Two things not to do**, both of which produce a passing test that proves nothing:

1. **Do not compute the expected date in the test with the same function under test.** AC-02's
   boundaries are literals: if `today` is `2026-09-18`, then `2026-10-18` is bookable and
   `2026-10-19` is `too-far-ahead`, written out.
2. **Do not satisfy AC-08 by disabling the date controls during load** (§4). It contradicts ST-02
   and removes the behaviour the criterion exists to protect.

---

## 9. Open items carried out of this note

| # | Item | Owner | Blocks |
| --- | --- | --- | --- |
| 1 | **§1.3** — `office` rides `signInResponseSchema` and `sessionResponseSchema` rather than getting its own endpoint. If the team would rather have a `GET /api/office` now than move it there later, say so before implementation: it is a cheap decision now and a contract change afterwards | Joy Joshua, before D1 | the plan |
| 2 | **§2.1** — `libs/contracts/src/index.ts` and `eslint.config.mjs` Boundary 5 both say the rules live only in `apps/api/src/domain`. `password.ts` already contradicts it; this story adds a second contradiction. Correct the comments, or move the shared predicates and accept a duplicate rule | Joy Joshua / DEV, in this PR | nothing |
| 3 | **§1.2** — `office.today` is fixed at boot. A tab open across office midnight shows yesterday's window until reload. The story's edge cases permit this explicitly; BRD-001 does not address it. If the PO wants it re-derived, that is a separate story | PO | nothing |
| 4 | **§3** — US-006 and US-007 must call `refusalFor` server-side rather than trusting the browser's window, and must not introduce a second window check | Manager → US-006/US-007 | their definitions of done |
| 5 | **§2.8** — the civil-date formatting trap is a defect class, not a one-off. One shared formatter in `apps/ui`, used by every date label, is the durable fix; SCR-002 and SCR-005 will need it too | DEV, in this PR | nothing |
| 6 | Public holidays are **not** excluded (BRD-001 §8, RISK-002 accepted 2026-09-07). `refusalFor` has exactly three reasons and no holiday branch. A reviewer will ask; the answer is the accepted risk, not an oversight | — | nothing |
