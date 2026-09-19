# US-019 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-019 — Take a desk out of service, and put it back](../../stories/user-stories/US-019-take-a-desk-out-of-service.md) |
| **Screen**   | [SCR-006](../../design/screens/SCR-006-desks.md) **ST-05 – ST-10** — the six states US-016 left undrawn in code. ST-01 – ST-04 are US-016's and are not touched |
| **Tier**     | Complex — **two new write endpoints**, a **new error code**, and (on the recommended answer to §4) a change to the **one error body every route returns**, plus one additive prop on a shared component (§0) |
| **Author**   | Architect persona (AI draft), 2026-09-19                                 |
| **Rests on** | [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md), [ADR-004](../../../knowledge/decisions/ADR-004-table-ownership.md), [ADR-007](../../../knowledge/decisions/ADR-007-derived-booking-status.md), and the [US-016](../US-016-see-the-desk-inventory/design-note.md), [US-017](../US-017-add-a-desk/design-note.md) and [US-018](../US-018-correct-a-desk-number/design-note.md) design notes. **One new ADR is recommended, for §4 and nothing else** (§9) |
| **Verified against** | the real hi-fi frames in *Employee Desk Booking — Design System & Mockups*, pulled through the Figma MCP server, not the written spec alone: `HF / SCR-006 · Desks / ST-05` (node `213:1092`), `ST-06` (`214:1685` at 1280, `214:2013` at 360), `ST-07` (`214:2173`), `ST-08` (`214:2724`), the ST-09 changed row (`215:2872`) and the ST-09 / ST-10 toasts (`215:2908`, `215:3413`). Every copy string in §8.4 is read off a frame. **Three strings are NOT drawn anywhere and are named rather than invented** (§8.4, open item 5) |

**Advisory.** The human's GitHub review is the authority. `decisions.md` in this package stays DEV's.

The story hands `/architect` the same sentence US-017 and US-018 each got (`:119`): *"Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet."* §3 is the answer to the shape. **§4 is the answer to the harder half of that sentence — how the blocking count reaches the client — and it is the one decision in this story that is not already settled by precedent.**

**The verdict, in one line each:**

- **The routes are already decided, in writing, and this story is their first application rather than their author.** `ai/standards/api-standards.md:13-21` — added by US-018, quoted here verbatim in §3.1 — says a refusable state transition *"like cancelling a booking or **deactivating a desk**"* is `POST /api/admin/<resource>/:id/<verb>`. **`POST /api/admin/desks/:id/deactivate` and `POST /api/admin/desks/:id/activate`.** `admin.router.ts:142-145` names US-019 by story number as the next one. Nothing here is a new decision (§3.1).
- **§4 is the story, and it is a STOP.** The count cannot live in the `message` string, for a reason the frames make unarguable: the browser interpolates it **twice and independently** — in the body sentence *and* in the primary button label **See those 3 bookings** (frame `214:1685`). A label cannot be recovered from prose without parsing prose. **Recommendation: an optional `details` object on the error body, typed per code in `libs/contracts/src/desks.ts`.** The named fallback — refetch `GET /api/admin/desks` on the 422 — needs no contract change and no ADR, which is exactly why the human picks, not me (§4, open item 1).
- **`unprocessable()`'s docblock is about the 409/422 split, not about wire format, and this is the most likely misreading in the whole story.** `http/errors.ts:65-69` and `api-standards.md:73-75` use the same sentence — *"this desk has 3 upcoming bookings, so it can't be retired"* — to answer *which status*, against a `409`. Reading it as *"so the count goes in the message"* is reading a worked example of one decision as the answer to a different one (§4.1).
- **There is a trap with no error: `errorBodySchema` STRIPS unknown keys, and `readErrorBody` projects to three fields.** `error.ts:83-87` is a plain `z.object`, so Zod discards anything it does not declare, and `api-client.ts:86` returns `{ kind, status, code, message }` and nothing else. **An implementation that simply adds a key to the JSON server-side will pass every server test and deliver `undefined` to the dialog.** Whichever way open item 1 resolves, this sentence belongs in the PR (§4.3).
- **AC-02 is already built, and the diff for it is empty.** `bookings.service.ts:181` refuses an inactive desk and `bookings.router.ts:135-136` answers `422 desk_inactive` — US-007/FR-04's code, minted in `error.ts:45-46`. **US-019/AC-02 needs a test and no production code** (§2.4).
- **AC-12 needs no code either, and saying so is the point.** `requireAdmin` mounts once at `http/app.ts:78`, and `admin.router.ts:1-17` states the property in advance: *"Every future admin route inherits the same guard the same way."* **`apps/api/src/http/middleware/**` and `http/app.ts` are untouched, and a diff to either is a review finding** — but AC-12 still needs a test reaching the real mount with a real Employee session (§3.6, §11).
- **AC-08's re-check is server-side, in the same request, off one clock reading — and it is NOT transactional, which I am naming rather than implying.** This codebase has no transaction: every repository call is its own PostgREST round trip. A count-then-write leaves a sub-second window that only a Postgres function could close, and a function is a migration in a protected path. **Recommend accepting the window, naming it, and rejecting the two clever fixes** (§6).
- **A new repository method, not a reuse.** `listUpcomingConfirmedDeskIds` (`desks.repository.ts:26-43`) returns every upcoming booking id in the office — ~3,100 uuids by its own stated bound — to answer a question about one desk, on the hot path of a write. **`countUpcomingConfirmedForDesk(deskId, status, from)`, still fed by `displayStatusPredicate`**, which is what `modules/desks/README.md:68-70` actually requires. `bookings_desk_id_booking_date_idx` already exists and its own comment names the rule: `-- REQ-031, BR-001.9` (`0003_bookings.sql:79`) (§5.1).
- **Two service methods, not one with a boolean.** They differ in the only way that matters: `deactivateDesk` runs BR-001.9's block, `activateDesk` runs no rule at all. One repository write underneath, because the SQL genuinely is the same (§5.2).
- **`updated_at` is NOT set — the exact inverse of US-018, and it is the thing most likely to be got wrong by symmetry.** `0002_desks.sql:21-22` scopes the column in writing to *"when the desk was last renamed"* (REQ-016). This story is REQ-017. Broadening the column's meaning silently makes it unreliable for what it does claim (§5.3, open item 4).
- **ST-05 → ST-06 must stay ONE mounted `Dialog`.** `Dialog.tsx:46-53` refocuses the opener on unmount, so swapping `ConfirmDialog` for a blocked dialog bounces focus out to the row and back. One screen-private `DeskDeactivateDialog` switching its own body, footer and header icon is the answer — and it is why `ConfirmDialog` is **not** reused here despite ST-05 matching it exactly (§8.2).
- **`Dialog` gains one additive prop, `icon?: ReactNode`.** SCR-006:163 and frame `214:1685` both put a warning triangle in the ST-06 **header** as NFR-008's non-colour signal, and `DialogProps` (`Dialog.tsx:22-37`) has no slot for it (§8.3).
- **AC-06's destination is already built and needs no new code at all.** `toQueryString` (`filters.ts:63-73`) and `parseFilters` (`:39-58`) are US-014/AC-08's receiving half, already exported. The link is `/admin/bookings` + `toQueryString({ deskId, from: office.today, status: 'confirmed' }, 1)` (§8.5).

§10's "must NOT build" list is as load-bearing as everything above it. The thing most likely to ship wrong is in §4.3; the thing most likely to ship wrong *by looking right* is in §5.3.

---

## 0. The tiering — confirmed, for four independent reasons

**Complex.** Four surfaces, one more than US-018 had, and the fourth is conditional on §4.

| Surface | What it is here |
| --- | --- |
| **Server — contract** | **Two new routes**, each a **new write operation**. `task-surfaces.md:39-41` — *"a new route, or a new write operation (`POST/PUT/PATCH/DELETE`) on an existing one"* — Complex outright, regardless of diff size |
| **Contract — protected path** | `libs/contracts/**` (`task-surfaces.md:25-27`) gains **a new stable `code` string** in `error.ts`'s enum and a response schema. ADR-002:81-88 calls those codes *"the most valuable thing in the package"* |
| **Contract — protected path, and the one that needs a decision** | On §4's recommended answer, `errorBodySchema` itself changes — **the one shape every route in the system returns** (`api-standards.md:39`). This is the surface the ADR in §9 is about. On §4's fallback answer, this row disappears entirely |
| **Browser — shared component** | **One additive prop on `Dialog`** — `icon?: ReactNode`, forced by SCR-006:163 and frame `214:1685`. `task-surfaces.md:61` — *"the props or events of a shared component"* (§8.3) |

### 0.1 The Medium carve-outs, worked through — none is close

`task-surfaces.md:89-94` names four, and as with US-017 and US-018 not one is arguable:

- **`:89-90` — *"a new `GET` lookup endpoint following an existing read-only pattern"*.** These are two `POST`s. The carve-out is explicitly read-only.
- **`:91-92` — *"adding a **nullable** column plus its optional request field… where the migration is additive only"*.** There is **no migration at all** (§0.2) and **no request body** (§3.2). Fails both clauses without even reaching the nullable question.
- **`:93` — *"a new pure rule function in `domain/`"*.** None is written. BR-001.9's predicate is **reused unmodified** from `domain/booking-history.ts`'s `displayStatusPredicate` (§2.2).
- **`:94` — *"a new screen folder under `apps/ui` that only composes existing shared components and tokens"*.** `screens/desks/` already exists (US-016), and §8.3 widens one shared component. Fails on both clauses, as US-016, US-017 and US-018 each did.

### 0.2 What it is *not*, and each absence is defended below

- **Not Persistence, and this is the load-bearing absence.** `desks.is_active` already exists (`0002_desks.sql:19`), already defaults `true`, and its own comment already names this story's requirement: *"REQ-017, BR-001.7… Deactivating is reversible and never deletes."* The index the block reads through already exists too, and its comment names the rule (`0003_bookings.sql:79`, `-- REQ-031, BR-001.9`). **No column, no index, no trigger, no migration.** `supabase/migrations/**` is a protected path (`task-surfaces.md:28`) and a diff there is a review finding; `task-classification.md:110` makes it a STOP-and-ask rather than a delivery decision. **§6 is the one place a reviewer may reasonably want one — read §6.2 before agreeing.**
- **Not a trust boundary — but AC-12 is still this story's own AC.** §3.6.
- **Not a design-token change.** ST-06's warning treatment uses `--c-warning-*`, already consumed by `Alert` (`Alert.tsx:17`, `:30`); ST-08's error region is `Alert tone="danger"`, already the default; the `Inactive` chip is `StatusChip`'s existing `inventory`/`inactive` pair, shipped by US-016. **`inception/design/tokens.css` is a protected path (`task-surfaces.md:32`) and is not modified.**
- **Not a data-fetching-layer change.** `apps/ui/src/lib/data-refresh.ts` is `task-surfaces.md:62-63`'s Complex surface, set once for the whole app (REQ-036/ADR-008). US-016, US-017 and US-018 each kept this screen off it; **US-019 does not subscribe it either.** The list stays true after a state change because §8.6 updates it in place.
- **Not a new route in the browser.** Settled by US-017 §4.3 and unchanged: `apps/ui/src/routes.tsx` is **not modified**. AC-06 *navigates* to an address that already exists (`routes.tsx:58-64`).
- **Not an `eslint.config.mjs` change.** `MAY_IMPORT.desks` is `[]`. The new repository method imports `infra/supabase` and nothing else.
- **Not a `composition.ts` change.** `createDesksService` already receives the repository and the router already receives the service — the property US-018 §0.2 recorded. A reviewer will look for this diff and its absence is correct.
- **Not Dependency, not Operational, not Config.** No package, no env key, no scheduled work. One SVG asset *may* be needed (§8.3) and an asset is a file, not a dependency — US-017 §0.2's precedent.

---

## 1. What this story actually is

Two `UPDATE`s, one count, and a refusal that has to carry a number.

| AC | Where it is answered |
| --- | --- |
| **AC-01** deactivating removes the desk from availability for every date | §5.2 (the write), and the availability half is an **absence**: `bookings.repository.ts:156`'s `.eq('is_active', true)` is already US-006/AC-04 and this story does not touch it (§2.4) |
| **AC-02** an inactive desk cannot be booked at all | **§2.4 — already built.** `bookings.service.ts:181` → `bookings.router.ts:135-136` → `422 desk_inactive`. **Zero production diff; a server-side test is still required** |
| **AC-03** deactivating is confirmed, and says history survives | §8.2, §8.4 — frame-verified copy (`213:1092`): *"Past bookings on it are kept."* |
| **AC-04** a desk holding upcoming bookings is hard-blocked, and the refusal reports the count | **§2 at the rule, §4 on the wire, §8.4 at the pixel.** Three sections, three independent ways to get it wrong, and §4 is the one with a real choice in it |
| **AC-05** the refusal offers no cancel-them-all action | **§8.2** — and the proof is structural: the blocked dialog's footer holds exactly two controls, `Close` and a **navigation** (frame `214:1685`). §10 makes any batch-cancel path a review finding |
| **AC-06** the refusal routes to exactly the rows that must be cleared | **§8.5 — already built.** `toQueryString` + `parseFilters` are US-014/AC-08's two halves, already exported |
| **AC-07** deactivation succeeds once the bookings are gone | §5.2 — and like US-018/AC-07 it is satisfied by an **absence**: nothing caches the count, so the next attempt counts again |
| **AC-08** the block is enforced at the server, not only predicted on screen | **§6** — the section to read twice, and the one where I name a residual window instead of claiming there is none |
| **AC-09** activating is not confirmed | §8.1 — a negative assertion protecting a deliberate asymmetry (SCR-006:174). §10 makes adding a confirmation a review finding |
| **AC-10** the row stays in place and states the outcome | §8.6 — `markStateChanged` in `use-desks.ts`, plus the toast. **And the `bookedAhead` correction in §8.6 is the part nobody will think of** |
| **AC-11** a failure that is not the block says nothing changed | §7.3, §8.2 — frame-verified (`214:2724`), and the dismissal label changes from **Keep it active** to **Close** |
| **AC-12** only administrators can change a desk's state | §3.6 — inherited on both sides, proven at the real mount (§11) |

### 1.1 The one decision this story genuinely has to make

Everything in §3 is the application of a rule already written down. §5 and §8 are the fourth and fifth applications of shapes this codebase already holds. **§4 is the only place where two designs are both viable and the project has no precedent** — and it is a protected-path decision, so it is a STOP rather than a note (open item 1).

---

## 2. The rule — BR-001.9, and where each half of it lives

### 2.1 What BR-001.9 actually requires, stated as three separable obligations

1. **Refuse** the deactivation when the desk holds one or more **Confirmed** bookings dated the office's today or later (AC-04).
2. **Report how many** (AC-04), so the refusal is actionable rather than merely negative (PRIN-3, SCR-006:12).
3. **Cancel nothing** (AC-05), because the hard block was chosen over the cancelling alternative on 2026-09-07 (BRD-001 open question #6).

Obligation 1 is §5.2. Obligation 2 is §4 — the whole of it. Obligation 3 is **proven by an absence**: `DesksServiceDeps` (`desks.service.ts:19-23`) is `{ desks, nowMs, officeTimezone }`, and `DesksRepository` (`desks.repository.ts:22-95`) holds no `bookings` write of any kind. The service **could not** cancel a booking without acquiring a dependency, which is a visible diff in a file this PR touches. Say that in the PR; it is a stronger statement than a test asserting zero cancellations (the shape US-018 §7.3 established for AC-05's own negative).

### 2.2 The predicate is borrowed, never rewritten — and the module README already made this a requirement

`modules/desks/README.md:68-70` is unusually direct, and it was written *for this story*:

> ***"US-019's deactivation block must call the same `displayStatusPredicate('confirmed', today)` function**, not re-implement the rule by hand, or its block and this count can drift apart (US-016 design note §2.4)."*

So the service does exactly what `listAllDesks` already does at `desks.service.ts:41-47`:

```ts
const today = officeToday(nowMs(), officeTimezone);
const predicate = displayStatusPredicate('confirmed', today);
if (predicate.from === undefined) throw new Error("displayStatusPredicate('confirmed', today) returned no floor — this is a bug");
```

Three properties, each a bug if absent:

- **`'confirmed'` and the `>= today` bound are never written literally.** They arrive from `domain/booking-history.ts:66-72`. A hand-written `.eq('status','confirmed').gte('booking_date', today)` in this story would make SCR-006's **Booked ahead** column and this block two independent statements of one rule — the exact drift US-016 §2.4 and `desks.repository.ts:35-37` both warn about.
- **One clock reading per request**, threaded to the predicate and nowhere else — `desks.service.ts:31-34`'s stated discipline. Two `officeToday` calls in one request could straddle an office midnight and block on a count that disagrees with the count reported.
- **The `predicate.from === undefined` guard is copied, not skipped.** It is the same three lines already at `desks.service.ts:43-47`, and it is what makes a change to `displayStatusPredicate` fail loudly here rather than silently deactivate a booked desk.

**ADR-007 is why none of this is stored.** `bookings` has two stored statuses; *Confirmed-dated-today-or-later* is a compound predicate over them, not a third value. Nothing is denormalised and nothing drifts.

### 2.3 Past bookings never block, and that is the predicate's job, not a special case

The story's edge case (`:96`) — *"Past **Confirmed** and **Completed** bookings never block: only **Confirmed** dated today or later"* — is satisfied by `displayStatusPredicate('confirmed', today)` returning `{ stored: 'confirmed', from: today }` and nothing else. **A `Completed` filter in this story is a review finding**: `completed` is not a stored value (ADR-007), so filtering for it would mean writing a second predicate by hand, which §2.2 forbids.

### 2.4 AC-02 is already built — the check, not the assumption

`bookings.service.ts:181`:

```ts
if (!desk.is_active) return { kind: 'desk_inactive' };
```

`bookings.router.ts:135-136` turns that into `422 desk_inactive` with the code minted in `error.ts:45-46` for US-007/FR-04 — *"the posted deskId names a desk with is_active = false (BR-001.7, AC-12)"*, which names this story's rule from the other side. `bookings.repository.ts:63` already records that an inactive desk is *"returned as `{ is_active: false }`, never conflated with 'does not exist'"*.

**So AC-02's production diff is empty.** Its test is not: the story's QA note (`:114`) asks for *"a server-side booking attempt naming the inactive desk"*, which is a route-level test posting to `/api/bookings` after a deactivation, not a UI assertion. **`apps/api/src/modules/bookings/**` is not modified, and a diff there is a review finding** (§10).

---

## 3. The contract

### 3.1 The routes — settled in writing before this story existed

**`POST /api/admin/desks/:id/deactivate`** and **`POST /api/admin/desks/:id/activate`**.

This is not a decision I am making. `ai/standards/api-standards.md:13-21`, added by US-018 as its open item 5:

> *"**`PATCH /api/admin/<resource>/:id` modifies an attribute of an existing resource. A refusable state TRANSITION — one a business rule can reject with its own error, like cancelling a booking or **deactivating a desk** — is a verb sub-resource instead: `POST /api/admin/<resource>/:id/<verb>`**… a `PATCH` that fails does so on validation or a conflict over the new value itself (a duplicate desk number); a transition can fail on a rule about the resource's current state (an active booking count) that the request body never mentions."*

The rule names this story's endpoint **by example** and its refusal **by example**. `admin.router.ts:142-145` repeats it at the call site: *"that shape is for a refusable TRANSITION (US-019's activate/deactivate will be the next one), not a plain field update."* And the sibling already exists at `admin.router.ts:178` — `POST /bookings/:id/cancel`, whose own comment (`:109`) gives the same reasoning in miniature: *"`POST`, not `DELETE` — the row survives the transition."*

| Option | Verdict |
| --- | --- |
| **`POST /desks/:id/deactivate` + `/activate`** (recommended) | What the standard says, by name. Two verbs because two transitions, each with its own rule set — deactivate has a refusal, activate has none |
| **`PATCH /api/admin/desks/:id` with `{ isActive }`** | **Rejected, and US-018 §3.1 rejected it prospectively**: a `PUT`/`PATCH` carrying `isActive` *"is US-019's flow with BR-001.9's whole blocked-deactivation rule attached"*, and `SCR-007:125` keeps status off the desk form deliberately. It would also make `deskUpdateSchema` grow a field `libs/contracts/src/desks.ts:138-141` explicitly protects it from |
| **One route `POST /desks/:id/state` with `{ isActive }`** | **Rejected.** It buys one route and pays with a body that selects between two operations with different rules, different failure modes and different confirmations. The two-verb shape makes "which of these can be refused?" answerable from the address |
| **`DELETE /api/admin/desks/:id`** | **Rejected outright.** There is no delete (SCR-006:175, US-016/AC-09, `0002_desks.sql:16-18`), and a `DELETE` that deactivates is the single most misleading address this API could hold |

**Route placement:** immediately after `router.patch('/desks/:id', …)` (`admin.router.ts:152-176`), keeping the desk routes contiguous and leaving `POST /bookings/:id/cancel` last. `requireActingAdmin` (`:46-52`) is **not** called: it exists for *attribution* (`cancelled_by`), and `desks` has no actor column (§5.3).

### 3.2 The request — a path parameter and nothing else

```ts
const parsed = deskIdParamsSchema.safeParse(req.params);
if (!parsed.success) throw badRequest(ERROR_CODES.invalid_request, 'That request was not valid.');
```

**`deskIdParamsSchema` is reused verbatim** (`libs/contracts/src/desks.ts:128-129`), which is what US-018 minted it for. **No body schema, and no `req.body` is read.** The verb is in the address; a body would be a second place for the same fact.

**`libs/contracts/src/desks.ts` gains no request schema.** A story adding two write endpoints and zero request schemas is worth a line in the PR.

### 3.3 The success response — `200` with `{ id, deskNumber, isActive }`

```ts
export const deskStateResponseSchema = adminDeskSchema.omit({ bookedAhead: true });
export type DeskStateResponse = z.infer<typeof deskStateResponseSchema>;
```

```ts
res.status(200).json(outcome.desk);   // { id, deskNumber, isActive }
```

**Why `200` and not `204`.** `api-standards.md:53` reserves `204` for *"a state-changing request succeeded and has nothing to say"* and `:69-71` narrows it to an endpoint *"whose entire value is that it never fails."* Deactivate fails by design. The body also costs nothing: the write's `.select('id, desk_number, is_active')` produces it in the same round trip.

**Why `bookedAhead` is omitted, and it is not US-018's reason.** US-018 omitted it because a rename provably cannot change it. Here the two verbs disagree: a successful **deactivate** has just measured the count (it is zero, or the block would have fired), while **activate** never reads it. Rather than ship two shapes for two sibling endpoints, both return the narrow one and §8.6 handles the consequence on the client — which is the *more* correct place for it, because the correction AC-10 needs is a **row** update, not a response field.

**Why a separate name rather than reusing `deskUpdateResponseSchema`.** They are structurally identical today and both derive from `adminDeskSchema`, so they cannot drift in *shape*. The reason is the one `desks.ts:138-141` already gives for `deskUpdateSchema` not being an alias of `deskCreateSchema`: *"They are two contracts that happen to coincide."* `deskUpdateResponseSchema`'s docblock is written about `PATCH`. **Cheap alternative, named so the choice is visible: reuse `deskUpdateResponseSchema` and widen its docblock. I do not recommend it, and I would not argue hard.**

**`adminDeskSchema` and `adminDesksResponseSchema` are not modified.** **`Cache-Control` is not set**, for the reason `admin.router.ts:128` already doesn't on its `201`.

### 3.4 The refusal — `422 desk_has_upcoming_bookings`, a new code

```ts
// libs/contracts/src/error.ts — one string added to errorCodeSchema

  // US-019/AC-04 — BR-001.9, V-09. The desk holds one or more CONFIRMED bookings dated the
  // office's today or later, so it cannot be deactivated and NOTHING is cancelled (AC-05).
  // 422, not 409: the request is well formed and the rule refuses it — retrying the same
  // request unchanged will fail identically until the bookings are cleared
  // (`api-standards.md`'s 409/422 split, which uses THIS refusal as its own worked example).
  // Distinct from `desk_inactive`, which is the mirror rule on the BOOKING path.
  'desk_has_upcoming_bookings',
```

**`422`, via `unprocessable`, and the helper's own docblock claims this case by requirement id.** `http/errors.ts:65-69`: *"The request is well-formed but the rule refuses it (V-06, **V-09**, V-11). Not a race: the rule says no — 'this desk has 3 upcoming bookings, so it can't be retired'."* V-09 is this story's rule (`US-019:8`). `api-standards.md:73-75` says it a second time, naming SCR-006. **Not `409`**: nothing raced, and a different value does not resolve it.

**Why a new code rather than reusing `desk_inactive`.** That code means the booking path refused a desk that is already inactive — the opposite direction, a different endpoint, a different screen, a different remedy. Reusing it would make SCR-006 ST-06 and SCR-003's inactive-desk refusal indistinguishable to any `switch`.

The message: `'That desk has upcoming bookings, so it cannot be deactivated.'` — for logs and non-browser consumers. **The browser renders its own copy keyed on the `code`**, the discipline `admin.router.ts:189-190` states in these words and `screens/desks/copy.ts:5` repeats. **§4 is about the count, which is a different question from the message, and conflating the two is the failure mode §4.1 names.**

### 3.5 The not-found — `404 desk_not_found`, and it costs one line

Identical to US-018 §3.5, whose argument is not re-run here: desks are never deleted, so this is unreachable from the screen, but a write that matched nothing must answer *something*, and `api-standards.md:57` already assigns it a status.

```ts
if (outcome.kind === 'not_found') throw notFound(ERROR_CODES.desk_not_found, 'That desk could not be found.');
```

`desk_not_found` already exists (`error.ts:43-44`) and `notFound` is already imported (`admin.router.ts:26`). **Zero new codes for this branch, zero new imports.** No enumeration concern: there is no ownership boundary — an administrator can already read every desk via `GET /api/admin/desks` — which is the permissive branch of `api-standards.md:77-89`, the same one US-015 and US-018 each landed on. **The browser gets no state for it** (§7.3): it folds to `failed`, because SCR-006 numbers ten states and none is *"that desk is gone"*.

### 3.6 AC-12 — enforced structurally, and no trust code is written

`requireAdmin` mounts once, on the mount point, at `http/app.ts:78`. `admin.router.ts:3-16` states the consequence in advance:

> *"Employee token → 403 admin_only from the guard, **before this router is reached at all**… Every future admin route inherits the same guard the same way."*

On the client, the toggle lives inside `DeskInventoryRow` → `Desks`, already behind `RequireRole role="admin"` (`routes.tsx:66-73`).

**So AC-12's production diff is empty, and that is the correct answer rather than an omission.** A per-route role check in `admin.router.ts` would be a second, forgettable copy of a guarantee the mount already gives — the finding `admin.router.ts:58-60` already records for `GET /bookings`. **`apps/api/src/http/middleware/**` and `http/app.ts` are not modified; a diff to either is a review finding.** AC-12 still needs a route test through the real mount (§11).

---

## 4. The blocking count on the wire — the one real decision

**This is open item 1. It is a protected-path change either way it resolves, and the contract cannot be written until it does.**

### 4.1 First, dispose of the misreading — `unprocessable`'s docblock is not a wire format

`http/errors.ts:65-69`:

```
 * The request is well-formed but the rule refuses it (V-06, V-09, V-11).
 * Not a race: the rule says no — "this desk has 3 upcoming bookings, so it can't be retired".
```

That sentence exists to separate `422` from `409`. `api-standards.md:73-75` uses the *same* sentence for the *same* purpose, under a heading that says so: **"Keep the `409`/`422` split honest."** Neither passage is about where the number `3` lives on the wire; both are about which status class a rule refusal takes. **Reading it as "so the count belongs in `message`" takes a worked example of one decision as the answer to a different one**, and it is the reading most likely to be reached for, because the example happens to contain a number.

### 4.2 What the screen actually needs — and it is the frames that settle it

Frame `214:1685` (`HF / SCR-006 · Desks / ST-06 Deactivate blocked · 1280`), read directly:

| Element | Text |
| --- | --- |
| Header | ⚠ **B-03 can't be deactivated yet.** |
| Body | 3 people have it booked from today onwards. Cancel those bookings first — the desk stays bookable until you do. |
| Footer | `Close` · **`See those 3 bookings`** |

**The count is interpolated twice, independently, in two different sentences — one of which is a button label.** SCR-006:116 and :165 both name that label. A label cannot be produced from a server prose string without parsing prose, and `screens/desks/copy.ts:1-6` is categorical that this screen renders its own copy: *"Render this copy, never a server-derived string — the UI owns user-visible copy."* `admin.router.ts:189-190` states the server half of the same rule.

So the browser needs the count **as a number**. The only question left is how it arrives.

### 4.3 The trap with no error message, whichever option wins

`errorBodySchema` (`error.ts:83-87`) is a plain `z.object`. **Zod strips undeclared keys on parse.** And `api-client.ts:81-86` then projects even the declared ones:

```ts
const error = errorBodySchema.safeParse(body);
if (!error.success) return { kind: 'unavailable' };
return { kind: 'error', status: response.status, code: error.data.code, message: error.data.message };
```

**An implementation that simply puts `upcomingBookings` into the JSON server-side will pass every server-side test — route tests read the raw body — and deliver `undefined` to the dialog.** The failure has no error, no warning and no red check; it renders as a refusal that says "undefined people have it booked". **This sentence belongs in the PR description regardless of which option is chosen**, because the fallback option (§4.5, option D) has an analogous trap of its own.

### 4.4 Recommendation — an optional, code-scoped `details` object

```ts
// libs/contracts/src/error.ts

export const errorBodySchema = z.object({
  statusCode: z.number().int(),
  code: z.string().min(1),
  message: z.string(),
  /**
   * OPTIONAL, machine-readable detail scoped to the `code` that carries it (US-019/AC-04).
   *
   * Parsed LOOSELY here, for the reason `code: z.string()` above is loose: a tab loaded before a
   * deploy must not fail to PARSE a body carrying a key it has never heard of. The TYPED reading
   * lives beside the endpoint that sends it — see `deskBlockedDetailsSchema` in `desks.ts` — so
   * this file never learns any one rule's vocabulary.
   *
   * Present only where a refusal carries a fact the browser must RENDER rather than merely
   * switch on. US-019 is the first: SCR-006 ST-06 interpolates the blocking count into both its
   * body sentence and its primary button label, and a count recovered by parsing `message` would
   * be prose used as a wire format. Absent from every other error body in the system.
   */
  details: z.record(z.unknown()).optional(),
});
```

```ts
// libs/contracts/src/desks.ts

/** `POST /api/admin/desks/:id/deactivate`'s `422 desk_has_upcoming_bookings` detail
 *  (US-019/AC-04, BR-001.9, V-09). `.positive()`, not `.nonnegative()`: a zero here would be a
 *  refusal contradicting itself, and it must fail to parse rather than render "0 people". */
export const deskBlockedDetailsSchema = z.object({ upcomingBookings: z.number().int().positive() });
export type DeskBlockedDetails = z.infer<typeof deskBlockedDetailsSchema>;
```

**Server** — `HttpError` gains an optional fourth constructor argument, and `toBody()` emits it **only when present**:

```ts
toBody(): ErrorBody {
  return {
    statusCode: this.statusCode,
    code: this.code,
    message: this.message,
    ...(this.details === undefined ? {} : { details: this.details }),
  };
}
```

**That conditional spread is the load-bearing line: every error body in the system today stays byte-identical, so no existing test and no existing client changes.** Only `unprocessable` gains the parameter; the other five helpers are untouched, because no other refusal in this release carries a fact.

**Browser** — `ApiResult`'s error variant gains `details?: Record<string, unknown>`, passed through at `api-client.ts:86`. `lib/deactivate-desk.ts` applies the typed schema in the one branch that expects it, and **folds a parse failure to `failed`, never to a refusal with a wrong number** (§7.3).

**Four reasons, and the third is the one that decides it:**

1. **The browser owns its copy, and needs a number twice** (§4.2). This is the project's own rule, stated in two files.
2. **It is additive and backward compatible in both directions.** The field is optional; `errorBodySchema` is not `.strict()`; old tabs parse new bodies; new tabs parse old bodies.
3. **It declares the extension point once, in the contract package, which is ADR-002's entire purpose.** The alternative shapes (§4.5, options B and C) put a fourth top-level key on one route's body with nothing in the shared contract announcing it — so the wire shape becomes genuinely per-route, which is the thing `api-standards.md:39` exists to prevent. Under `details`, the shape stays one shape with one declared, namespaced extension slot.
4. **It keeps the rule's vocabulary out of the shared file.** `error.ts` never learns the word "bookings"; `desks.ts` holds the type, beside the endpoint that sends it.

**The honest cost, stated rather than buried:** it amends a sentence written as an absolute in three places — `api-standards.md:39` (*"One shape from every route, no exceptions"*), `api-standards.md:46-47` and `http/errors.ts:6-8` (*"Nothing else crosses the boundary"*). **That is precisely why §9 recommends an ADR for this and nothing else.**

### 4.5 The rejected alternatives, each with why it is worse *here*

| Option | Verdict |
| --- | --- |
| **A — the count in `message`, rendered verbatim by the dialog** | **Rejected on three independent grounds.** It cannot produce the button label (§4.2); it makes the server the author of user-facing copy, which `copy.ts:1-6` and `admin.router.ts:189-190` both forbid; and it puts a string no designer reviewed in front of an administrator. The frames are the approved copy and they live in `screens/desks/copy.ts` |
| **B — the count in `message`, extracted by the browser with a regex** | **Rejected outright.** Prose as a wire format. A copy edit becomes a parse failure, and the failure mode is a dialog that says `NaN` |
| **C — a top-level `upcomingBookings` on `errorBodySchema`** | **Rejected as the worse version of the recommendation.** It puts a desk-specific field on the one shape every route in the system returns, and the second rule needing a number adds a second such field. `details` namespaces once instead of N times |
| **C′ — leave `errorBodySchema` alone; have `readErrorBody` pass the raw body through, and declare `errorBodySchema.extend({ upcomingBookings })` in `desks.ts`** | **The closest second, and worth knowing about.** The shared schema keeps exactly three keys, and the extension is typed at the one call site. Against it: `ApiResult` then carries `body: unknown`, inviting every future caller to reach into raw JSON; and the wire genuinely grows an *unannounced* fourth top-level key, so the "one shape" rule is amended quietly per route rather than once and visibly. **If the human prefers the shared schema untouched, this is the option to take, not option A** |
| **D — the browser refetches `GET /api/admin/desks` on the `422` and reads `bookedAhead`** | **The named fallback, and it needs no contract change and no ADR — which is its real merit.** It also refreshes a list the race has just proved stale. Against it: a second round trip on a refusal; a loading moment inside ST-06 that SCR-006 does not number, which would be an eleventh state; and **the count can come back `0`** if the blocking booking was cancelled in between, producing exactly the self-contradicting refusal this whole section exists to avoid — rarer than option E's, not different in kind |
| **E — the browser uses the `bookedAhead` it already holds** | **Rejected, and the reason is the sharpest one available.** The server's count is needed in exactly one path: AC-08's race. In that path the browser's held count is **`0`** — that is what made it show ST-05 rather than ST-06 in the first place. So the one case where this option is exercised is the one case where it is provably wrong, and the refusal would read *"0 people have it booked"*. US-018 §4 established that reusing the held count is right *"because nothing is gated on it"*; here everything is, and `modules/desks/README.md:71-77` already wrote that warning down for this story |

**Open item 1.** Owner: Joy Joshua. Blocks `error.ts`, `http/errors.ts`, `api-client.ts`, `lib/deactivate-desk.ts`, the route, and §9's ADR.

---

## 5. The repository and the service

### 5.1 A new repository method — `countUpcomingConfirmedForDesk`

```ts
/**
 * US-019/AC-04, AC-07, AC-08 (BR-001.9, V-09). How many CONFIRMED bookings the named desk holds
 * dated `from` or later — the exact quantity BR-001.9's hard block tests, counted at the moment
 * of the deactivation and never cached.
 *
 * Reads `bookings`, a table `modules/desks` does NOT own (ADR-004: read across, write within) —
 * the read ADR-004's own Context names: "BR-001.9's blocking count is a `bookings` aggregate read
 * from inside the `desks` module's deactivation check."
 *
 * `status` and `from` arrive from the SERVICE's `displayStatusPredicate('confirmed', today)`
 * reading, never written literally here — the same discipline `listUpcomingConfirmedDeskIds`
 * states, and the whole of why this block and SCR-006's "Booked ahead" column cannot drift apart
 * (`README.md`; US-016 design note §2.4).
 *
 * `{ count: 'exact', head: true }` — the COUNT is the whole answer and no row is transferred.
 * Deliberately NOT `listUpcomingConfirmedDeskIds(...).filter(...)`: that method returns ids for
 * the WHOLE table (~3,100 uuids at BR-001.4's ceiling, per its own stated bound) to answer a
 * question about one desk, on the hot path of a write.
 *
 * Served by `bookings_desk_id_booking_date_idx` (`0003_bookings.sql`), whose own comment names
 * this rule: `-- REQ-031, BR-001.9`. No index is added by this story.
 *
 * The occupant is never read — no `user_id`, no `*` — the same "not merely never sent" discipline
 * `listUpcomingConfirmedDeskIds` states for this table.
 */
countUpcomingConfirmedForDesk(deskId: string, status: BookingStatus, from: OfficeDate): Promise<number>;
```

```ts
async countUpcomingConfirmedForDesk(deskId, status, from) {
  const { count, error } = await supabase()
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('desk_id', deskId)
    .eq('status', status)
    .gte('booking_date', from);

  if (error) throw new Error(`bookings count failed: ${error.message}`);
  return count ?? 0;
}
```

`{ count: 'exact' }` is already in the codebase at `admin-bookings.repository.ts:144`. **`head: true` is not**, so the test fake may need to record it — a mechanical note, §11 note 2.

**`listUpcomingConfirmedDeskIds` is not modified**, and its docblock (`desks.repository.ts:26-43`) needs no amendment.

### 5.2 A second write — `setDeskActive`, one method, two callers

```ts
/**
 * US-019/AC-01, AC-09 (REQ-017, BR-001.7). Flips one desk's `is_active` and returns the updated
 * row, or reports that no row matched. This module's third write.
 *
 * ONE method for both transitions because the SQL genuinely is the same statement with a
 * different value — the RULES differ, and they live in the service (`deactivateDesk` counts
 * first, `activateDesk` does not). Splitting the write would put two identical `UPDATE`s in one
 * file; splitting the service would not.
 *
 * `updated_at` is deliberately NOT set. `0002_desks.sql` scopes that column in writing to
 * "REQ-016 — when the desk was last renamed", and `updateDeskNumber` is its first and only
 * writer. This story is REQ-017. Widening the column's meaning here would make it unreliable for
 * the one thing it does claim (design note §5.3).
 *
 * No `23505` mapping, and its ABSENCE is deliberate: this write does not touch `desk_number`, so
 * `desks_desk_number_key` cannot fire. Copying `updateDeskNumber`'s duplicate branch would add an
 * unreachable outcome that a reader would then have to disprove.
 *
 * `.maybeSingle()`, never `.single()`, for the reason `updateDeskNumber` states: `.single()`
 * turns "zero rows" into a thrown Postgres error and loses the 404.
 */
setDeskActive(id: string, isActive: boolean): Promise<SetDeskActiveOutcome>;
```

```ts
export type SetDeskActiveOutcome = { kind: 'ok'; desk: DeskRow } | { kind: 'not_found' };
```

```ts
async setDeskActive(id, isActive) {
  const { data, error } = await supabase()
    .from('desks')
    .update({ is_active: isActive })
    .eq('id', id)
    .select('id, desk_number, is_active')
    .maybeSingle();

  if (error) throw new Error(`desk state update failed: ${error.message}`);
  return data ? { kind: 'ok', desk: data as DeskRow } : { kind: 'not_found' };
}
```

**Two outcomes, not three.** Reusing `UpdateDeskOutcome` (`desks.repository.ts:98-104`) would carry a `duplicate` branch that this write cannot produce.

### 5.3 `updated_at` — the thing most likely to be got wrong, by symmetry

US-018 §2.4 called `updated_at` *"the single most likely omission in the whole story"* and made setting it a requirement. **This story is the inverse, and a developer who has just read US-018's note will set it by reflex.**

`0002_desks.sql:21-23`:

```sql
  -- REQ-016 — when the desk was last renamed. Application-maintained: this schema has exactly
  -- one trigger (db-design.md §3, "The one rule that needs a trigger") and it is not this.
  updated_at   timestamptz not null default now(),
```

The comment scopes the column to **REQ-016**, a rename. This story is **REQ-017**. Setting it on an activate/deactivate would make the column mean "last renamed **or** last state-changed" while its own comment, `desks.repository.ts:76-81` and `modules/desks/README.md:35-37` all say the narrower thing — and nothing reads the column today, so the disagreement would surface only when something eventually does.

**Recommendation: do not set it, and say so in the method's docblock** so the absence reads as a decision rather than an oversight. The alternative — *"`updated_at` should mean last-modified generally"* — is defensible, and if the human prefers it the fix is one line **plus** a correction to the migration comment, `desks.repository.ts:76-81` and the module README, because leaving the comment as it stands while widening the behaviour is the worst of the three options. **Open item 4** — low stakes, but exactly the kind of thing that is cheap now and confusing in six months.

### 5.4 The service — two methods, because two rules

```ts
export type DeactivateDeskOutcome =
  | { kind: 'ok'; desk: DeskStateResponse }
  /** US-019/AC-04 (BR-001.9, V-09). `upcomingBookings` is ALWAYS >= 1 here — it is the number
   *  that caused the refusal, measured in this request (design note §6), and the number SCR-006
   *  ST-06 interpolates into both its body and its primary action's label. */
  | { kind: 'blocked'; upcomingBookings: number }
  | { kind: 'not_found' };

export type ActivateDeskOutcome =
  | { kind: 'ok'; desk: DeskStateResponse }
  | { kind: 'not_found' };
```

```ts
/**
 * US-019/AC-01, AC-04, AC-05, AC-07, AC-08 (REQ-017, BR-001.7, BR-001.9, V-09).
 *
 * The count is taken HERE, in this request, immediately before the write — never from a
 * client-supplied number and never from a cached one. US-019/AC-08 is explicit: "the count is a
 * prediction, the server is the rule". `modules/desks/README.md` carries the same warning,
 * written for this method before it existed.
 *
 * ONE `nowMs()` reading, threaded to `displayStatusPredicate` and nowhere else — the discipline
 * `listAllDesks` states above. Two readings could straddle an office midnight and block on a
 * count that disagrees with the count reported.
 *
 * AC-05: NOTHING is cancelled on the blocked path, and nothing CAN be — `DesksServiceDeps` has
 * no `bookings` write and `DesksRepository` holds none. A future author asked to "cancel them
 * and proceed" is being asked to reinstate the alternative the PO rejected on 2026-09-07
 * (BRD-001 open question #6).
 *
 * AC-07 needs no code: nothing caches the count, so a second attempt counts again.
 */
async deactivateDesk(id: string): Promise<DeactivateDeskOutcome> {
  const today = officeToday(nowMs(), officeTimezone);
  const predicate = displayStatusPredicate('confirmed', today);
  if (predicate.from === undefined) {
    throw new Error("displayStatusPredicate('confirmed', today) returned no floor — this is a bug");
  }

  const upcoming = await desks.countUpcomingConfirmedForDesk(id, predicate.stored, predicate.from);
  if (upcoming > 0) return { kind: 'blocked', upcomingBookings: upcoming };

  const result = await desks.setDeskActive(id, false);
  if (result.kind !== 'ok') return result;
  return { kind: 'ok', desk: { id: result.desk.id, deskNumber: result.desk.desk_number, isActive: result.desk.is_active } };
}
```

```ts
/**
 * US-019/AC-09 (REQ-017). No count, no rule, no confirmation — SCR-006's structural decision:
 * "activating adds one back, harms nobody, and is undone by the same control". A block here
 * would be inventing a rule BRD-001 does not have, and a symmetry argument for adding one is
 * exactly what SCR-006 rejected ("Confirming both would train Marcus to dismiss dialogs").
 *
 * The ABSENCE of a `countUpcomingConfirmedForDesk` call in this method is US-019/AC-09's
 * server-side half and is worth asserting (design note §11).
 */
async activateDesk(id: string): Promise<ActivateDeskOutcome> { … }
```

**A note on the blocked path's ordering that matters for §6:** the count precedes the write, and the desk is **not** touched when the count is non-zero. AC-04's *"nothing is cancelled"* is satisfied, and so is the stronger property *nothing is written at all*.

---

## 6. AC-08's race — the section to read twice, because I am naming a residual window rather than denying one

### 6.1 What AC-08 asks for, and what the recommendation gives

> *"**Given** the row count from US-016/AC-04 showing none · **When** a booking is made on that desk between the load and the deactivation · **Then** the server refuses the deactivation."*

The window AC-08 names is **page-load to button-press** — seconds to minutes. §5.4 closes it completely: the count is taken in the same request as the write, after the request arrives, from the database, using the same predicate that produced the number on screen. **AC-08 as written is satisfied, and it is satisfied by construction rather than by timing.**

### 6.2 The narrower window that remains, stated plainly

**There is no transaction.** Every repository call in this codebase is its own PostgREST round trip over `infra/supabase`; `grep -rn "\.rpc(\|begin\|transaction" apps/api/src` finds nothing. So between `countUpcomingConfirmedForDesk` returning `0` and `setDeskActive` committing, a booking insert can land. The result is a Confirmed booking on an inactive desk — BR-001.9's stranded employee, through a sub-second gap.

**It is symmetric, and pre-existing.** The booking path checks `is_active` in the service (`bookings.service.ts:181`) and then inserts, so it has the mirror window. Two racers, both read-then-write, and no index can arbitrate because "no upcoming confirmed bookings" is not a uniqueness property.

**Three things make it an acceptable cost rather than a defect, and all three are worth saying in the PR:**

1. **Nothing is cancelled and nothing is deleted**, so the damage is fully recoverable: the booking still exists, still appears in All bookings, and the desk can be reactivated by the same control. That is the standing advantage of the hard-block design over the cancel-them-all alternative the PO rejected.
2. **It is self-revealing.** The next load of SCR-006 shows an `Inactive` desk with a non-zero **Booked ahead** count — a visibly contradictory row, which is the best possible detection for a rare race.
3. **The closing fix is disproportionate.** The only atomic version is a Postgres function doing `UPDATE desks SET is_active = false WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM bookings …)` — inexpressible through PostgREST, so a **migration** in a protected path (`task-surfaces.md:28`) and a hard STOP-and-ask (`task-classification.md:110`), bought to close a window narrower than the one AC-08 actually describes.

**Recommendation: accept it, name it in `modules/desks/README.md` beside the new method, and do not open a migration in this PR.** **Open item 3** carries it to the human, because an accepted race is the human's to accept, not mine.

### 6.3 The two clever fixes, rejected — both will be proposed in review

| Option | Verdict |
| --- | --- |
| **Deactivate first, then count, then revert if non-zero** | **Rejected, and it is the sophisticated wrong answer.** It looks like it closes the window, because once `is_active = false` the booking path refuses new bookings. It does not — the booking path's own check is a read-then-write with the same gap. And it buys that non-fix with two real harms: a desk that is briefly, observably inactive during a deactivation the rule *refuses* (AC-04's "nothing changed" becomes false for a moment, and a concurrent reader can see it), and a failed revert leaving a desk wrongly retired with no record of why |
| **Trust a client-supplied count or an `If-Match`-style precondition on `bookedAhead`** | **Rejected outright.** AC-08's own sentence is *"the count is a prediction, the server is the rule"*, and `modules/desks/README.md:71-77` forbids it by name for this method. A precondition header would make the client's stale number load-bearing, which is the bug the AC exists to catch |
| **A Postgres function / conditional `UPDATE`** | **The only real fix, and correctly out of scope.** Named in §6.2 so a reviewer sees it was considered. If the human wants it, it is a migration and a STOP-and-ask **before** this PR, not inside it |

---

## 7. The outcomes the browser needs

### 7.1 `lib/deactivate-desk.ts`

```ts
export type DeactivateDeskOutcome =
  | { kind: 'ok'; desk: DeskStateResponse }
  /** US-019/AC-04 — 422 `desk_has_upcoming_bookings`, ST-06. The count is the SERVER's, measured
   *  in the refusing request (design note §4, §6) — never the row's own `bookedAhead`, which is
   *  provably 0 on the one path that reaches here (§4.5, option E). */
  | { kind: 'blocked'; upcomingBookings: number }
  /** US-019/AC-11 — ST-08. Transport failure, timeout, 5xx, an unparseable body, a 404
   *  (design note §3.5: the endpoint distinguishes it, the screen has no approved copy for it),
   *  OR a `desk_has_upcoming_bookings` whose `details` did not parse (§7.3). */
  | { kind: 'failed' };
```

### 7.2 `lib/activate-desk.ts` — two outcomes

```ts
export type ActivateDeskOutcome = { kind: 'ok'; desk: DeskStateResponse } | { kind: 'failed' };
```

There is no refusal to separate: AC-09 has no rule, and the 404 folds to `failed` for §3.5's reason.

**Two files, not one with two exports**, and this is the inverse of `cancel-booking.ts:57,:68`'s precedent: those two exports are *the same operation on two mounts*. Activate and deactivate are two operations, with two rules, two outcome unions and two screens states. US-018 §3.6 drew the same line for `rename-desk.ts` against `add-desk.ts`.

### 7.3 A `blocked` whose count will not parse folds to `failed` — deliberately

```ts
if (result.kind === 'error' && result.code === ERROR_CODES.desk_has_upcoming_bookings) {
  const details = deskBlockedDetailsSchema.safeParse(result.details);
  if (details.success) return { kind: 'blocked', upcomingBookings: details.data.upcomingBookings };
  console.warn('[desks] blocked refusal carried no usable count', { code: result.code });
  return { kind: 'failed' };
}
```

**A refusal the screen cannot state correctly is worse than a retryable failure**, because ST-06 without a real count is a dialog that lies. This mirrors `api-client.ts:108-127`'s own rule for an unparseable success body — *"a failed response parse is treated exactly as a 5xx"* — and the `console.warn` is there for the same stated reason: *"a silent `unavailable` here would be indistinguishable from a real outage in a bug report."*

---

## 8. The browser

### 8.1 AC-09 — activation takes no dialog, and the absence is the requirement

Clicking **Activate** calls the fetcher directly. No `ConfirmDialog`, no state machine entry, no `busy` dialog. SCR-006:174 is a structural decision with a named rejected alternative (*"Confirming both, for symmetry"*), and the story's QA note (`:113`) says a developer adding one *"would be undoing a decision"*. **§10 makes an activation confirmation a review finding.**

The in-flight guard is still needed — a double-click must issue one request — and it is the same synchronous `useRef` the dialog hook uses, held on the screen. `use-my-bookings.ts:137-140` states why the ref rather than the state.

### 8.2 ST-05 → ST-08 must be ONE mounted `Dialog` — `DeskDeactivateDialog.tsx`

**Recommendation: one screen-private `screens/desks/DeskDeactivateDialog.tsx` composing `Dialog` directly and switching its own body, footer, header icon and role on the outcome. `ConfirmDialog` is not used.**

Frame-verified, all four states from one component:

| State | Frame | Title | Body | Footer |
| --- | --- | --- | --- | --- |
| **ST-05** | `213:1092` | `Deactivate A-02?` | the consequence + *"Past bookings on it are kept."* | `Keep it active` · **`Deactivate`** (danger) |
| **ST-07** | `214:2173` | *(unchanged)* | *(unchanged)* | `Keep it active` **disabled** · `Deactivate` keeping its **label** with a spinner; close icon disabled |
| **ST-08** | `214:2724` | *(unchanged)* | *(unchanged)* + a `danger` `Alert` | `Close` · **`Try again`** (danger) |
| **ST-06** | `214:1685` | ⚠ `B-03 can't be deactivated yet.` | the count + the route sentence | `Close` · **`See those 3 bookings`** (primary green) |

**Why not `ConfirmDialog`, although ST-05 matches it exactly:** `Dialog.tsx:46-53` captures `document.activeElement` on mount and refocuses it on unmount. Rendering `ConfirmDialog` for ST-05 and a different component for ST-06 means React unmounts one and mounts the other, so focus bounces out to the row's **Deactivate** button and back in. SCR-006:116 says *"the dialog **switches** to a refusal"* — one dialog, changing. And ST-06's footer is structurally outside `ConfirmDialog`'s vocabulary anyway: its primary is a **navigation**, not a `danger` confirm, and `ConfirmDialogProps` (`ConfirmDialog.tsx:24-41`) fixes the variant at `:66`. `singleAction` does not help — ST-06 has two actions.

**Its props are Medium, not Complex**, because it is screen-private (`components/README.md:6`; `task-surfaces.md:66`). US-018 §6.1 drew exactly this distinction for `DeskFormDialog` and it travels unchanged — **say so in the PR**, because US-017 §5.2 leaned hard on the opposite rule for `components/**`.

**Two details from the frames that are easy to miss:**

- **The dismissal label changes after a failure** — `Keep it active` in ST-05/ST-07, **`Close`** in ST-08 and ST-06. Verified on `214:2724` and `214:1685`.
- **ST-06 is `role="alertdialog"`, ST-05 is too.** SCR-006:164: *"ST-06's refusal is assertive."* `DialogProps.role` already exists (`Dialog.tsx:26`).

**Focus in ST-06 goes to the refusal text, not to the primary action.** SCR-006:162 is explicit — *"because the number is the point and a focused button invites Enter before reading."* Implement with `initialFocusRef` (`Dialog.tsx:34-35, :48`) pointed at a `<p tabIndex={-1}>` in the body. **No `Dialog` change is needed for this**, only for the icon.

### 8.3 `Dialog` gains `icon?: ReactNode` — the one shared-component change

SCR-006:163 — *"The blocked refusal carries an icon and states the count in text — it is never 'the amber dialog'"* — and SCR-006:181 puts it *"in its header as the non-colour signal"*. Frame `214:1685` draws a warning triangle left of the title. `DialogProps` (`Dialog.tsx:22-37`) has no slot, and `title` is a `string` rendered into the `<h2>` that `aria-labelledby` points at (`:88-92`).

```ts
/** SCR-006 ST-06 — rendered before the title in the header, `aria-hidden`. NFR-008's non-colour
 *  signal for a dialog that carries a refusal rather than a question. Caller-owned, exactly as
 *  `footer` is: a `tone` prop would start this shell growing a second component's vocabulary. */
icon?: ReactNode;
```

| Alternative | Why it fails |
| --- | --- |
| **`tone?: 'warning'`, with `Dialog` choosing the icon** | **Rejected.** It moves icon vocabulary into a shell whose whole stated design (`Dialog.tsx:12-14`) is that the caller owns the contents. The next tone would be a second enum member |
| **Render the icon inside the body** | **Rejected.** SCR-006:181 says *header*, and the frame draws it in the header. It also weakens the signal — a body icon reads as part of the sentence |
| **`title: ReactNode`** | **Rejected.** `aria-labelledby` points at that element (`Dialog.tsx:88, :90`), so an icon inside it enters the accessible name |
| **A screen-private blocked dialog duplicating the chrome** | **Rejected.** A second focus trap, a second scrim and a second copy of `dialog.css`'s sheet/card breakpoint — the drift `ConfirmDialog.tsx:1-19` and US-017 §5.2 exist to prevent |

**The asset.** `apps/ui/src/assets/` has `icon-block.svg`, `icon-close.svg`, `icon-plus.svg` and four others — **no warning triangle**. `Alert.tsx:30-45` draws its own icon as inline SVG rather than importing an asset, so either shape has precedent. **Recommend the inline SVG in `DeskDeactivateDialog`**, matching `Alert`'s treatment, with the markup taken from the frame. **`ConfirmDialog.spec.tsx` is not edited, and its passing unchanged is the proof `Dialog`'s additive prop broke nothing** — a diff to that spec in this PR is a review finding (US-017 §5.2's device).

### 8.4 The copy — frame-verified, and the three strings nothing draws

**Copy lives in `screens/desks/copy.ts`**, beside US-016's, US-017's and US-018's, never derived from a server message (`copy.ts:1-6`).

| Element | String | Source |
| --- | --- | --- |
| ST-05 title | `Deactivate A-02?` | **Frame-verified** `213:1092` |
| ST-05 body | `It disappears from everyone’s booking options straight away. Past bookings on it are kept.` | **Frame-verified** `213:1092` |
| ST-05 dismiss | `Keep it active` | **Frame-verified** `213:1092` |
| ST-05 confirm | `Deactivate` | **Frame-verified**; `DEACTIVATE_LABEL` at `copy.ts:17` already holds it |
| ST-08 error | `We couldn’t deactivate A-02 just now. Try again.` | **Frame-verified** `214:2724` |
| ST-08 dismiss / retry | `Close` / `Try again` | **Frame-verified**; `RETRY_LABEL` at `copy.ts:95` already holds the second |
| **ST-06 title** | `B-03 can’t be deactivated yet.` | **Frame-verified** `214:1685`. The **desk number is in the title**; SCR-006:116 wrote it as one run-on sentence and the frame splits it |
| **ST-06 body** | `3 people have it booked from today onwards. Cancel those bookings first — the desk stays bookable until you do.` | **Frame-verified** `214:1685` |
| **ST-06 primary** | `See those 3 bookings` | **Frame-verified** `214:1685`. **Rightmost**, primary green — not `danger` |
| ST-09 toast | `A-02 is inactive. It’s no longer bookable.` | **Frame-verified** `215:2908` |
| ST-10 toast | `C-05 is active. People can book it from today.` | **Frame-verified** `215:3413` |

```ts
/** SCR-006 ST-06 — US-019/AC-04 (BR-001.9, V-09, PRIN-3). Verbatim against the real hi-fi frame
 *  (node `214:1685`) for a count of 3. The count is the SERVER's, from the refusing response
 *  (design note §4) — never the row's `bookedAhead`, which is 0 on the path that reaches here. */
export function blockedDialogTitle(deskNumber: string): string {
  return `${deskNumber} can’t be deactivated yet.`;
}
export function blockedDialogBody(count: number): string {
  const holders = count === 1 ? '1 person has' : `${count} people have`;
  return `${holders} it booked from today onwards. Cancel those bookings first — the desk stays bookable until you do.`;
}
export function seeBookingsLabel(count: number): string {
  return count === 1 ? 'See that 1 booking' : `See those ${count} bookings`;
}
```

**Three strings no approved artifact carries, named rather than invented** — the honesty US-018 §6.4 modelled:

1. **Both ST-06 singulars** (`count === 1`). Every ST-06 frame draws `3`. The derivations above follow `copy.ts:62` and `:125`'s existing inline-pluralisation pattern. Recommended as written; `/ux` should confirm.
2. **The activation-failure copy and its placement.** SCR-006:140 says an activation failure *"surfaces as an inline alert with the row reverted, sharing ST-08's error region"* — but ST-10 has **no dialog** (AC-09), so ST-08's error region does not exist on that path, and SCR-006:235-238 confirms the frames do not draw it. **Recommend a page-level `Alert tone="danger"` above the table, the row unchanged, reading `We couldn’t activate C-05 just now. Try again.`** — mirroring ST-08's wording and reusing ST-04's component.
3. **And note that no AC covers it.** AC-11 is *"a **deactivation** that fails"*. The activation failure has a sentence in SCR-006 ST-10 and no acceptance criterion, so it cannot be proven under this gate. **Recommend building it as above and routing the AC gap to `/ba`**, exactly as US-017 §1.1 routed its own uncovered control. Both go to **open item 5**.

`UNAVAILABLE_CONTROL_REASON` (`copy.ts:24`) **is deleted by this story** — it has no remaining caller once the toggle is live, and US-018 §6.5 kept it alive specifically for this toggle. Its deletion is a compile-checked proof that the last unbuilt control is gone.

### 8.5 AC-06's route — already built, and the only new code is one link

`filters.ts:63-73`'s `toQueryString` and `:39-58`'s `parseFilters` are US-014/AC-08's two halves, both exported, both tested.

```ts
const href = `/admin/bookings${toQueryString({ deskId: desk.id, from: office.today, status: 'confirmed' }, 1)}`;
```

- **`office.today`, from `useAuth()`** — never the device's date. `libs/contracts/src/auth.ts:10-16` is explicit: *"the server's answer, not the device's… because a skewed device clock would render a window starting a day late."* `adminDeskSchema.bookedAhead`'s own docblock (`desks.ts:29-32`) says the same about this exact count. `Desks.tsx:55` already calls `useAuth()`, so this is one destructure.
- **The honest staleness:** `office.today` is captured at session check and goes stale across an office midnight with the tab open — stated at `auth.ts:15-16` and explicitly out of scope per US-005's edge cases. One line in the PR, not a state.
- **`toQueryString` is imported across screen folders** (`screens/all-bookings/filters.ts` → `screens/desks/`). That is the first such import between two screen folders. **Recommend moving nothing**: `filters.ts` is a pure module with no React and no screen state, and `eslint.config.mjs`'s boundaries are about `apps/api` modules, not `apps/ui` screens. Named so it is a visible choice — if a reviewer prefers it in `lib/`, that is a one-file move with no behaviour change. **Open item 6.**
- **A `<Link>`, not `useNavigate`.** SCR-006:117 calls it a route out of the refusal; a real anchor gives middle-click, copy-link and the focus semantics the dialog's trap already handles. `react-router-dom`'s `Link` is already a dependency (`AppShell.tsx:18` uses `NavLink`).

### 8.6 ST-09 / ST-10 — in place, never refetched, and one correction nobody will think of

**Recommendation: `lib/use-desks.ts` gains `markStateChanged(id: string, isActive: boolean)`. `Desks.tsx` does not refetch.**

```ts
const markStateChanged = useCallback((id: string, isActive: boolean) => {
  setState((current) => {
    if (current.status !== 'ready') return current;
    return {
      ...current,
      desks: current.desks.map((desk) =>
        desk.id === id
          ? { ...desk, isActive, ...(isActive ? {} : { bookedAhead: 0 }) }
          : desk,
      ),
    };
  });
}, []);
```

- **No re-sort.** Unlike `markRenamed` (`use-desks.ts:81-89`), a state change cannot move a row: the order is `desk_number` ASC (`desks.repository.ts:111`) and the number is untouched. **AC-10 requires the row to stay put** (SCR-006:177 — *"a row that disappears from a list with no filter applied is unexplained"*), so calling `byDeskNumber` here would be harmless but misleading. Say so.
- **`bookedAhead: 0` on deactivation is the correction nobody will think of, and the frame proves it is needed.** The ST-09 changed row (`215:2872`) draws `A-02 | ⊘ Inactive | — | Edit | Activate` — an **em dash**, i.e. zero. If the administrator's list held a stale non-zero count (the bookings were cancelled elsewhere since load, which is exactly the case AC-07 describes), leaving it would render an **Inactive** desk showing *"3 upcoming"* — a visibly self-contradictory row, and the same contradiction §6.2 uses as the *detection signal* for the race. **The server has just measured it: a successful deactivation means the count was zero**, which is not the browser evaluating BR-001.9 but the browser reading the meaning of a success it was given.
  **The named alternative, if a reviewer dislikes client-side inference: have the deactivate route alone return the full `AdminDesk` with `bookedAhead: 0`** — a fact it measured, exactly as `POST /desks` returns `bookedAhead: 0` today (`desks.service.ts:82`). It costs an asymmetry between the two sibling responses (§3.3). I prefer the client-side correction; **open item 2** carries the choice.
- **Activation sets no count.** The server did not read it and the browser's value is the best available.
- **No refetch.** `use-desks.ts:58` sets `{ status: 'loading' }` at the top of every effect run, so a refetch would flash skeletons over a list the administrator is reading — `use-my-bookings.ts:44-50`'s stated reason, applied by US-017 §6.5 and US-018 §6.3 and unchanged here.
- **The summary line needs no code.** `summaryLine` (`copy.ts:58-63`) is pure over the array and recomputes the active/inactive split on every render, so SCR-006 ST-09/ST-10's *"the summary line updates"* is already true. `Desks.tsx:120` already has `role="status"`, which is SCR-006:164's live region. **Worth one line in the PR, because a reviewer will check.**
- **Additive for `AllBookings`.** `UseDesksResult` (`use-desks.ts:39-51`) gains one member; `AllBookings.tsx` reads only `.status` and `.desks`, so **it is not modified** — the property US-017 §6.5 and US-018 §6.3 each established.
- **The toast** is `Desks.tsx:92`'s existing `savedMessage`, unchanged in structure.

### 8.7 `DeskInventoryRow` — the last disabled control goes live

- `DeskInventoryRow.tsx:62-65` — the toggle loses `disabled`, loses `title={UNAVAILABLE_CONTROL_REASON}`, loses its visually-hidden reason span, and gains `onClick`. It therefore gains a prop: `onToggleActive: (desk: AdminDesk) => void`.
- `:56` — `toggleLabel` already flips between `DEACTIVATE_LABEL` and `ACTIVATE_LABEL`. **No change**, and frame `215:2872` confirms the flip to **Activate** after deactivation.
- `:13-20`'s docblock stops being true in its second half and must be rewritten: *"their destinations (US-017, US-018, US-019) do not exist yet"* is now false for all three.
- `Desks.tsx:3-9`'s docblock — *"ST-06+ on THIS screen … are still US-019's and are not built here"* — likewise.
- **`copy.ts:24`'s `UNAVAILABLE_CONTROL_REASON` is deleted** (§8.4), and `DeskInventoryRow.spec.tsx`'s surviving half of US-016's forcing test goes with it. **Keep the `US-016/AC-08` citation on whatever replaces it** — dropping a merged story's coverage silently is the hazard US-015 §5.4 named and US-018 §11 note 3 hit (§11 note 3).

---

## 9. The ADR call — one, for §4, and nothing else

**Recommendation: one new ADR, scoped to the error-body decision in §4, and no ADR for anything else in this story.** If open item 1 resolves toward the §4.5 option D fallback, **there is no ADR and no contract change at all** — which is itself the reason the decision must be taken before code.

The test US-013 through US-018 applied: *does the decision bind work beyond this story, with a rejected alternative a future author would otherwise re-litigate?*

| Candidate | Verdict |
| --- | --- |
| **§4 — structured detail on the error body** | **ADR. The one real candidate, and unlike US-018's verb rule it does not fit in a standard's bullet.** It (a) amends a rule written as an **absolute** in three places — `api-standards.md:39` *"One shape from every route, no exceptions"*, `api-standards.md:46-47` and `http/errors.ts:6-8` *"Nothing else crosses the boundary"*; (b) changes a shared schema, a shared error class **and** the shared HTTP client, so it is not one sentence; (c) has a genuinely viable alternative that needs **no** contract change (option D), which is exactly the kind of thing a future author re-litigates; and (d) binds every future refusal that must report a quantity — US-025's deactivate-a-person cascade being the next one queued. US-018 §8's own closing advice points here: *"if the team would rather it be held by a decision record than a standard, write it now rather than at the third application."* **Proposed: `ADR-009 — structured detail on an error body`, plus a paragraph in `api-standards.md`'s Errors section.** Note that `ADR-005` and `ADR-006` are referenced from `ai/` but have **no file in `knowledge/decisions/`** — confirm the next free number before minting |
| **§3.1 — the route shapes** | **No ADR, and not even a standards edit.** `api-standards.md:13-21` already decided it and names *"deactivating a desk"* as its own example. This story is the first application of a written rule. **Recording it again would be the second copy that rule exists to prevent** |
| **§5.3 — `updated_at` not set** | **No ADR.** A scoped consequence of one column's documented meaning. It belongs in the method docblock and the module README |
| **§6.2 — the residual race window** | **No ADR, but it must be *recorded*, and recorded where the next writer reads.** It is an accepted cost with a named closing fix, not a decision between designs. `modules/desks/README.md`, beside the new method, is where `api-standards.md:107-111`'s "let the index arbitrate" rule visibly does **not** apply — and saying *why* it does not apply here is the valuable half |
| **§8.2 — one dialog, not `ConfirmDialog`** | **No ADR.** Screen-private, Medium surface, and US-018 §6.1 already established the props-are-not-a-contract distinction for `screens/` |

### 9.1 Four consequential edits, US-013's device, each required by something that already exists

1. **`apps/api/src/modules/desks/README.md`** — **ADR-004 follow-up 2 makes this mandatory.** `:5-6` (*"US-019 (activate/deactivate) is its remaining one"*), `:60` and `:85` all speak in the future tense about this story and stop being true. Record: the `setDeskActive` write path, the **no `updated_at`** decision and why (§5.3), the new count method and why it is not `listUpcomingConfirmedDeskIds` (§5.1), and **§6.2's residual window with its named closing fix** — the last is the one a future reader most needs and least expects.
2. **`apps/api/src/modules/desks/desks.repository.ts:2-5`** — *"US-019 (activate/deactivate) is this module's remaining write path."* It lands here; the sentence becomes a record rather than a plan.
3. **`apps/api/src/modules/desks/desks.service.ts:36-38` and `:94-97`** — both anticipate this story by name (*"the same function US-019's deactivation block must call"*; *"the exact inverse of what US-019's deactivation block will need"*). Both predictions came true and both should say so rather than be deleted.
4. **`ai/standards/api-standards.md`** — the Errors section, **only if open item 1 resolves toward §4.4**. One paragraph saying that the three-key body is now three keys plus an optional, code-scoped `details`, pointing at ADR-009. **And `:13-21` gains nothing**: the verb rule's first application is not an amendment to it.

---

## 10. What this story must NOT build — the review instruction

Mirroring US-017 §7 and US-018 §7.

**Nobody's:**

- **No migration** (§0.2). No column, no index, no trigger, and specifically **no Postgres function for §6** — that is a protected-path diff (`task-surfaces.md:28`) and a STOP-and-ask (`task-classification.md:110`), to be discussed **before** this PR if at all.
- **No cancellation of anything, on any path.** AC-05 and BR-001.9. **A `bookings` write anywhere in `modules/desks` is a review finding**, and a "cancel them all and deactivate" action is the alternative the PO rejected on 2026-09-07 being reinstated.
- **No confirmation dialog on activation** (AC-09, SCR-006:174). Adding one for symmetry is undoing a decision.
- **No hand-written `'confirmed'` or `>= today`** anywhere in `modules/desks` (§2.2). The predicate is borrowed from `domain/booking-history.ts` or the block and SCR-006's column will drift.
- **No `Completed` in the block's filter** (§2.3). `completed` is not a stored value (ADR-007).
- **No client-supplied count, no `If-Match`-style precondition, no caching of the count between the check and the write** (§6.3). AC-08's own sentence forbids it and `modules/desks/README.md:71-77` forbids it by name.
- **No `updated_at`** in `setDeskActive` (§5.3) unless open item 4 says otherwise — and if it does, the migration comment and two READMEs change with it.
- **No `23505` mapping in `setDeskActive`** (§5.2). It cannot fire, and an unreachable branch is a claim a reader must disprove.
- **No change to `apps/api/src/modules/bookings/**`** — AC-02 is already built (§2.4) and **a diff there is a review finding**. `bookings.repository.ts:156`'s `.eq('is_active', true)` is US-006/AC-04 and must not be touched.
- **No change to `apps/api/src/http/middleware/**` or `http/app.ts`** (§3.6). AC-12 is inherited.
- **No delete.** `0002_desks.sql:16-18`, SCR-006:175, US-016/AC-09.
- **No second shared-component diff.** Exactly one additive prop, on `Dialog` (§8.3). **`ConfirmDialog.tsx`, `ConfirmDialog.spec.tsx`, `Alert`, `Button`, `Toast`, `TextField`, `StatusChip` and `EmptyState` are all untouched, and a diff to any of them is a review finding.**
- **No route.** `apps/ui/src/routes.tsx` is not modified; AC-06 navigates to an address that already exists (§8.5).
- **No refetch of the desk list after a state change** (§8.6).
- **No `PATCH` body carrying `isActive`** (§3.1). `deskUpdateSchema` is not modified, and `desks.ts:138-141` explains why in advance.
- **No change to `data-refresh.ts`, `eslint.config.mjs`, `composition.ts`, `apps/api/src/domain/*.ts`, or `inception/design/tokens.css`.**

---

## 11. Test placement per AC

QA's own flags are the organising constraints: **AC-04 and AC-05 together are the whole of BR-001.9**, **AC-08 is a race**, **AC-09 is a negative protecting a deliberate asymmetry**, and **AC-02 needs a server-side booking attempt**.

| AC | Proven where | Level |
| --- | --- | --- |
| **AC-01** | `desks.repository.spec.ts` — the recorded write is exactly `.update({ is_active: false }).eq('id', id)`, **naming no `updated_at`** (§5.3) and keying on `id`; `desks.service.spec.ts` — `{ kind:'ok', desk:{ isActive:false } }`; `admin.routes.spec.ts` — `200` with `{ id, deskNumber, isActive }` and **no `bookedAhead`**; and the availability half as a **regression assertion**: `bookings.repository.spec.ts`'s existing `listActiveDesks` `.eq('is_active', true)` test stays green and unedited | **repository + service + route** |
| **AC-02** | **`admin.routes.spec.ts` / `bookings.routes.spec.ts` — deactivate a desk, then `POST /api/bookings` naming it, and assert `422 desk_inactive` through `errorBodySchema`.** The story's QA note (`:114`) asks for exactly this. **No production diff; the test is the whole of the deliverable** (§2.4) | **route, end to end across two modules** |
| **AC-03** | `DeskDeactivateDialog.spec.tsx` — ST-05 renders the frame-verified title and **the history sentence**, with `Deactivate` / `Keep it active` (§8.4) | **component** |
| **AC-04** | `desks.service.spec.ts` — a desk with 3 upcoming returns `{ kind:'blocked', upcomingBookings: 3 }` **and `setDeskActive` is never called** (`expect(setDeskActive).not.toHaveBeenCalled()` — the "nothing changed" half); `admin.routes.spec.ts` — `422 desk_has_upcoming_bookings` **carrying the count in the agreed place** (§4), asserted on the raw body, not just the parsed one; `deactivate-desk.spec.ts` — the `422` maps to `{ kind:'blocked', upcomingBookings: 3 }`, **and a `422` with a missing or zero count maps to `failed`** (§7.3); `DeskDeactivateDialog.spec.tsx` — ST-06 renders **3** in the body **and in the button label** | **service + route + lib + component** |
| **AC-05** | `desks.service.spec.ts` — a blocked attempt produces **exactly one** repository interaction (the count) **and nothing else**; plus the **structural statement in the PR**: `DesksServiceDeps` has no `bookings` write and cannot acquire one without a visible constructor change (§2.1). `DeskDeactivateDialog.spec.tsx` — ST-06's footer contains **exactly two** controls and **no control whose label mentions cancelling**. The QA note (`:111`) asks for the stronger version: **assert the bookings are untouched after a blocked attempt** | **service + component + a stated structural fact** |
| **AC-06** | `DeskDeactivateDialog.spec.tsx` — the primary action's `href` is `/admin/bookings?from=<office.today>&status=confirmed&deskId=<id>`, built by `toQueryString` (§8.5); `filters.spec.ts`'s existing `parseFilters` round-trip stays green. **The cross-screen journey is US-014/AC-08's own e2e-flagged test** (`US-014:100`) and belongs there, not duplicated here | **component + an existing contract test** |
| **AC-07** | `desks.service.spec.ts` — the same desk id: first call with count 3 → `blocked`; second call with count 0 → `ok`. **The assertion is that nothing is cached between them**, which is what AC-07 actually is | **service** |
| **AC-08** | `desks.service.spec.ts` — **the count is read AFTER the request begins and BEFORE the write**: a repository fake that returns 0 on the first call and is then asserted to have been called *in this request* (not seeded from a prop); `admin.routes.spec.ts` — a request whose fake counts 3 gets the `422` **even though nothing in the request body or params mentions a count** (there is no body — §3.2 — which is itself the proof the server is the rule); `Desks.spec.tsx` — **the browser-side race**: a row rendered with `bookedAhead: 0` whose fetcher answers `blocked` shows **ST-06 with the server's count**, not ST-05 and not "0 people" (§4.5, option E) | **service + route + screen** |
| **AC-09** | `Desks.spec.tsx` — clicking **Activate** issues the request **with no dialog rendered at any point** (`expect(screen.queryByRole('dialog')).toBeNull()` before and after); `desks.service.spec.ts` — `activateDesk` makes **no** `countUpcomingConfirmedForDesk` call (**the absence is the AC** — §5.4) | **screen + service** |
| **AC-10** | `use-desks.spec.ts` — `markStateChanged` flips `isActive` **without re-sorting**, and **sets `bookedAhead` to 0 on deactivation only** (§8.6); `Desks.spec.tsx` — the row keeps its DOM position (assert by index among `[data-desk-row]`), its chip changes, the summary line's counts change, and the toast states the frame-verified string | **hook + screen** |
| **AC-11** | `deactivate-desk.spec.ts` — a `500`, an `unavailable`, an unparseable body **and a `404`** all map to `failed`, and **only** `desk_has_upcoming_bookings`-with-a-valid-count maps to `blocked`; `DeskDeactivateDialog.spec.tsx` — ST-08 keeps the dialog open, renders the danger `Alert`, changes the dismissal to **Close** and the confirm to **Try again**, and **the desk is unchanged** (`markStateChanged` never called) | **lib + component** |
| **AC-12** | `admin.routes.spec.ts` — an **Employee** session `POST`ing both `/deactivate` and `/activate` gets **403**, reaching the real mount (`http/app.ts:78`); no token gets `401`. Extend the existing admin-guard describe, whose `appWith` already threads a real session | **route** |

**Four mechanical notes that cost time if they are discovered in CI instead of here:**

1. **`admin.routes.spec.ts`'s `noDesks` base object gains two throwing stubs** (`deactivateDesk`, `activateDesk`), matching `insertDesk`'s existing shape. US-018 §10 note 1 established that this is **one** edit, not four, because every other site spreads or passes `noDesks`. Do not over-prepare.
2. **`{ count: 'exact', head: true }` is new to this codebase.** `admin-bookings.repository.ts:144` uses `count: 'exact'` without `head`, so the supabase test fake may not record `head` and may not return `count` for a head request. **Check the fake before writing the repository test**; it is a ten-minute fix discovered early and a confusing red check discovered late.
3. **`DeskInventoryRow.spec.tsx`'s surviving US-016 forcing test is removed by this story, and its citation must not vanish silently.** US-018 split that test and kept `US-016/AC-08` on the toggle half; US-019 makes that half false too. **Replace it with a positive test that the toggle is enabled and calls `onToggleActive`, and keep a `US-016/AC-08` citation on an assertion that still holds** (the control is present and labelled at every width — SCR-006:61-71). Then **that file's path must be in US-019's manifest `tests[]`** once it carries a literal `US-019`, which is the rule that produced the mystery red check in `dfbc9a2`.
4. **`aidlc-check` reads literal `US-0NN` strings in test files.** Every new spec citing `US-019/AC-##` needs its path in US-019's manifest `tests[]`, and `copy.spec.ts` / `use-desks.spec.ts` will carry both `US-018` and `US-019` citations once extended — both manifests need the path.

**Data setup**, the story's QA note taken literally (`:115`): a desk with **no upcoming bookings** (ST-05's precondition and the frames' A-02); one with **3** (B-03); one whose bookings are **all past** (proving §2.3 — it must deactivate cleanly); **one inactive desk** (C-05, for AC-09); and **an office where every desk is inactive** (the edge case at `:99` — the employee screen must reach US-006/AC-09's *no-desks-exist* state, not the fully-booked one). Mine to add: **a desk whose held `bookedAhead` is stale-high** — the only fixture that proves §8.6's `bookedAhead: 0` correction rather than an in-place flip.

---

## 12. Open items carried out of this note

| # | Item | Owner | Blocks |
| --- | --- | --- | --- |
| **1** | **§4 — how the blocking count reaches the client. THIS IS THE STOP.** Recommendation: **an optional, code-scoped `details` object on `errorBodySchema`**, typed by `deskBlockedDetailsSchema` in `desks.ts`, emitted only where present so every other error body stays byte-identical. It amends a rule written as an absolute in three places, which is why it carries an ADR (§9). The named fallback — **refetch `GET /api/admin/desks` on the 422** — needs **no contract change and no ADR**, costs a round trip and an unnumbered state, and can itself return 0. Option C′ (raw-body passthrough, no shared-schema change) is the close second. **Confirm or overrule before the contract is written** | **Joy Joshua + DEV** | `libs/contracts/src/error.ts`, `http/errors.ts`, `api-client.ts`, `lib/deactivate-desk.ts`, the route, and ADR-009 |
| **2** | **§8.6 — who corrects `bookedAhead` after a deactivation.** Recommendation: **the browser**, in `markStateChanged`, because the server's success *is* the measurement and frame `215:2872` draws the em dash. Alternative: the deactivate route alone returns the full `AdminDesk` with `bookedAhead: 0`, at the cost of two sibling endpoints returning two shapes. Either is defensible; leaving it uncorrected is not | **Joy Joshua** | nothing structural; a visibly contradictory row if neither is done |
| **3** | **§6.2 — the residual race window is an accepted cost, and accepting it is yours.** There is no transaction; a booking can land between the count and the write. The damage is recoverable (nothing is cancelled) and self-revealing (an Inactive row with a non-zero count). The only real fix is a Postgres function, i.e. a migration in a protected path. **Recommendation: accept, record it in the module README, do not open a migration in this PR** | **Joy Joshua** | nothing in code; a property the PR should state rather than imply |
| **4** | **§5.3 — `updated_at` on a state change.** Recommendation: **do not set it**; `0002_desks.sql:21-22` scopes the column to REQ-016 in writing. If you prefer it to mean last-modified generally, the migration comment, `desks.repository.ts:76-81` and `modules/desks/README.md:35-37` change with it — widening the behaviour and leaving the comment is the one option to avoid | **Joy Joshua** | nothing; a column that would quietly stop meaning what it says |
| **5** | **§8.4 — three strings no approved artifact carries, and one AC gap.** (a) ST-06's **singulars** — every frame draws `3`; `1 person has…` / `See that 1 booking` recommended. (b) The **activation-failure copy and its placement** — SCR-006:140 points at ST-08's error region, which does not exist when there is no dialog (AC-09); a page-level `Alert` recommended, and SCR-006:235-238 confirms nothing is drawn. (c) **No AC covers an activation failure** — AC-11 is deactivation-only, so it cannot be proven under this gate. (a) and (b) are `/ux`'s; **(c) is a `change-request` for `/ba`**, the route US-017 §1.1 used for its own uncovered control | **`/ux` + `/ba`** | (c) blocks nothing today and leaves one built behaviour unprovable |
| **6** | **§8.5 — `toQueryString` imported from `screens/all-bookings/filters.ts` into `screens/desks/`, the first cross-screen-folder import in `apps/ui`.** Recommendation: **leave it** — `filters.ts` is pure, React-free and already the shared vocabulary US-014 built it to be. If you would rather it sat in `lib/`, it is a one-file move with no behaviour change, and this is the natural PR for it | **Joy Joshua** | nothing |
| **7** | **§9 — confirm the ADR number before minting.** `knowledge/decisions/` holds 001–004, 007, 008; **`ADR-005` and `ADR-006` are referenced from `ai/gates/delivery.md` and elsewhere but have no file**. `ADR-009` is the next free number on the evidence I have, but the gap wants a look | DEV | ADR-009's filename |

---

**Two things outside the note, briefly.** First, the item I would spot-check is **§4.3** — the `errorBodySchema`-strips-unknown-keys trap has no error message on either side of the wire, and it will pass every server test while delivering `undefined` to the one dialog this story exists for. Second, **§5.3 (`updated_at`) is the defect most likely to actually ship**, and for an unusual reason: it will be introduced by a developer *correctly remembering* US-018's design note, where setting it was the thing most likely to be forgotten. The two stories are adjacent, the column is the same, and the right answer is the opposite one.
