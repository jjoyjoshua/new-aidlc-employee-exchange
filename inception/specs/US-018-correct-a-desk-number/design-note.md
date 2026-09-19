# US-018 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-018 — Correct a desk number](../../stories/user-stories/US-018-correct-a-desk-number.md) |
| **Screen**   | [SCR-007](../../design/screens/SCR-007-desk-form.md) **ST-02** (the one state US-017 did not build), reusing **ST-03, ST-04, ST-05, ST-07** unchanged, over [SCR-006](../../design/screens/SCR-006-desks.md) ST-01. **ST-06 is the edit-variant toast** (`SCR-007:89`) |
| **Tier**     | Complex — a **new write operation** (`PATCH`), a **new request + response schema pair** in a protected path, and **one additive prop on a shared component** that `SCR-007:114` forces (§0) |
| **Author**   | Architect persona (AI draft), 2026-09-19                                 |
| **Rests on** | [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md), [ADR-004](../../../knowledge/decisions/ADR-004-table-ownership.md), and the [US-016](../US-016-see-the-desk-inventory/design-note.md) and [US-017](../US-017-add-a-desk/design-note.md) design notes. **No new ADR** (§8). US-017 open item 4 already bound the route question; §3.1 answers the verb |
| **Verified against** | the live Figma frame `HF / SCR-007 · Desk form / ST-02 Edit — default · 1280` (node `225:369`), pulled via the Figma MCP server and confirmed against the written spec: title **Edit desk A-01**, field prefilled and focused, helper unchanged, a `warning`-tone `Alert` **below the helper** reading exactly *"3 people have this desk booked. Renaming it changes what they see — they won't be told."* (no Title line, no actions), **no status radio**, footer **Cancel** / **Save changes**. Three copy strings ST-02 does *not* draw are named in §6.4 and routed rather than invented |

**Advisory.** The human's GitHub review is the authority. `decisions.md` in this package stays DEV's.

The story hands `/architect` the same sentence US-017 got (`:100`): *"Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet."* §3 is the answer. Unlike US-017, **there is no STOP**: this story's text and its screen agree on every point, including the one #49 is about.

**The verdict, in one line each:**

- **No migration, and the US-017 finding holds for `UPDATE` for a reason worth stating rather than assuming.** `desks_desk_number_format` (`0002_desks.sql:30`) is a **table CHECK**, and a table CHECK is evaluated on every `INSERT` *and every `UPDATE`* of the row — it constrains the table's *contents*, not its insert path. So the "only upper-case is storable" property that makes the plain, case-sensitive `desks_desk_number_key` (`:35`) equal to case-normalised uniqueness is maintained by renames too, by construction (§2.1). **A migration in this PR is a review finding.**
- **AC-07 is not a database question, and that is the finding to read twice.** A plain `UPDATE … WHERE id = $2` does not self-collide, but the classic bug AC-07's QA note names (`:95`) lives in a **pre-check `SELECT`** — which finds the row itself. US-017 already forbade the pre-check for the *race*; the same decision buys AC-07 for free. **One decision, two ACs** (§2.3). The story's own API-impacts line asks for an exclusion (`:100`, *"excludes the desk itself from the uniqueness comparison"*) that describes a design this codebase does not use — the exclusion is structural, not a `WHERE` clause.
- **`PATCH /api/admin/desks/:id`. The codebase has no precedent either way, and I checked rather than assumed.** `router.(get|post|put|patch|delete)` across `apps/api/src` returns **12 matches, all `get` or `post`**; `method: '` across `apps/ui/src` returns only `'POST'`. But **every one of those POSTs is either a create at a collection or a verb sub-resource** (`/:id/cancel`, `/sign-in`, `/set-password`) — there is **no update-in-place anywhere**. So nothing is being broken; an absence is being filled, and the written standard points at the resource address (`api-standards.md:8-10`). `PATCH` over `PUT` because `PUT` would invite `isActive` into a body SCR-007:125 forbids (§3.1).
- **`200` with `adminDeskSchema.omit({ bookedAhead: true })`, and this is the one place I depart from US-017's symmetry.** US-017 could return `bookedAhead: 0` as a fact it knew for free; US-018 cannot. The narrower body is **exactly what the write naturally produces** (`.select('id, desk_number, is_active')` → `DeskRow`), and the wider one would need a second query to restate a number this operation provably cannot change (§3.3).
- **AC-04 needs no fresh server read, and the reason is an asymmetry with US-019 worth recording.** `bookedAhead` is already on the `AdminDesk` that `DeskInventoryRow` holds (`DeskInventoryRow.tsx:46-49`, `:93`). Nothing is *gated* on it — AC-03 permits the rename regardless (BR-001.19) — so a stale count cannot cause a wrong outcome. US-019/AC-08 says the opposite in its own words (*"the count is a prediction, the server is the rule"*) precisely because **it** blocks. **So the edit dialog has no loading state, no `useEffect`, and issues no request on open** (§4).
- **AC-06 is satisfied by construction, and it is checkable, not assumed.** `bookings` has **no `desk_number` column** — `0003_bookings.sql:27` is `desk_id uuid not null references desks (id)` — and all three read paths join live: `desks(desk_number)` at `admin-bookings.repository.ts:144` (US-013/US-014), `bookings.repository.ts:363` (US-010), `:188` (US-008), and the desk filter reads `desks` itself (§5). **The proof is that no code changes. The test is that a rename is observed from three places.**
- **`404 desk_not_found` is built, and it costs one line because the code already exists** (`error.ts:43-44`, minted by US-007/FR-04) and `notFound` is already imported (`admin.router.ts:20`). Desks are never deleted — confirmed three ways — but zero rows updated must answer *something*, and a 500 for a well-formed request naming a missing resource contradicts `api-standards.md:43` (§3.5). **The browser gets no state for it**: it folds to `failed`, because no approved copy exists (`api-standards.md:71-74`'s own rule).
- **One dialog with `mode`, one generalised hook — and the prop-vs-`mode` question does *not* cut the way US-017 §5.2 cut it.** `DeskFormDialog` is **screen-private** (`screens/desks/`), so its props are not `task-surfaces.md:61`'s Complex surface; that cost is what made US-017 reject a `mode` prop on `ConfirmDialog`. Say so, because a reviewer will expect the precedent to travel and it does not (§6.1).
- **The single most likely omission in the whole story is `updated_at`** (§2.4). `0002_desks.sql:21-23` makes it **application-maintained** and its comment names REQ-016 — *"when the desk was last renamed"* — so **this story is that column's first and only writer**, exactly as US-017 §2.3 predicted. No AC names it and nothing tests it today.
- **This story adds a write endpoint and zero new error codes, zero new rules, zero new components, and one shared-component prop.** That shape is worth stating in the PR.

§7's "must NOT build" list is as load-bearing as everything above it. The thing most likely to ship wrong is in §2.4; the thing most likely to produce a mysterious red check is in §10, note 2.

---

## 0. The tiering — confirmed, for three independent reasons

**Complex.** Three surfaces, and one fewer than US-017 had — which is itself worth recording, because most of US-017's Complex weight was the `Dialog` extraction and that is now spent.

| Surface | What it is here |
| --- | --- |
| **Server — contract** | A **new write operation**, `PATCH /api/admin/desks/:id`. `task-surfaces.md:39-41` — *"a new route, or a new write operation (`POST/PUT/PATCH/DELETE`) on an existing one"* — Complex outright, regardless of diff size. The clause **names `PATCH` explicitly**, so this is not an interpretation |
| **Contract — protected path** | `libs/contracts/**` (`task-surfaces.md:25-27`) gains a request schema (`deskUpdateSchema`), a path-param schema (`deskIdParamsSchema`) and a response schema (`deskUpdateResponseSchema`). Two of the three are consumed by US-019 as well (§3.2) |
| **Browser — shared component** | **One additive prop on `TextField`** — `describedBy?: string`, forced by `SCR-007:114`'s requirement that ST-02's note be *associated with the field*. `task-surfaces.md:61` and `TextField.tsx:11` — *"**Props and events are a Complex surface.**"* §1.1 is the whole argument, including why the three cheaper alternatives fail |

### 0.1 The Medium carve-outs, worked through

`task-surfaces.md:85-94` names four. As with US-017, none is arguable:

- **`:89-90` — *"a new `GET` lookup endpoint following an existing read-only pattern"*.** This is a `PATCH`. The carve-out is explicitly read-only.
- **`:91-92` — *"adding a **nullable** column plus its optional request field… where the migration is additive only"*.** **No migration at all** (§2.1), and `deskNumber` is **required**. Fails both clauses, the same way US-017 did.
- **`:93` — *"a new pure rule function in `domain/`"*.** None is written. The rule is **reused unmodified** from `libs/contracts/src/desks.ts:95-101` — which is the point of `deskNumberSchema`'s own docblock (`:93`).
- **`:94` — *"a new screen folder under `apps/ui` that only composes existing shared components and tokens"*.** `screens/desks/` already exists (US-016), and §1.1 widens one shared component. Fails on both clauses, as US-016 §0.1 and US-017 §0.1 each did.

### 0.2 What it is *not*, and each absence is defended below

- **Not Persistence.** `desks` already has every column this story writes. `desk_number` is the target (`0002_desks.sql:15`), `updated_at` already exists and is already documented as application-maintained (`:21-23`). **No column, no index, no trigger, no migration** — §2.1 and §2.4. `supabase/migrations/**` is a protected path (`task-surfaces.md:28`) and a diff there is a review finding; `task-classification.md:110` makes it a STOP-and-ask rather than a delivery decision.
- **Not a trust boundary — but AC-09 is still this story's own AC.** No guard code is written: `requireAdmin` mounts once at `/api/admin` (`http/app.ts:78`), and `admin.router.ts:1-17` states the property this story consumes — *"Every future admin route inherits the same guard the same way."* On the client, the Edit button lives inside `DeskInventoryRow` → `Desks`, already behind `RequireRole role="admin"`. **`apps/api/src/http/middleware/**` and `http/app.ts` are untouched, and a diff to either is a review finding.** AC-09 still needs a test reaching the real mount with a real Employee session (§10).
- **Not a new error code.** Both codes this endpoint needs already exist: `desk_number_taken` (`error.ts:61-65`, minted by US-017) and `desk_not_found` (`:43-44`, minted by US-007/FR-04). `libs/contracts/src/error.ts` **is not modified** — which is unusual for a story adding a write endpoint and is worth one line in the PR.
- **Not a design-token change.** ST-02's note is `tone="warning"`, which `Alert` already consumes (`Alert.tsx:17`, `:30-35`), and every other role on the frame is already bound by `Dialog`, `TextField` and `Button`. **`inception/design/tokens.css` is a protected path (`task-surfaces.md:32`) and is not modified.**
- **Not a data-fetching-layer change.** `apps/ui/src/lib/data-refresh.ts` is `task-surfaces.md:62-63`'s Complex surface, set once for the whole app (REQ-036/ADR-008). US-016 kept this screen off it and US-017 did not subscribe it; **US-018 does not either.** The list stays true after a rename because §6.3 updates it in place.
- **Not a new route.** Settled by US-017 §4.3 and its open item 4, not re-argued here: *"US-018 adds no route either. It reuses this dialog in edit mode."* `apps/ui/src/routes.tsx` is **not modified**, and §7 repeats it because `SCR-007:9` still asks for `/admin/desks/:id/edit` in writing.
- **Not an `eslint.config.mjs` change.** `MAY_IMPORT.desks` is `[]`. The new repository method imports `infra/supabase` and nothing else.
- **Not a `composition.ts` change.** `createDesksService` already receives the repository (`composition.ts:108`) and the router already receives the service (`:117`). The new method rides the existing wiring — worth a line in the PR, because a reviewer will look for that diff and its absence is correct.
- **Not Dependency, not Operational, not Config.** No package, no env key, no scheduled work, no new asset.

---

## 1. What this story actually is

One `UPDATE`, one `mode` flag, and a warning the browser already has the number for.

| AC | Where it is answered |
| --- | --- |
| **AC-01** rename works; identity and history survive; the inventory reorders | §2.2 (the `UPDATE` targets `id`, never `desk_number` — which is *why* identity survives), §3.3 (the `200` body), §5 (history follows by FK), **§6.3** (the re-sort, which the zone-letter edge case `:79` makes mandatory rather than incidental) |
| **AC-02** same format + uniqueness rules as create, desk unchanged on refusal | **§2.1** (the index, unchanged), **§3.2** (`deskNumberSchema` reused verbatim — *not* re-stated), §2.3 (the "unchanged" half is structural: there is nothing to half-apply) |
| **AC-03** a booked desk can still be renamed | §2.2 — and the proof is an **absence**: no `bookedAhead` read precedes the update, no gate, no `422`. §7 makes building one a review finding, because US-019 sits right beside this story and its shape is the opposite |
| **AC-04** warned first, with the holder count | **§4** — no fresh read, no loading state, and the asymmetry with US-019/AC-08 is the whole argument. §1.1 is how the note is *associated*; §6.4 is its copy |
| **AC-05** nobody notified | **§7.3** — proven structurally (`DesksServiceDeps` at `desks.service.ts:14-18` has no notification dependency and could not send one) plus a service-level assertion, **not** by counting zero emails from a system that has no email. Its real value is forward, so it belongs in a docblock as well as a test |
| **AC-06** bookings follow by reference | **§5** — satisfied by construction, and §5 is the *check* rather than the assumption. No code changes; the test observes a rename from three places |
| **AC-07** renaming to the current number is not an error | **§2.3** — the section to read twice. Not a special case: a consequence of US-017's no-pre-check decision |
| **AC-08** save guarding and failure match the add path | **§6.2** — and *"match"* is why the hook is **generalised rather than duplicated**: the same synchronous `inFlight` ref (`use-add-desk-dialog.ts:33`, `:41`), not a second copy of it |
| **AC-09** admin only | Inherited on both sides (§0.2), proven at the real mount (§10) |

### 1.1 The one decision SCR-007 forces, and the three cheaper answers that fail

**`SCR-007:114` is categorical:** *"ST-02's upcoming-bookings note is **associated with the field**, so it is read as part of the control rather than as loose text nearby."*

That cannot be done with the components as they stand, and the reason is a hazard US-017 §5.4 already found and half-fixed. `TextField.tsx:41-46, :63-73`:

```tsx
const describedBy = [error ? messageId : undefined, helper ? helperId : undefined].filter(Boolean).join(' ') || undefined;
...
  aria-describedby={describedBy}
  {...rest}
```

`{...rest}` is **last** (`:72`), so a caller-supplied `aria-describedby` silently **overwrites** the composed one — dropping the error *and* helper associations. And `messageId`/`helperId` come from an internal `useId()` (`:42-44`), so the caller cannot compose them.

**Recommendation: one additive prop on `TextField` — `describedBy?: string | undefined`, folded into the existing composed list at `:46`, never replacing it.** The screen wraps ST-02's `Alert` in a `<div id={noteId}>` it owns and passes `noteId`. **`Alert` gains nothing.**

Pair it with **`live="off"` on that `Alert`**, which is not a concession but the component's own stated rule (`Alert.tsx:7-10`): *"Callers that render an alert on page load rather than in response to an action should pass `live="off"` — announcing something that was always there is noise."* ST-02's note is present on open. So: **do not announce it as news; do read it as part of the control.** Those two halves are coherent precisely because the association replaces the announcement.

| Cheaper alternative | Why it fails |
| --- | --- |
| **Fold the note into `helper`** (`helper` is already `ReactNode`, so a fragment typechecks) | **Rejected on markup validity, and it is the tempting one.** `helper` renders inside a single `<p className="field__helper">` (`TextField.tsx:97-101`); an `Alert` is a `<div>` (`Alert.tsx:32`), and a `<div>` inside a `<p>` is invalid HTML that React will warn about and the parser will un-nest. It also loses the Alert's icon and tone, which are NFR-008's non-colour signalling, and it contradicts `SCR-007:130`'s explicit ordering decision — *field, helper, note* as three things |
| **Render the Alert loose, rely on `role="alert"` alone** | **Rejected.** It is neither associated nor (per `Alert.tsx:7-10`) appropriately announced, so a screen-reader user tabbing to the field may never encounter AC-04's warning — which is *the entire mitigation for RISK-012* (story QA note `:92`). An a11y regression in the one place the story says not to have one |
| **Give `Alert` an `id` prop and `TextField` a `describedBy` prop** | **Rejected as twice the cost.** Two Complex shared-component surfaces where one does the job; the screen-owned wrapper `<div>` needs no component change at all |
| **One additive `describedBy` on `TextField`** (recommended) | One prop, composed not replacing, on the component that already owns the ids. It also closes the `{...rest}` hazard for every future caller rather than only this one |

**This is a decision, not a STOP** — the evidence is one-sided and no approved artifact is contradicted. It is in the tiering table (§0) so the Complex classification is honest about it.

---

## 2. Uniqueness, normalisation, and the self-collision — the section to read twice

### 2.1 The US-017 finding holds for `UPDATE`, and the reason is stronger than "it probably still works"

US-017 §2.1 established that no migration is needed, and DEV verified it against the live file. The question this story must answer is whether that reading survives an `UPDATE`. **It does, and it is checkable rather than a judgement call.**

```sql
  desk_number  text        not null,                                              -- :15
  constraint desks_desk_number_format check (desk_number ~ '^[A-Z]-[0-9]{2}$')    -- :30
);
create unique index desks_desk_number_key on desks (desk_number);                 -- :35
```

`desks_desk_number_format` at `:30` is declared **inside the table body** — it is a **table constraint**, not an insert trigger. A table CHECK constrains the table's *contents*: Postgres evaluates it on every `INSERT` **and on every `UPDATE`** of the row. So the property US-017 relied on — *no lower-case value can ever be stored* — is an invariant of the table, not of one write path.

Which means the inference transfers verbatim: over the set of values the table can physically hold, a case-**sensitive** unique index and a case-**insensitive** one are the same index, because no pair of distinct stored values can differ only by case. **`desks_desk_number_key` *is* BR-001.8's case-normalised uniqueness for renames exactly as it is for inserts, by construction.**

The migration's own comment (`:25-29`) states the safety property this story inherits unchanged:

> *"It also means a normalization bug surfaces as a rejected write rather than as a desk nobody can book."*

If the rename path ever forgets to uppercase, the `UPDATE` fails loudly with a `23514` rather than creating `a-01` beside `A-01`. That is the same guard, and §2.4 is where it would fire.

So, precisely:

| | Enforced by |
| --- | --- |
| AC-02's format | `deskUpdateSchema` at the route edge (§3.2) — **and** `desks_desk_number_format` (`:30`) as defence in depth, now on the update path too |
| The upward normalisation | **the application, before the update** — `deskNumberSchema`'s `.transform` (`desks.ts:95-101`), reused unmodified |
| AC-02's case-normalised, whitespace-trimmed uniqueness | the trim in `normalizeDeskNumber` (`desks.ts:77-79`) plus **`desks_desk_number_key`** (`:35`), made sufficient by `:30` |
| **AC-07's self-collision** | **nothing — §2.3. It is not a case that needs handling** |

**Rejected alternatives** are US-017 §2.1's table, unchanged, and I will not restate it except for the one row a reviewer may now reach for:

| Option | Verdict |
| --- | --- |
| **A migration now that there are two write paths** (`citext`, a `lower(desk_number)` functional index) | **Rejected, and two write paths is not a new argument for it.** The CHECK's reach is the *table*, not the path count, so a second writer changes nothing about the inference. It remains a protected-path diff (`task-surfaces.md:28`) and a hard STOP-and-ask (`task-classification.md:110`) bought for nothing. If a reviewer still wants it, **that is a conversation to have before this PR, not inside it** |
| **Reusing the desk list the browser already holds to refuse a duplicate client-side** | **Rejected outright, and it is *more* tempting here than in US-017**, because the edit dialog genuinely holds the whole list. ADR-002:76-79 names this exact field: *"The browser may not evaluate business rules; it never has the data to do so correctly."* The list is a snapshot; a second admin's rename makes it wrong. **A duplicate check in `apps/ui` is a review finding** |

### 2.2 The update: no pre-check, `23505` is the arbiter, and the `WHERE` is `id`

```ts
// apps/api/src/modules/desks/desks.repository.ts — the module's second write

/**
 * US-018/AC-01, AC-02, AC-03, AC-07 (REQ-016, BR-001.4, BR-001.8, BR-001.19, V-08, V-16).
 * Renames one desk and returns the updated row, reports the duplicate, or reports that no row
 * matched. `deskNumber` arrives ALREADY normalised (`deskUpdateSchema` at the route edge) — this
 * method does not normalise and must not, or the rule would have two homes.
 *
 * The `WHERE` names `id`, NEVER `desk_number`. That is not a style preference: it is AC-01's
 * "the desk keeps its identity and its booking history", and AC-06's "a booking references the
 * desk, not the string". A rename keyed on the old string would be a different operation.
 *
 * `updated_at` IS named, and it is the only column besides `desk_number` that this write sets.
 * `0002_desks.sql:21-23` makes it application-maintained ("this schema has exactly one trigger
 * ... and it is not this") and its comment names REQ-016 — "when the desk was last renamed". This
 * method is that column's first and only writer, exactly as US-017 design note §2.3 predicted.
 * The timestamp comes from the SERVICE's single `nowMs()` reading, never from `now()` in SQL and
 * never from a second clock read.
 *
 * NO existence or uniqueness pre-check precedes this. `desks_desk_number_key` is the sole
 * arbiter, the discipline `insertDesk` (:44-65) and `insertConfirmedBooking` both state, and
 * `api-standards.md:93-97` makes a standard: "Where a unique index arbitrates, let it." A
 * `SELECT ... WHERE desk_number = $1 AND id <> $2` followed by an `UPDATE` is a read-then-write
 * window two concurrent admins can both pass — AND it is the implementation that breaks AC-07
 * (design note §2.3).
 *
 * Only a `23505` naming the ONE known index becomes an outcome; everything else throws, the
 * mapping contract `insertDesk` states for the same class of failure. A `23514` (the format
 * CHECK) is deliberately NOT mapped, for the same reason: reaching it means the normaliser or
 * the schema failed, and it must surface as a 500 rather than as a false "already taken".
 */
updateDeskNumber(id: string, deskNumber: string, updatedAt: Date): Promise<UpdateDeskOutcome>;
```

```ts
export type UpdateDeskOutcome =
  | { kind: 'ok'; desk: DeskRow }
  | { kind: 'duplicate' }
  /** US-018 design note §3.5. Zero rows matched `id`. Desks are never deleted, so this is not
   *  reachable from the screen — but a write that applied to nothing must answer something, and
   *  a 500 for a well-formed request naming a missing resource contradicts `api-standards.md:43`. */
  | { kind: 'not_found' };
```

```ts
async updateDeskNumber(id, deskNumber, updatedAt) {
  const { data, error } = await supabase()
    .from('desks')
    .update({ desk_number: deskNumber, updated_at: updatedAt.toISOString() })
    .eq('id', id)
    .select('id, desk_number, is_active')
    .maybeSingle();

  if (!error) return data ? { kind: 'ok', desk: data as DeskRow } : { kind: 'not_found' };
  if (error.code !== '23505') throw new Error(`desk update failed: ${error.message}`);
  if (error.message.includes('desks_desk_number_key')) return { kind: 'duplicate' };
  throw new Error(`unrecognised unique violation: ${error.message}`);
}
```

Four notes, each with a real failure behind it:

- **`.maybeSingle()`, not `.single()`.** `.single()` turns "zero rows" into a Postgres error (`PGRST116`), which would arrive on the `error` branch and be thrown as a 500 — losing §3.5's `404`. `.maybeSingle()` makes "no row" a **value**, which is what lets the outcome union carry it. This is the one line in the method that a reviewer should check against `admin-bookings.repository.ts:212`, `:223`, which already use `.maybeSingle()` for exactly this reason.
- **`.select(...)` on the update, not a second read.** One round trip, and it returns exactly the three columns `DeskRow` already declares (`desks.repository.ts:16-20`) — which is what makes §3.3's response shape free rather than manufactured.
- **`updatedAt` is a parameter, not a `new Date()` inside the method.** The service holds the clock (`DesksServiceDeps.nowMs`, `desks.service.ts:14-18`) and this codebase is consistent that a repository never reads one — `cancelAnyBooking` takes `new Date(now)` and `today` from its service (`admin-bookings.service.ts:122-125`) for the stated reason that two readings *"would differ only across office midnight."* Same discipline, one line.
- **The `error.message.includes(...)` guard is not ceremony.** It is what makes an unrecognised `23505` a 500 rather than a false "already taken" — the same branch `insertDesk` (`:101-102`) already has, for the same reason.

### 2.3 AC-07, and why it costs nothing — the section to read twice

**The question, stated precisely:** does `UPDATE desks SET desk_number = $1 WHERE id = $2` succeed when `$1` already equals the row's own stored value?

**Yes.** A unique index is violated by **two distinct live rows** sharing a value. An `UPDATE` produces a new version of *the same row* which supersedes its own prior version in the same command — the prior version is not a second row, so there is nothing for the new one to collide with. (Additionally, when no indexed column's value actually changes, Postgres may not touch the index at all.) `desks_desk_number_key` never fires.

**But the far more important half is that AC-07 does not depend on that.**

The bug AC-07's QA note names (`:95` — *"the classic self-collision bug in uniqueness checks on edit"*) is not a database behaviour. It is an **implementation**:

```ts
// The bug, written out so it is recognisable in review.
const existing = await selectByDeskNumber(deskNumber);
if (existing) return { kind: 'duplicate' };   // ← finds the row ITSELF. AC-07 fails.
await update(id, deskNumber);
```

That implementation refuses AC-07's no-op, and it is the reason the story's own API-impacts line (`:100`) asks for an endpoint *"that excludes the desk itself from the uniqueness comparison"* — the `and id <> $2` an author would add to patch it.

**This codebase does not use that implementation, and did not choose not to for AC-07's sake.** US-017 §2.3 rejected the pre-check because of the **race** (a read-then-write window two admins can both pass), a rejection `api-standards.md:93-97` has since promoted to a project standard. **AC-07 therefore comes for free from a decision already made for a different reason.** One decision, two ACs — and no `id <> $2` anywhere.

**The consequence for review, stated so it is actionable:** the implementation that satisfies AC-07 is the one with **no pre-check at all**. If a pre-check appears in this PR, it is simultaneously an AC-02 race bug and an AC-07 correctness bug, and the `and id <> $2` that would fix the second is *evidence of the first*. **A pre-check `SELECT` in `updateDeskNumber` is a review finding on two ACs at once.**

**The one place I would spend real effort: prove the Postgres semantic against Postgres.** This is precisely the class of assumption `bookings.repository.concurrency.spec.ts:1-12` exists for, in that file's own words:

> *"`bookings.repository.spec.ts` proves the mapping's LOGIC against a fake client that is **TOLD** what error Postgres produced. It cannot prove the assumption that logic depends on."*

AC-07 rests on exactly one Postgres semantic, and a fake client can only be *told* that no `23505` was raised — it cannot discover it. That file already establishes the convention (`RUN_BOOKINGS_CONCURRENCY_TEST=1`, skipped rather than failed when absent, so CI needs no database), and it already has a `createDesk` fixture (`:97-100`). **The marginal cost is one `it()` in an existing gated file.** US-017 §10 judged a gated test unnecessary for its own duplicate and I agree with that call; **this is a stronger case, because US-017's assertion was "the index fires" (which a violation demonstrates) and this one is "the index does *not* fire" (which only a real database can demonstrate).** Open item 2.

### 2.4 The one thing most likely to ship wrong

**It is `updated_at`.**

`0002_desks.sql:21-23`:

```sql
  -- REQ-016 — when the desk was last renamed. Application-maintained: this schema has exactly
  -- one trigger (db-design.md §3, "The one rule that needs a trigger") and it is not this.
  updated_at   timestamptz not null default now(),
```

The column's comment names **REQ-016**, which is US-018's own requirement. US-017 §2.3 said so in advance: *"No `updated_at` is set. The column defaults on insert. US-018's rename is what first has to set it explicitly, and that is US-018's problem."*

Why it will be missed:

- **No AC names it.** AC-01 says the desk "keeps its identity and its booking history"; nothing says "and records when it changed."
- **Nothing tests it today.** `desks.repository.spec.ts:181` asserts the *insert* names **no** timestamps — a correct assertion that reads, at a glance, like a house rule against writing them.
- **Every test passes without it.** The column is `not null default now()` and already holds a value, so omitting it produces no error, no warning and no failing assertion. The defect is a silently stale timestamp, discovered whenever something first reads it.

**So: assert the recorded update payload is exactly `{ desk_number, updated_at }`**, in a test titled for **US-018/AC-01** — legitimately, because REQ-016 is what AC-01 traces to and the timestamp is part of what the rename records. The pattern is already in the file: `desks.repository.spec.ts:195` and `:214` assert `calls[0]?.insert` equals `{ desk_number: 'A-07' }` exactly. One line, same shape.

**And do not reach for a trigger.** `0002_desks.sql:21-22` forecloses it in writing, and a trigger would be a migration in a protected path (§0.2).

---

## 3. The contract

### 3.1 The route and the verb — `PATCH /api/admin/desks/:id`

**This is open item 1 and it is answered, but the honest first sentence is that this codebase has no precedent either way — and I checked rather than reasoned from the shape of the routes I happened to remember.**

`router.(get|post|put|patch|delete)\(` across `apps/api/src` returns **twelve** matches. Every one is `get` or `post`:

```
admin.router.ts:58   get  /bookings          admin.router.ts:92   get  /desks
admin.router.ts:115  post /desks             admin.router.ts:134  post /bookings/:id/cancel
auth.router.ts:54    post /sign-in           auth.router.ts:119   post /sign-out
auth.router.ts:142   post /set-password      auth.router.ts:200   get  /session
bookings.router.ts:65  get  /                bookings.router.ts:84  get  /availability
bookings.router.ts:118 post /                bookings.router.ts:165 post /:id/cancel
```

`method: '` across `apps/ui/src` returns only `'POST'`. **There is no `PUT`, `PATCH` or `DELETE` anywhere in this repository, on either side.**

**But that is an absence of precedent, not a precedent against.** Every one of those six POSTs is one of exactly two things:

1. **A create at a collection address** — `POST /api/bookings`, `POST /api/admin/desks`.
2. **A verb sub-resource** — `/:id/cancel`, `/sign-in`, `/sign-out`, `/set-password`.

**Not one is an update-in-place**, and `POST /auth/set-password` — the nearest analogue, since it changes one attribute of an existing resource — is a **verb sub-resource at its own address**, not a `POST` chosen over `PATCH` at the resource's address. So nothing was ever decided here; US-018 is the first update-in-place and sets the convention.

**And the written standard points at the resource, not a verb.** `api-standards.md:8-10`:

> *"resources are plural nouns (`/api/bookings`, `/api/desks`). Actions become sub-resources **only when a noun genuinely doesn't fit** (`/api/internal/reminders/run`)"*

A **rename fits the noun** — it modifies the desk. **Cancel does not** — it is a transition, which is why `/:id/cancel` earns its sub-resource and why `admin.router.ts:103` says so in those words (*"`POST`, not `DELETE` — the row survives the transition"*). The standard's own test separates the two cases cleanly, and this story falls on the resource side of it.

**Recommendation: `PATCH /api/admin/desks/:id`.**

| Option | Verdict |
| --- | --- |
| **`PATCH /api/admin/desks/:id`** (recommended) | Semantically exact, and `task-surfaces.md:39` already names `PATCH` as a write verb this project expects — the standard anticipated it. Zero client-layer change: `api-client.ts:52-57` passes `init.method` straight to `fetch`, so `request(path, schema, { method: 'PATCH', body })` works unmodified, exactly as `add-desk.ts:25-28` does with `'POST'` |
| **`PUT /api/admin/desks/:id`** | **Rejected, and the reason is a guard rail rather than pedantry.** `PUT` means *replace the representation*. `AdminDesk` has four fields and this endpoint may accept **one**: `id` is server-minted (`0002_desks.sql:14`), `bookedAhead` is derived (`desks.ts:24-40`), and **`isActive` is explicitly not this screen's** — `SCR-007:125` is a structural decision with a named rejected alternative (*"Two screens controlling one attribute means two places to look"*), and US-018's own edge case `:80` says *"Only the desk **number** is editable."* A `PUT` taking one of four fields is a `PUT` in name only, and it **invites a future author to complete the representation by adding `isActive`** — which is US-019's flow with BR-001.9's whole blocked-deactivation rule attached. `PATCH`'s partial semantics make that addition look like what it would be: out of place |
| **`POST /api/admin/desks/:id/number`** (house verb-sub-resource style) | **Rejected, and this is the one I would not argue hardest about.** It is the most consistent-looking option, and if the team's instinct is "this codebase does GET and POST", it is defensible. Against it: `api-standards.md:9` restricts sub-resources to *"when a noun genuinely doesn't fit"*, and here one does; and it would make the *only* address in the API where a resource is modified an action endpoint, which is the shape the standard reserves for transitions. Named here so the choice is visible rather than assumed |
| **`POST /api/admin/desks/:id`** | **Rejected.** It carries `POST`'s create semantics at a resource address — the worst of both, and the one shape no reader can predict |

**The forward constraint, and it is the reason this decision is worth writing down: US-019 is `POST`, not `PATCH`.** Activate/deactivate is a **transition with its own refusal rule** — BR-001.9's hard block, US-019/AC-04, a `422` (`http/errors.ts:65-69`, whose docblock already names *"this desk has 3 upcoming bookings, so it can't be retired"* by example). That is `cancel`'s shape, not a rename's. So the line this story draws, in one sentence:

> **`PATCH /api/admin/<resource>/:id` modifies an attribute. `POST /api/admin/<resource>/:id/<verb>` performs a transition that a rule can refuse.**

Both halves will exist in `admin.router.ts` by the end of US-019, side by side, and the distinction is what stops the next author from picking by coin-flip. §8 routes it to `api-standards.md` rather than an ADR, and explains why.

**Route placement:** immediately after `router.post('/desks', …)` (`admin.router.ts:115-132`), keeping the desk routes contiguous. `requireActingAdmin` (`:40-46`) is **not** called — it exists for *attribution* (`cancelled_by`), and a rename records no actor. `desks.updated_at` is a timestamp, not an audit row.

### 3.2 The request — two new schemas, and one deliberate non-alias

```ts
// libs/contracts/src/desks.ts — US-018 adds the update side

/**
 * `PATCH /api/admin/desks/:id`'s path parameter (US-018/AC-01). One param, a uuid, `.strict()` —
 * the shape `cancelBookingParamsSchema` established and US-015 reused verbatim.
 *
 * NOT `cancelBookingParamsSchema` itself, although it is structurally identical: that schema's
 * name asserts the id is a booking's. A desk id validated by a booking's schema typechecks and
 * then misleads every future reader of both.
 *
 * US-019's activate/deactivate routes take the same parameter and reuse THIS schema.
 */
export const deskIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

/**
 * `PATCH /api/admin/desks/:id`'s one legitimate body (US-018/AC-01, AC-02). `.strict()` — an
 * unknown field is rejected, not ignored, matching every other request schema in this package.
 *
 * `deskNumberSchema` is REUSED, not restated — which is what its own docblock was written for
 * ("Exported on its own so a future edit request (US-018) reuses it rather than restating the
 * rule"). So AC-02's "the same format and uniqueness rules apply as on create" is true because
 * it is the SAME object, not because two copies agree today.
 *
 * NOT `export const deskUpdateSchema = deskCreateSchema`, although the two are structurally
 * identical right now. They are two contracts that happen to coincide, and the divergence is
 * already on the table rather than hypothetical: issue #49 may add a required `isActive` to
 * CREATE, which `SCR-007:125` forbids on EDIT ("Status choice on add, absent on edit"). An alias
 * would put a status field on this endpoint silently, the day that resolves.
 *
 * No `id` in the body: it is the path parameter, and accepting it in both places creates two
 * sources for one fact that can disagree.
 */
export const deskUpdateSchema = z.object({ deskNumber: deskNumberSchema }).strict();
export type DeskUpdateRequest = z.input<typeof deskUpdateSchema>;
```

**`z.input`, not `z.infer`** — with `deskNumberSchema`'s `.transform` in the chain the two differ and the browser builds the *input* shape. `DeskCreateRequest` (`desks.ts:115`) already makes this call; matching it is free and diverging from it would be a silent trap.

### 3.3 The response — `200` with `adminDeskSchema.omit({ bookedAhead: true })`

```ts
/**
 * `PATCH /api/admin/desks/:id`'s `200` body (US-018/AC-01).
 *
 * DERIVED from `adminDeskSchema` with `.omit`, never re-declared — so it cannot drift from the
 * shape `GET /api/admin/desks` returns (ADR-002's "two declarations are not a contract").
 *
 * `bookedAhead` is omitted deliberately, and this is the one place US-018 departs from US-017's
 * "a bare AdminDesk" symmetry. `POST /desks` could send `bookedAhead: 0` as a fact it knew for
 * free (the row was inserted microseconds ago). A rename cannot: the count is whatever it was,
 * the server has not read it, and AC-06 means this operation provably cannot change it — the
 * bookings reference `desks.id`, which the rename does not touch. Sending it would cost a second
 * query to restate an invariant, and echoing the request's value back would be the "echo a value
 * back only when the server may have changed it" error.
 *
 * What is left is exactly what the write produces: `.select('id, desk_number, is_active')`, i.e.
 * `DeskRow`. Nothing is manufactured at any layer.
 */
export const deskUpdateResponseSchema = adminDeskSchema.omit({ bookedAhead: true });
export type DeskUpdateResponse = z.infer<typeof deskUpdateResponseSchema>;
```

```ts
res.status(200).json(outcome.desk);   // { id, deskNumber, isActive }
```

**Why `200` and not `204`.** `api-standards.md:39` reserves `204` for *"a state-changing request succeeded and has nothing to say"*, and elaborates (`:55-57`) that it is for an endpoint *"whose entire value is that it never fails."* This one has something to say: the browser needs the **server's** normalised `deskNumber` to re-sort the list (AC-01's *"the inventory reorders accordingly"*). The browser computed the same string locally to validate — but §2.4's whole discipline is that the server's value is the stored one, and a screen that re-sorts on its own guess is a screen that can disagree with the database.

**Why not `201`.** Nothing is created.

**Why not the full `AdminDesk`.** Three ways to fill `bookedAhead`, and two are wrong:

| Option | Verdict |
| --- | --- |
| **Recompute it** (a new `countUpcomingConfirmedForDesk` repository method, or a second `listUpcomingConfirmedDeskIds` call) | **Rejected.** A fourth interface method and a second query per rename, to produce a number AC-06 guarantees is unchanged. `listUpcomingConfirmedDeskIds` also returns ids for the *whole table* (`desks.repository.ts:81-90`) — up to ~3,100 uuids, per its own bound at `:38-42` — to count one desk |
| **Echo the request's or the browser's value** | **Rejected outright.** The server would put a number on the wire that it never read, presented as a server fact |
| **Omit it; the browser keeps the count it already has** (recommended) | Honest at every layer. The browser is already authoritative for `bookedAhead` (it read it from `GET /desks` and nothing since has changed it), and §6.3's `markRenamed` merges rather than replaces — which is *more* correct than a replace, because it cannot clobber the displayed count with a manufactured one |

**`adminDeskSchema` and `adminDesksResponseSchema` are not modified** (`desks.ts:15-42`, `:51-55`). **`Cache-Control` is not set**, for the reason `admin.router.ts:128` already doesn't on the `201`.

### 3.4 The duplicate — `409 desk_number_taken`, reused, not minted

```ts
if (outcome.kind === 'duplicate') {
  throw conflict(ERROR_CODES.desk_number_taken, 'That desk number is already in use.');
}
```

**Byte-identical to `admin.router.ts:125`.** `conflict()`'s docblock already claims this case by requirement id (`http/errors.ts:56-63`): *"the value is taken (V-04, V-05, **V-08**, V-10)"*, and V-08 is this story's rule as much as US-017's — the story traces to it (`:8`).

**`error.ts` is not modified.** `desk_number_taken`'s own comment (`error.ts:61-64`) already covers the rename case without amendment: *"The number is already held by a desk, ACTIVE OR INACTIVE: there is no delete, so a deactivated desk still holds its number."* That is the collision a rename hits, described in advance.

**Not `422`.** A taken value is a collision that a different value resolves — `api-standards.md:59-61`'s own split. `422` is US-019's (*"this desk has 3 upcoming bookings, so it can't be retired"*, quoted in `http/errors.ts:67`).

**One code, not two.** AC-02's case-normalised and whitespace-trimmed collisions are the **same** collision after normalisation; the server holds only the normalised value and cannot distinguish them, and §6.4 shows the browser can and does.

### 3.5 The not-found — build it, and it costs one line

**This is open item 3, and the answer is: build the `404`.**

**First, the premise is true: desks are never deleted.** Three independent confirmations, not one:

- `0002_desks.sql:16-18` — *"Deactivating is reversible and **never deletes** (db-design.md §4)."*
- US-019 edge case `:97` — *"An inactive desk keeps its number reserved — **there is no delete**, so the number is never released (US-016/AC-09)."*
- **No `DELETE` route exists anywhere.** `router.delete(` returns zero matches across `apps/api/src` (the twelve-route list in §3.1 is exhaustive).

**But "unreachable from the screen" is not "needs no branch", and this is where I differ from the cheap answer.** The `UPDATE … .eq('id', id)` can match zero rows for reasons that have nothing to do with deletion: a **well-formed uuid that names nothing**, from a non-browser caller, a hand-rolled `curl`, or a future integration. The repository must answer *something* in that case, and there are exactly two honest options:

| Option | Verdict |
| --- | --- |
| **Throw → `500`** | **Rejected.** A well-formed, authorized request naming a resource that does not exist is not a server defect, and `api-standards.md:43` already assigns it a status: *"`404` — No such desk, booking or account."* A 500 here would also be indistinguishable in logs from a real defect, which is the split `api-standards.md:49-53` exists to protect |
| **`404 desk_not_found`** (recommended) | Correct by the project's own table, and **the marginal cost is one line**: the code already exists (`error.ts:43-44`), `notFound` is already imported (`admin.router.ts:20`), and the branch mirrors `admin.router.ts:149-153` exactly. **Zero new codes, zero new imports** |

```ts
if (outcome.kind === 'not_found') {
  throw notFound(ERROR_CODES.desk_not_found, 'That desk could not be found.');
}
```

**No enumeration concern, and `api-standards.md:63-75` requires me to say which branch of its rule applies rather than assume.** It applies the *permissive* way: there is **no ownership boundary** here — an administrator can already read every desk's existence via `GET /api/admin/desks` — so a distinguishable `404` discloses nothing the caller could not already see. That is the same test US-015 applied and reached the same conclusion on (`:69-73`).

**The browser gets no state for it.** `RenameDeskOutcome` has **three** kinds, not four: a `404` folds into `failed` (ST-07). Two reasons:

1. **No approved copy exists for "that desk is gone."** SCR-007 numbers seven states and none is it. Inventing copy is a Gate 1 act, which is the rule US-016 §6.1 and US-017 §1.1 both applied.
2. **`api-standards.md:71-74` already names this as a *scope* decision rather than a security one**, in US-015's voice: *"no approved copy or error code exists for a distinct 'no longer cancellable' outcome, so both causes answer `404` there too."* Same move, same reasoning.

**So: the endpoint has the `404`; the screen does not have a state for it.** Both halves are deliberate and a reviewer should see both.

### 3.6 The three outcomes the browser needs

```ts
// apps/ui/src/lib/rename-desk.ts — `add-desk.ts:13-21`'s shape, unchanged

export type RenameDeskOutcome =
  | { kind: 'ok'; desk: DeskUpdateResponse }
  /** US-018/AC-02 — 409 `desk_number_taken`. The ONE refusal with copy of its own (SCR-007 ST-04). */
  | { kind: 'duplicate' }
  /** US-018/AC-08 — transport failure, timeout, 5xx, an unparseable body, a 400 the browser's own
   *  validation should have caught, OR a 404 (design note §3.5: the endpoint distinguishes it, the
   *  screen has no approved copy for it). `api-client.ts:71` folds 5xx and `:84` an unrecognisable
   *  error body into `unavailable`, so all of them arrive here as one — which is ST-07's own
   *  "server error, timeout or lost connection". */
  | { kind: 'failed' };
export type RenameDeskFetcher = (id: string, deskNumber: string) => Promise<RenameDeskOutcome>;

export function createRenameDesk(api: ApiClient): RenameDeskFetcher {
  return async (id, deskNumber) => {
    const result = await api.request(`/api/admin/desks/${id}`, deskUpdateResponseSchema, {
      method: 'PATCH',
      body: { deskNumber },
    });
    if (result.kind === 'ok') return { kind: 'ok', desk: result.data };
    if (result.kind === 'error' && result.code === ERROR_CODES.desk_number_taken) return { kind: 'duplicate' };
    return { kind: 'failed' };
  };
}
```

**A separate file from `add-desk.ts`, not a second export inside it.** `cancel-booking.ts:57, :68` holds two exports and is the apparent precedent — but those two are **the same operation on two mounts** (an employee's cancel and an admin's). Add and rename are two operations on two endpoints with two methods. Beside `add-desk.ts`, in `lib/`, where this codebase puts its `ApiClient`-to-outcome adapters.

---

## 4. AC-04's holder count — no fresh read, and the reason is an asymmetry with US-019

**This is open item 4, and it materially changes the dialog, so the reasoning is worth the space.**

**Recommendation: the `bookedAhead` already on the `AdminDesk` is sufficient. The edit dialog issues no request on open, has no loading state, and renders ST-02 complete on its first paint.**

Four reasons, and the second is the one that decides it:

1. **The number is already in hand at the moment of the click, with zero plumbing.** `DeskInventoryRow` receives the whole desk (`DeskInventoryRow.tsx:46-49`) and already renders the count (`:93`, `:107`). The **Edit** button is inside that component (`:55-58`). So the value travels from the row to the dialog as one argument.

2. **Nothing is gated on it, and US-019 says the opposite about its own count in its own words.** US-019/AC-08: *"the count is a prediction, the server is the rule"* — because US-019/AC-04 **refuses** the deactivation when the count is non-zero, so a stale prediction there would show a success path that the server then blocks. **US-018/AC-03 is the exact inverse: the rename is *permitted* regardless** (*"the change is permitted — not blocked"*, BR-001.19). A stale count here cannot produce a wrong outcome, only a warning that is off by one. **That asymmetry is the whole answer**, and it is why US-019 will need a server-side recount and this story must not build one.

3. **The frames draw it that way, which is stronger than a sentence.** SCR-007:65 calls it *"a **persistent** inline note"*, and the verified ST-02 frame (node `225:369`) shows the field prefilled and focused **with the note already present**. SCR-007 numbers seven states and **there is no state for "loading the warning."** A dialog that opened empty and filled in a moment later would be an eighth state nobody drew.

4. **AC-04's own wording asks for the fact, not a fresh measurement.** *"it states how many people hold that desk **and** that they will not be told, **before the change can be saved**."* The `and` clause is the mitigation; the count is what makes it concrete.

**The honest cost, stated rather than buried:** if a booking lands between the list load and the Edit click, the note says *3* when the truth is *4*. RISK-012 is already accepted on exactly this ground (story edge case `:77` — *"The accepted cost, restated so it is not re-litigated in code review"*), and AC-04's mitigation — *people hold this desk and will not be told* — does not change in kind between 3 and 4.

**What follows from this, and it is the point:**

- `DeskFormDialog` in edit mode has **no `useEffect`, no loading state, no second fetcher, and no async work on open.** It stays a pure render over props.
- `useDesks` needs no re-fetch on dialog open, so `Desks.tsx:67-70`'s `retryKey` device stays exactly what it is (ST-04's **Try again** and nothing else) — the same boundary US-017 §6.5 drew.
- The dialog's subject is the `AdminDesk` itself, which is what makes §6.2's generalised hook natural: `use-admin-cancel-dialog.ts`'s shape is *"a state object holding **the subject** plus `busy` plus an `outcome`"*, and here the subject is a desk.

**If a reviewer wants a fresh count**, the cheap version is *not* a new endpoint: `GET /api/admin/desks` already returns every desk with `bookedAhead` (`admin.router.ts:92-100`), so a re-fetch on open would be one existing call. I still recommend against it — it would blank nothing but it would add a state SCR-007 does not number, to improve a number nothing depends on.

---

## 5. AC-06 is satisfied by construction — here is the check, not the assumption

**AC-06 is the AC the story most wants tested and the one that requires the least code: zero.** The task asked me to confirm whether the bookings copy the desk-number string at booking time or join it live. **They join live, everywhere, and there is no string to copy.**

**The schema makes it structural.** `0003_bookings.sql:27`:

```sql
  desk_id  uuid  not null references desks (id)  on delete restrict,
```

**`bookings` has no `desk_number` column.** A grep for `desk_number` across `apps/api/src` returns matches only in `desks`-facing code and in test fixtures — never in a `bookings` insert or column list.

**All three read paths AC-06 names resolve the number live:**

| Where AC-06 says to look | How it gets the number |
| --- | --- |
| **The employee's own list (US-010)** | `bookings.repository.ts:363` — `.select('id, booking_date, status, desks(desk_number)')`. A join, evaluated at read time |
| **The administrator's list (US-013/US-014)** | `admin-bookings.repository.ts:144` — `.select('id, booking_date, status, desks(desk_number), user_profiles!user_id(full_name)', { count: 'exact' })`, mapped at `admin-bookings.service.ts:91` (`deskNumber: row.desk_number`). And `admin-bookings.repository.spec.ts:348` pins that select string as *"byte-identical to US-013's"*, so a drift to a denormalised copy would fail an existing test |
| **The desk filter (US-014/AC-03)** | `desks.repository.ts:71-79` — reads `desks` itself. The filter's vocabulary *is* the desks table |
| *(also)* **US-008's last-booked desk** | `bookings.repository.ts:188` — `.select('id, desk_id, desks(desk_number)')`. Same join |

**The `desk_id` filter is an id, not a string.** `admin-bookings.repository.spec.ts:305, :315` — `.eq('desk_id', deskId)`. So US-014's filter keeps working across a rename without a cache to invalidate.

**Therefore:**

- **No code changes for AC-06.** Not the repositories, not the services, not the contracts.
- **The proof is that the diff is empty, and a test is still required**, because AC-06's value is a *regression guard* for a denormalisation nobody has written yet. QA's note (`:94`) says it exactly right: *"AC-06 is the one that catches a desk number stored on the booking instead of a reference. Rename, then read the booking from three places."* §10 places it.
- **The one thing that would break it** is a future author adding a `bookings.desk_number` column "for query performance". `bookings_desk_id_booking_date_idx` (`0003_bookings.sql:79`) already serves that access path, and §7 names the denormalisation as forbidden.

---

## 6. The browser

### 6.1 One dialog with `mode`, one generalised hook

**This is open item 6.** **Recommendation: extend `DeskFormDialog` with `mode: 'add' | 'edit'`, and generalise `use-add-desk-dialog.ts` into one `use-desk-form-dialog.ts` rather than adding a sibling hook.**

**The component — one, and four things say so:**

1. **The file's own docblock plans it** (`DeskFormDialog.tsx:1-3`): *"ST-02 (edit) and its upcoming-bookings warning are US-018's; **this component is add-mode only**."* That is an anticipation of extension, in the same voice `desks.ts:93` used for `deskNumberSchema`.
2. **`SCR-007:102` lists one `dialog` for ST-01 – ST-07**, and Figma's `Desk form popup` master holds add and edit as **variants of one component**. US-017 §4.3 already recorded that as a forward contract (its open item 4), so this is honouring a decision, not making one.
3. **The delta is small and entirely declarative** — title, initial value, confirm label, one extra `Alert`. The field, both ST-03 messages, the ST-04 duplicate Alert, the ST-07 failure Alert, busy behaviour, focus, and the `Dialog` shell are **byte-identical** between modes (`DeskFormDialog.tsx:40-101`).
4. **Issue #49 argues *for* it, not against.** If #49 resolves toward building the status radio, the add/edit divergence grows — and a single component with a `mode` absorbs that in one conditional, whereas two components would then need the radio built in one and deliberately absent from the other, with nothing structural holding the asymmetry in place.

**The distinction a reviewer will expect to travel, and it does not.** US-017 §5.2 **rejected** a `mode`-style prop on `ConfirmDialog` — *"Every prop weakens the name… `components/README.md:3-4` makes props a contract, so five of them is five contract changes"*. That argument was about **`components/**`**, the Complex shared-component surface (`task-surfaces.md:61`, `TextField.tsx:11`). **`DeskFormDialog` lives in `screens/desks/`**, is screen-private by `components/README.md:6`, and has exactly one consumer (`Desks.tsx:128-130`). Its props are Medium (`task-surfaces.md:66` — *"a new component private to one screen"*). **Say this in the PR**, because US-017 leaned on the props-are-a-contract rule hard and a reviewer will reasonably expect it to cut the same way twice.

```ts
export interface DeskFormDialogProps {
  /** ST-01 vs ST-02. The ONLY structural switch: it selects the title, the confirm label, the
   *  initial field value, and whether AC-04's note renders. Everything else — ST-03, ST-04,
   *  ST-05, ST-07 — is identical in both modes, which is why this is one component. */
  mode: 'add' | 'edit';
  /** The desk being edited. Present iff `mode === 'edit'`. Carries `bookedAhead`, which IS
   *  AC-04's count — no fetch, no loading state (design note §4). */
  desk?: AdminDesk | undefined;
  dialog: DeskFormDialogState;
  onSubmit: (raw: string) => void;
  onDismiss: () => void;
  initialValue?: string;
}
```

**Two details that are easy to get wrong:**

- **The title binds to the subject, not to the field.** `editDeskDialogTitle(desk.deskNumber)` where `desk` is the row as loaded — **not** the live input value. `SCR-007:114` gives the reason: *"so a screen-reader user knows which desk they are editing without re-reading the field."* A title that tracks the input would rename itself as the user types, and would say `Edit desk A-9` mid-keystroke.
- **`initialValue` stops being a test seam and becomes the feature.** `DeskFormDialogProps.initialValue`'s current docblock (`:35-37`) calls it *"Test seam only"*; in edit mode it carries the prefilled value (`SCR-007:65`). Rewrite the docblock, and note that **prefill alone is not the requirement** — ST-02 says *"prefilled with the current number and **fully selected**, so overtyping is one action."* `Dialog` focuses the field via `initialFocusRef` (`Dialog.tsx:48`) but does **not** select its contents. **One `inputRef.current?.select()` is needed and it is the kind of half-requirement that ships as half-done.**

### 6.2 The state machine — generalised, not duplicated, because AC-08 says "match"

```ts
// apps/ui/src/screens/desks/use-desk-form-dialog.ts  (was use-add-desk-dialog.ts)

export interface DeskFormDialogState {
  mode: 'add' | 'edit';
  /** Present iff `mode === 'edit'`. The subject — `use-admin-cancel-dialog.ts`'s own shape. */
  desk?: AdminDesk;
  busy: boolean;
  outcome?: 'duplicate' | 'failed';
  collidedOnCaseOnly: boolean;
}
```

`openAdd()` / `openEdit(desk)` / `submit(raw)` / `dismiss()`, with the **same** synchronous `inFlight` ref (`use-add-desk-dialog.ts:33`, checked and set at `:41` before any state read). `submit` dispatches on `dialog.mode` to `addDesk(raw)` or `renameDesk(dialog.desk.id, raw)`, and both fetchers already return the same three-kind union, so the outcome handling at `:45-54` is **unchanged**.

**Why one hook rather than a sibling `use-edit-desk-dialog.ts`:**

- **AC-08 is literally "match the add path"** (*"the action is guarded against a double submit (ST-05), and a failure retains the entry, changes nothing, and offers a retry (ST-07)"*). Two hooks would put that guarantee in two files that can drift, and the guard is one `useRef` — the smallest possible thing to accidentally get wrong twice. `use-my-bookings.ts:137-140` states why the ref rather than the state: *"checked and set before any state read, so a second regain landing while a refresh is still in flight is refused regardless of whether React has re-rendered yet."*
- **The state machine is identical, not merely similar.** `busy`, `outcome: 'duplicate' | 'failed'`, `collidedOnCaseOnly` — every field applies to both modes, unchanged. `collidedOnCaseOnly`'s computation (`:52`) is mode-independent.
- **Adding a subject is a *return* to the established shape, not an invention.** `use-admin-cancel-dialog.ts:14-31` is *"a state object holding the subject plus `busy` plus an `outcome`"* (US-017 §4.2 quoted it as the shape to copy). `useAddDeskDialog` is the outlier for having no subject, because add has none.

**The cost, and it is a CI cost rather than a code cost.** The file is renamed, `Desks.tsx`'s call site changes, and `use-add-desk-dialog.spec.ts` becomes `use-desk-form-dialog.spec.ts`. That spec carries `US-017/AC-06` citations, and `aidlc-check` treats a literal `US-0NN` in a test file as a citation requiring **that file path** in that story's manifest `tests[]` — so **US-017's `tests[]` entry must be repathed in this PR**. That is keeping the manifest true, not scope creep, and §10 note 2 makes it a checklist item because it is a red check that reads as a mystery. *(The alternative — keep the misleading filename and add edit support inside it — is available and costs no manifest churn. I do not recommend it; a hook named `use-add-desk-dialog` that runs the edit flow is the kind of name that misroutes the next reader.)*

### 6.3 ST-06 — rename in place, re-sort, never refetch

**Recommendation: `lib/use-desks.ts` gains `markRenamed(id: string, deskNumber: string)`, which replaces that desk's number **and re-sorts**. `Desks.tsx` does not re-fetch.**

```ts
const markRenamed = useCallback((id: string, deskNumber: string) => {
  setState((current) => {
    if (current.status !== 'ready') return current;
    const desks = current.desks
      .map((desk) => (desk.id === id ? { ...desk, deskNumber } : desk))
      .sort((a, b) => (a.deskNumber < b.deskNumber ? -1 : a.deskNumber > b.deskNumber ? 1 : 0));
    return { ...current, desks };
  });
}, []);
```

- **The re-sort is mandatory, not defensive.** AC-01 requires *"the inventory reorders accordingly"*, and the story's edge case `:79` makes it concrete: *"Renaming across zone letters (`A-01` → `B-05`)… Permitted; nothing prohibits it."* The list order is `desk_number` ASC (`desks.ts:52-53`, `desks.repository.ts:75`), so `A-01` → `B-05` **must** move. **Extract the comparator** that `markAdded` (`use-desks.ts:61`) already inlines, so the two orders cannot diverge — `bookings.repository.ts:53-56` records why a plain string comparison is right for this fixed-width format.
- **It takes `(id, deskNumber)`, not an `AdminDesk`.** That is what makes §3.3's narrower response body clean: the row's `bookedAhead` is **preserved**, not replaced by a number the server manufactured. A `markRenamed(desk: AdminDesk)` signature would invite exactly the clobber §3.3 rejected.
- **No refetch.** `useDesks` sets `{ status: 'loading' }` at the top of every effect run (`use-desks.ts:39`), so a refetch would blank the table to skeletons over a list the administrator is reading — `use-my-bookings.ts:44-50`'s stated reason, applied by US-017 §6.5 and unchanged here. `Desks.tsx:67-70`'s `retryKey` stays ST-04's **Try again**.
- **Additive for `AllBookings`.** `UseDesksResult` (`use-desks.ts:30-36`) gains one member. `AllBookings.tsx` reads only `.status` and `.desks`, so **it is not modified** — the same property US-017 §6.5 established.
- **The summary line needs no code.** `summaryLine` is pure over the array (`copy.ts:58-63`) and a rename changes neither the count nor the active/inactive split, so ST-06's line is correct without touching it. Worth one line in the PR, because a reviewer *will* check.

**The toast** is in-page local state — `Desks.tsx:76, :88`'s existing `addedMessage`, which generalises to `savedMessage` with no structural change.

**Focus restoration is free, and the nice part is checkable.** `Dialog.tsx:44-52` captures `document.activeElement` on mount and refocuses it on unmount — which is the row's **Edit** button, satisfying `SCR-007:111` (*"returns to the control that opened it — Add desk in the header, or **that row's Edit**"*) with **no new code**. And it survives the re-sort: `Desks.tsx:147-149` keys rows by `desk.id`, so React *moves* the existing DOM node rather than recreating it, and the captured element is still live. (US-016's dual-tree device puts the same `data-desk-row` on a `<tr>` and an `<li>`; the clicked button is in the visible tree, so the captured reference is the right one.)

### 6.4 The copy — what the frame gives, and the three strings nothing draws

Verified against `HF / SCR-007 · Desk form / ST-02 Edit — default · 1280` (node `225:369`). **Copy lives in `screens/desks/copy.ts`**, beside US-016's and US-017's, never derived from a server message — the rule that file already states (`:1-6`).

| Element | String | Source |
| --- | --- | --- |
| Dialog title | `Edit desk A-01` | **Frame-verified.** `SCR-007:114` |
| Field label | `Desk number` | `copy.ts:70`, reused |
| Helper | *(unchanged from add)* | `copy.ts:71-72`, reused. **Frame-verified as unchanged** |
| **ST-02 note** | `3 people have this desk booked. Renaming it changes what they see — they won't be told.` | **Frame-verified verbatim.** `warning` tone, **no Title line**, **no actions** |
| Cancel | `Cancel` | `copy.ts:73`, reused |
| Confirm (edit) | `Save changes` | **Frame-verified.** `SCR-007:50`, `:65` |
| ST-04 title | `A-01 is already taken by another desk.` | `copy.ts:84-86`, reused **unchanged** — it already names the *attempted* number, which is correct in edit mode too |
| ST-03, ST-07 | *(unchanged)* | `copy.ts:78-81`, `:94-95`, reused |

```ts
/** SCR-007 ST-02 — US-018/AC-04 (BR-001.19, RISK-012). Verbatim against the real hi-fi frame
 *  (node `225:369`). Names the CONSEQUENCE and the silence, in that order: the count alone would
 *  be a statistic, and AC-04 requires both halves before the save. Rendered only when the count
 *  is non-zero (the story's QA note: it must NOT appear on a desk with no upcoming bookings). */
export function upcomingHoldersWarning(count: number): string {
  const holders = count === 1 ? '1 person has' : `${count} people have`;
  return `${holders} this desk booked. Renaming it changes what they see — they won't be told.`;
}
```

**Three strings no approved artifact carries, named rather than invented** — the honesty SCR-007:179-184 itself models for its own undrawn variants:

1. **The singular.** The frame draws `3`; neither the frame nor the spec gives the `count === 1` wording. The derivation above (`1 person has` / `N people have`) follows `copy.ts:62`'s existing inline pluralisation pattern, and I recommend shipping it — but it is a copy string invented by an implementer, and `/ux` should confirm it.
2. **The edit-mode ST-07 confirm label.** ST-07 is drawn add-mode only (its frame is the add sheet; `SCR-007:116` measures *"the tallest **add-mode** sheet"*). AC-08 requires a retry, and `RETRY_LABEL` (`copy.ts:95`) already exists, so `Try again` is the consistent answer — undrawn, and recommended.
3. **The edit-mode ST-06 toast.** `SCR-007:89` gives it in prose — *"Desk number updated to A-12."* — and **no edit-variant ST-06 frame exists** (ST-06 is drawn as SCR-006-plus-toast for the add case). Ship the spec's string verbatim; flag that it is spec-sourced rather than frame-verified, unlike everything else in this table.

All three go to **open item 4** as one item for `/ux`, not three.

### 6.5 The row — and this is the file US-017 was forbidden to touch

**`DeskInventoryRow.tsx` and `DeskInventoryRow.spec.tsx` must be modified by this story**, which is the exact inverse of US-017 §9.1 (*"This story must not touch these files"*). Name the inversion in the PR; a reviewer who read US-017's note will have that sentence in mind.

- `DeskInventoryRow.tsx:55-58` — **Edit** loses `disabled`, loses `title={UNAVAILABLE_CONTROL_REASON}`, loses its visually-hidden reason span, and gains `onClick`. It therefore gains a prop: `onEdit: (desk: AdminDesk) => void`.
- `:59-62` — **the toggle stays exactly as it is.** Still `disabled`, still carrying `UNAVAILABLE_CONTROL_REASON`. US-019's.
- `copy.ts:24`'s `UNAVAILABLE_CONTROL_REASON` **stays**, for the toggle. Deleting it is a compile error, and noticing that is the point.
- `:14-18`'s docblock says *"Both row actions… are always `disabled`: their destinations (US-017, US-018, US-019) do not exist yet"*. Half of that stops being true.

---

## 7. What this story must NOT build — the review instruction

Mirroring US-017 §7, because US-019 is still queued behind this one and #49 is still open.

**US-019's (take a desk out of service):**
- **No activate/deactivate endpoint**, and **no `isActive` in any request body** — `SCR-007:125` and story edge case `:80` (*"Only the desk **number** is editable"*) both forbid it, and §3.1 is why `PUT` was rejected partly to keep it out.
- **No deactivation block, no `bookedAhead` gate, no `422`.** `bookedAhead` is read in this story **only to render a warning** (§4). A code path where the count refuses something is US-019's and is a **direct AC-03 violation** here (*"the change is permitted — not blocked"*).
- **No server-side recount of `bookedAhead`** (§4). US-019 needs one because it blocks; this story must not build it speculatively.
- **No SCR-006 ST-05 – ST-10**, no `Dialog State=Blocked`.
- **`DeskInventoryRow.tsx:59-62`'s toggle stays `disabled` with its reason** (§6.5).

**Nobody's:**
- **No migration** (§0.2, §2.1). No `citext`, no generated column, no functional index, and specifically **no `updated_at` trigger** — `0002_desks.sql:21-22` forecloses it and §2.4 sets the column in the `UPDATE` payload instead.
- **No `bookings.desk_number` column, and no denormalised copy of the number onto a booking** (§5). It would break AC-06 by construction, and `bookings_desk_id_booking_date_idx` (`0003_bookings.sql:79`) already serves the access path anyone would reach for it to optimise.
- **No pre-check `SELECT`, and no `and id <> $2`** (§2.3). **A pre-check is a finding on AC-02 and AC-07 simultaneously**, and the exclusion clause that would fix AC-07 is evidence of the AC-02 race.
- **No route.** `apps/ui/src/routes.tsx` is not modified — settled by US-017 §4.3, and still the most likely wrong diff because `SCR-007:9` asks for `/admin/desks/:id/edit` in writing.
- **No notification, and no notification *dependency*** (§7.3 below).
- **No delete.** `0002_desks.sql:16-18`, US-016/AC-09, US-019 edge case `:97`.
- **No status radio.** #49 is an **add-mode** disagreement; ST-02 has none in either document, and the closing line of this note confirms it from both.
- **No new prop on `Alert`, `Button`, `Toast`, `Dialog` or `EmptyState`** (§0.2, §1.1). Exactly one shared-component prop is added, on `TextField`, and §1.1 is the argument. **A second shared-component diff is a review finding.**
- **No new error code.** `libs/contracts/src/error.ts` is not modified (§0.2).
- **No change to `data-refresh.ts`, `AppShell.tsx`, `eslint.config.mjs`, `http/app.ts`, `composition.ts`, `apps/api/src/http/middleware/**`, or `inception/design/tokens.css`.**
- **No `apps/api/src/domain/` file.** The rule is reused from `libs/contracts` unmodified, and `domain/README.md:15-18` already records why it lives there (US-017 corrected it; §8 notes the one place that correction did not reach).

### 7.3 AC-05, and how to prove a negative honestly

AC-05 requires that **no notification is sent**. The QA note (`:93`) says *"Assert zero messages"*, and flags why it matters: *"a developer implementing US-029 nearby may reasonably assume a rename should notify."*

**There is no messaging layer in this repository yet**, so a test that counts zero emails from a system with no email is theatre. The honest proof is in two parts:

1. **Structural, and it is the strong half.** `DesksServiceDeps` is `{ desks, nowMs, officeTimezone }` (`desks.service.ts:14-18`). The service **has no notification dependency and cannot acquire one without changing its constructor** — which is a visible diff in a file this PR touches. A service-level test asserting the repository fake saw **exactly one interaction** (the update) and nothing else is the real assertion available today.
2. **Forward, and this is where AC-05's value actually lives.** AC-05 is a constraint on **US-029's** author, not on this PR's. So it belongs in a **docblock on `renameDesk`**, where that author will be reading, as well as in a test title. A test in this PR's suite is invisible to someone adding notifications in six weeks; a sentence in the method they will be modifying is not.

State both in the PR. Do not write a test that cannot fail.

---

## 8. No new ADR — four consequential edits instead

**Recommendation: no ADR.** The test US-013 through US-017 applied: *does the decision bind work beyond this story, with a rejected alternative a future author would otherwise re-litigate?*

| Candidate | Verdict |
| --- | --- |
| **`PATCH` for update-in-place; `POST /:id/<verb>` for a refusable transition (§3.1)** | **The one real candidate, and my answer is still no — but this is where I would not argue hard.** It binds US-019 immediately and every future update endpoint after that, `PUT` and `POST /:id/number` are both live alternatives (§3.1 rejects both on record), and it introduces the repository's **first** non-GET/POST verb. Against an ADR: the whole decision is one sentence, and `api-standards.md` **already has a Shape section (`:8-12`) that says nothing about verbs** — a gap this story is the first to hit. **A two-line addition there is better-targeted than an ADR**, because a future author writing a route reads the API standard and may never open `knowledge/decisions/`. **If the team would rather it be held by a decision record than a standard, write it now rather than at US-019** — the cost only rises. Open item 5 |
| **The CHECK makes the plain unique index sufficient for `UPDATE` too (§2.1)** | **No ADR.** A fact about a file, not a decision — and US-017 §8 already reached that conclusion for the insert path. It belongs in the module README, where the person about to write the migration will read it |
| **`200` with a narrower body than `AdminDesk` (§3.3)** | **No ADR.** A scoped consequence of what the write produces, with the reasoning in the schema's own docblock. It does not bind anything beyond this endpoint |
| **AC-04's count from the list rather than a fresh read (§4)** | **No ADR, but it must be *routed*.** It is right here **because nothing is gated on it**, and wrong for US-019 for the same reason inverted (US-019/AC-08). Recording only "reuse the count" without the condition would hand US-019 a bug. Open item 6, routed the way US-017 §4.3 routed its own forward constraint to this story |
| **One dialog with a `mode` (§6.1)** | **No ADR.** `DeskFormDialog.tsx:1-3` and Figma's own variant modelling already decided it, and US-017 §4.3 recorded it as a forward contract. Second application |

**Four consequential edits, US-013's device, each required by something that already exists:**

1. **`apps/api/src/modules/desks/README.md`** — **ADR-004 follow-up 2 makes this mandatory, not optional**: the module README is where `desks`'s write paths are declared, *"and its write paths are the only ones a reviewer should accept for that table."* `:5` says *"US-018 (edit) and US-019 (activate/deactivate) are its remaining ones"* and `:57` repeats it — both in the future tense, both stopping being true. Record: the `updateDeskNumber` path, the `WHERE id` discipline, the no-pre-check rule **and that it is what satisfies AC-07** (§2.3 — the non-obvious part), the zero-rows → `not_found` outcome, the `updated_at` write, and the CHECK-holds-for-`UPDATE` finding (§2.1). **That README is also where §4's US-019 warning belongs**, beside the `listUpcomingConfirmedDeskIds` paragraph at `:39-49` that already carries the drift warning for US-019's predicate.
2. **`libs/contracts/src/desks.ts:93`** — *"Exported on its own so **a future edit request (US-018)** reuses it rather than restating the rule."* It is no longer future, and the prediction came true, which is worth recording as the record rather than deleting. The file docblock (`:1-6`) also names only `GET` and `POST /api/admin/desks`.
3. **`apps/api/src/modules/desks/desks.repository.ts:2-5`** — *"desk writes landed with US-017 (add a desk); **US-018 (rename)** and US-019 (activate/deactivate) are this module's remaining write paths."* One of the two lands here.
4. **`ai/standards/api-standards.md:19-21`** — **and this one is a find US-017's own §8 list missed.** It still says: *"Requirement-level rules — the 30-day window, the weekday rule, **the desk-number format** — are **not** edge concerns. They live in `domain/` and are called by the service."* US-017 moved that rule to `libs/contracts` and correctly corrected `domain/README.md:15-18` (*"**Not here: the desk-number format and its normalization**… it was listed here until US-017 built it"*) — **but not this file.** The project's API standard now contradicts the code it standardises, and US-018 is the story that reuses that very schema at a route edge (§3.2), so it is the natural place to fix it. One sentence. *(If open item 5 resolves toward adding a verb note, both edits land in the same file.)*

**Optional, one line, not this story's:** `inception/specs/index.md:23` still records US-017 as *"ready for review (PR not yet opened)"*; PR #50 is merged. DEV adds the US-018 row to that table anyway, so correcting the neighbouring row costs nothing — but it is housekeeping, not a requirement of this story.

---

## 9. File placement

**New — `libs/contracts`**

```
libs/contracts/src/desks.ts       + deskIdParamsSchema, deskUpdateSchema,
                                    deskUpdateResponseSchema  (§3.2, §3.3)
libs/contracts/src/desks.spec.ts  deskUpdateSchema's reuse of deskNumberSchema; the
                                    omit-derived response shape (§10)
```

**New — `apps/ui`**

```
apps/ui/src/lib/rename-desk.ts                   (+ .spec.ts)  three outcomes (§3.6)
apps/ui/src/screens/desks/use-desk-form-dialog.ts (+ .spec.ts) RENAMED from
                                                  use-add-desk-dialog.ts — see §10 note 2
```

**Modified — `apps/api`**

```
apps/api/src/modules/desks/desks.repository.ts       + updateDeskNumber, UpdateDeskOutcome (§2.2)
apps/api/src/modules/desks/desks.repository.spec.ts  the recorded update payload INCLUDING
                                                       updated_at (§2.4); 23505 -> duplicate;
                                                       23514 throws; zero rows -> not_found
apps/api/src/modules/desks/desks.service.ts          + renameDesk; the single nowMs() reading;
                                                       AC-05's forward docblock (§7.3)
apps/api/src/modules/desks/desks.service.spec.ts     AC-01, AC-02, AC-03, AC-07
apps/api/src/modules/admin/admin.router.ts           + PATCH /desks/:id (§3)
apps/api/src/modules/admin/admin.routes.spec.ts      a NEW describe; `noDesks` gains one stub
                                                       — see §10 note 1
apps/api/src/modules/desks/README.md                 ADR-004 follow-up 2 — REQUIRED (§8)
```

**Modified — `apps/ui`**

```
apps/ui/src/components/text-field/TextField.tsx      + describedBy, composed (§1.1)
apps/ui/src/components/text-field/TextField.spec.tsx the three-way composition; that a caller's
                                                       id does NOT displace error/helper
apps/ui/src/lib/use-desks.ts                         + markRenamed; the extracted comparator (§6.3)
apps/ui/src/lib/use-desks.spec.ts                    markRenamed's re-sort across a zone letter
apps/ui/src/screens/desks/DeskFormDialog.tsx         + mode, desk; the ST-02 note; select-on-open (§6.1)
apps/ui/src/screens/desks/DeskFormDialog.spec.tsx    ST-02; AC-04's presence AND absence
apps/ui/src/screens/desks/DeskInventoryRow.tsx       Edit enabled + onEdit; the toggle UNCHANGED (§6.5)
apps/ui/src/screens/desks/DeskInventoryRow.spec.tsx  the forcing test SPLIT — see §10 note 3
apps/ui/src/screens/desks/Desks.tsx                  openEdit wiring; the toast; docblock (§6)
apps/ui/src/screens/desks/Desks.spec.tsx             the edit flow end to end
apps/ui/src/screens/desks/copy.ts                    + editDeskDialogTitle, SAVE_CHANGES_LABEL,
                                                       upcomingHoldersWarning, deskRenamedToast (§6.4)
apps/ui/src/screens/desks/copy.spec.ts               the new strings, incl. the singular
```

**Modified — framework**

```
inception/specs/index.md                 the US-018 row
knowledge/traceability/manifest.json     US-018 tests[] — AND US-017's repathed entry (§10 note 2)
ai/standards/api-standards.md            §8 edit 4; the verb note if open item 5 says so
```

### 9.1 Not modified, and worth saying so

- **`supabase/migrations/**`** — §2.1. Protected path. **A migration in this PR is a review finding**, and §2.1's table-CHECK argument is what must be rebutted before writing one.
- **`libs/contracts/src/error.ts`** — §3.4, §3.5. **Both** codes already exist. A story adding a write endpoint and no error code is the shape to aim for.
- **`libs/contracts/src/desks.ts`'s `DESK_NUMBER_PATTERN`, `normalizeDeskNumber`, `deskNumberSchema`, `deskCreateSchema`, `adminDeskSchema`, `adminDesksResponseSchema`** — every one is **reused unmodified**. AC-02's *"the same rules as on create"* is true because they are the same objects (§3.2). **A diff to `deskNumberSchema` is a review finding.**
- **`apps/ui/src/routes.tsx`** — §0.2, §7. Settled by US-017 §4.3; `SCR-007:9` is the stale line that will tempt a reviewer (US-017 open item 3, still `/ux`'s).
- **`apps/api/src/http/middleware/**`, `http/app.ts`** — §0.2. `requireAdmin` at `app.ts:78` predates the route; `admin.router.ts:1-17` states the inheritance.
- **`apps/api/src/composition.ts`** — the wiring already exists (`:108`, `:117`). A reviewer will look for this diff and its absence is correct.
- **`apps/api/src/modules/bookings/**` and both bookings repositories** — **§5. This is AC-06's evidence.** The number is joined live at `admin-bookings.repository.ts:144`, `bookings.repository.ts:188`, `:363`. **A diff to any of those select strings is a review finding**, and `admin-bookings.repository.spec.ts:348` already pins one of them.
- **`apps/ui/src/components/alert/Alert.tsx`, `dialog/Dialog.tsx`, `button/Button.tsx`, `toast/Toast.tsx`, `confirm-dialog/**`** — §1.1, §6.3. Composed as they are. ST-02's note needs `tone="warning"` + `live="off"` + no title + no actions, all of which `Alert.tsx:19-28` already provides.
- **`apps/ui/src/screens/all-bookings/**`** — §6.3. `useDesks`'s new member is additive; `AllBookings.tsx` reads only `.status` and `.desks`.
- **`inception/design/tokens.css`, `eslint.config.mjs`, `apps/ui/src/lib/data-refresh.ts`, `apps/api/src/domain/*.ts`** — §0.2, §7.

**Five protected paths are in this list.** A story that adds a write operation, two request schemas and a response schema while touching no migration, no middleware, no token, no lint rule and no error code is worth stating in the PR the way US-013 through US-017 each did.

---

## 10. Test placement per AC

QA's own flags are the organising constraints: **AC-04 must be tested for its absence as well as its presence**, **AC-05 is a negative with real forward value**, **AC-06 must be read from three places**, and **AC-07 is the classic bug.**

| AC | Proven where | Level |
| --- | --- | --- |
| **AC-01** | `desks.repository.spec.ts` — the recorded update is `.update({ desk_number, updated_at }).eq('id', id)`, **naming `updated_at`** (§2.4) and **keying on `id`, never `desk_number`**; `desks.service.spec.ts` — `{ kind:'ok', desk: { deskNumber:'B-05' } }`, with `updated_at` derived from the injected clock; `admin.routes.spec.ts` — `200` with `{ id, deskNumber, isActive }` and **no `bookedAhead`** (§3.3); `use-desks.spec.ts` — **`A-01` → `B-05` re-sorts across the zone boundary** (edge case `:79`), not merely updates in place; `Desks.spec.tsx` — the row shows the new number in its new position | **repository + service + route + hook + component** |
| **AC-02** | `libs/contracts/src/desks.spec.ts` — `deskUpdateSchema` rejects `''`, `'A-1'`, `'AA-01'`, `'Window seat 3'` and accepts `'a-07'` → `'A-07'`, `'  b-12  '` → `'B-12'`, **and a test that it is not `deskCreateSchema`** (`deskUpdateSchema !== deskCreateSchema`, so a future `isActive` on create cannot leak — §3.2); `DeskFormDialog.spec.tsx` — an invalid entry in **edit** mode renders the message and **the fetcher is never called** (`expect(renameDesk).not.toHaveBeenCalled()`); `desks.repository.spec.ts` — `23505` on `desks_desk_number_key` → `duplicate`, **anything else `23505` throws**, **`23514` throws**; `admin.routes.spec.ts` — the duplicate yields `409 desk_number_taken` asserted through `errorBodySchema`; a raw `A-1` body yields `400 invalid_request` **with no repository call** | **contract + component + repository + route** |
| **AC-03** | `desks.service.spec.ts` — **a desk with `bookedAhead: 3` renames successfully**, and the service makes **no** `listUpcomingConfirmedDeskIds` call (the absence *is* the AC — §1); `Desks.spec.tsx` — the dialog on a desk with 3 holders saves and the confirm action is **never disabled by the count** | **service + component** |
| **AC-04** | `DeskFormDialog.spec.tsx` — **both directions, and the absence is the one QA asked for**: `bookedAhead: 3` renders the warning with the real count; **`bookedAhead: 0` renders no Alert at all**; `bookedAhead: 1` renders the singular (§6.4); the note's id **is in the field's `aria-describedby` alongside the helper's**, and `TextField.spec.tsx` proves a caller-supplied id does **not** displace the error/helper association (§1.1); and — the assertion that makes §4 checkable — **opening the dialog issues no fetch** | **component** |
| **AC-05** | `desks.service.spec.ts` — a rename produces **exactly one** repository interaction and nothing else (§7.3); plus the **structural statement in the PR**: `DesksServiceDeps` (`desks.service.ts:14-18`) has no notification dependency and cannot send one. **No test pretends to count zero emails from a system with no email**, and the forward constraint is a docblock on `renameDesk`, because US-029's author reads the method, not this suite | **service + a stated structural fact** |
| **AC-06** | **The three places QA named, and no production diff** (§5): `bookings.repository.spec.ts` / `admin-bookings.repository.spec.ts` assert the `desks(desk_number)` joins are **unchanged** (`:348` already pins one byte-for-byte); **the real proof is a gated real-Postgres test** — rename a desk with bookings, then read `listMyBookingsInWindow`, `listBookings` and `listAllDesks` and see the new number in all three. The `bookings.repository.concurrency.spec.ts` gate and its `createDesk` fixture (`:97-100`) make this cheap, and a fake client **cannot** prove AC-06 at all: it returns whatever it is told, so "the join is live" is exactly the class of assumption that file's docblock (`:1-12`) exists for | **repository + a gated integration test** |
| **AC-07** | `desks.repository.spec.ts` — the recorded update for an unchanged number is **still `.update({ desk_number, updated_at }).eq('id', id)`**, with **no preceding `.select()`** — i.e. the assertion is *that no pre-check exists*, which is the whole of §2.3; `desks.service.spec.ts` — renaming to the current value returns `{ kind:'ok' }`, not `duplicate`; `admin.routes.spec.ts` — `200`, not `409`. **And the gated real-Postgres test**: `UPDATE` a row to its own value and assert **no `23505`** (§2.3 — a fake client can only be *told* that no error was raised) | **repository + service + route + a gated integration test** |
| **AC-08** | `use-desk-form-dialog.spec.ts` — **two synchronous `submit()` calls in edit mode issue exactly ONE fetch**, asserted with no intervening `await` (the `inFlight` ref, not `busy`); `DeskFormDialog.spec.tsx` — while busy the confirm keeps its **label** and carries `aria-busy`, and Cancel, the close icon and Escape are all suppressed (all four from `Dialog`'s `busy`); a `failed` outcome **retains the typed value**, renders the danger Alert, and the confirm becomes `Try again`; `rename-desk.spec.ts` — a `500`, an `unavailable`, an unparseable body **and a `404`** all map to `failed`, and **only** `desk_number_taken` maps to `duplicate` | **hook + component + lib** |
| **AC-09** | `admin.routes.spec.ts` — an **Employee** session `PATCH`ing `/api/admin/desks/:id` gets **403**, reaching the real mount (`http/app.ts:78`); no token gets `401`. Extend the existing admin-guard describe, whose `appWith` (`:111-115`) already threads a real session | **route** |
| — | `ConfirmDialog.spec.tsx` **unchanged and green** — `TextField` is composed by it indirectly through nothing, but `TextField.spec.tsx` and every existing `TextField` caller staying green is §1.1's behaviour-preservation evidence. **A diff to `ConfirmDialog.spec.tsx` in this PR is a review finding** | **component** |

**Four mechanical notes that cost time if they are discovered in CI instead of here:**

1. **The `admin.routes.spec.ts` stub churn is *smaller* than US-016 and US-017 warned, and it is worth correcting the expectation.** Those notes said a new interface method makes every stub call site fail to typecheck. That is **no longer true**: `noDesks` (`:79-89`) is now a shared base object, and every other site spreads it (`:464`, `:531`) or passes it directly (`:520`, `:587`, `:612`, `:624`). So adding `updateDeskNumber` needs **one** edit — a throwing stub on `noDesks`, matching `insertDesk`'s at `:86-88` — plus the new describe's own recording fake. **Do not over-prepare for four edits that no longer exist.**

2. **The hook rename will produce a red `aidlc-check` that reads as a mystery, and this is the note to read before starting.** `aidlc-check` treats any literal `US-0NN` in a test file as a citation requiring **that file path** in that story's manifest `tests[]` — the rule that bit this repo in `dfbc9a2`, five days ago. `use-add-desk-dialog.spec.ts` carries `US-017/AC-06` citations. Renaming it to `use-desk-form-dialog.spec.ts` (§6.2) **breaks US-017's manifest entry**, and the failure will name US-017, not US-018. So: **repath US-017's `tests[]` entry in this PR**, and say in the PR description that it is a path correction keeping the manifest true, not a coverage change. *(The escape hatch is to keep the old filename; §6.2 explains why I do not recommend it.)*

3. **`DeskInventoryRow.spec.tsx:78-87` must be SPLIT, not deleted, and the citation must survive.** That test is titled *"Edit and the activate/deactivate control are both disabled with an accessible reason (**US-016/AC-06, AC-08** — removed once their own stories ship)"* and asserts both (`:83-86`). US-018 makes **half** of it false. **Keep the title's `US-016` citation** on the surviving half (the toggle) — losing it silently drops another story's coverage, the hazard US-015 §5.4 named and US-017 §10 note 4 hit. Then add a positive `US-018/AC-01` test that **Edit** is enabled and calls `onEdit`. **And once that file carries a literal `US-018`, its path must be in US-018's manifest `tests[]`** (note 1's rule again) — and it must gain **no** literal `US-019`. `:61-65`'s `/^Edit/` matcher needs no change once the reason leaves Edit's accessible name.

4. **The gated real-Postgres test is worth it this time, for two ACs.** §2.3 (AC-07: assert **no** `23505` on a self-update) and §5 (AC-06: rename, then read from three places). Both are assertions a fake client **cannot** make — it returns what it is told, so "no error was raised" and "the join is live" are exactly the assumptions `bookings.repository.concurrency.spec.ts:1-12` was written to cover. The gate, the skip-not-fail convention and a `createDesk` fixture (`:97-100`) all already exist. US-017 §10 declined a gated test and I agreed with that call — **its** assertion was "the index fires", which a violation demonstrates. **This story's two are the inverse**, and an inverse assertion has no cheap proof.

**Data setup**, the story's QA note taken literally (`:96`): a desk with **3 upcoming Confirmed bookings**; one with **only past** bookings (so `bookedAhead` is 0 and the note must be **absent**); **two desks** for the collision case; and — mine to add — **one desk whose rename crosses a zone letter** (`A-01` → `B-05`), because that is the only fixture that proves AC-01's re-sort rather than an in-place update.

---

## 11. Open items carried out of this note

| # | Item | Owner | Blocks |
| --- | --- | --- | --- |
| **1** | **§3.1 — the verb.** Recommendation: **`PATCH /api/admin/desks/:id`**. This codebase has **no update-in-place precedent at all** (verified: only `GET`/`POST` exist anywhere, and every `POST` is a collection create or a verb sub-resource), so this story sets the convention. `PUT` rejected because a one-of-four-field `PUT` invites `isActive`, which `SCR-007:125` forbids; `POST /:id/number` rejected against `api-standards.md:9`. **Confirm or overrule before the contract is written** | **Joy Joshua + DEV** | the request/response contract, `lib/rename-desk.ts`, the route |
| **2** | **§2.3 / §5 — the one place I'd spend real effort.** Add two `it()`s to the existing gated real-Postgres file: AC-07's *no `23505` on a self-update*, and AC-06's *rename then read from three places*. Both are assertions a fake client cannot make. The gate, the convention and the desk fixture already exist. My recommendation: **yes** — it is a stronger case than US-017's, which I agree was rightly declined | **DEV + QA** | nothing; it strengthens the two ACs most likely to be wrong in six months |
| **3** | **§1.1 — one additive prop on `TextField` (`describedBy?: string`), a Complex shared-component surface**, forced by `SCR-007:114`'s requirement that ST-02's note be *associated with the field*. Three cheaper alternatives fail, one of them on HTML validity. Confirm the surface is being opened deliberately | **Joy Joshua** | ST-02's a11y, which is AC-04's whole mitigation for RISK-012 |
| **4** | **§6.4 — three copy strings no approved artifact carries**: the **singular** holder warning (the frame draws `3`), the **edit-mode ST-07 confirm label** (ST-07 is drawn add-mode only; `Try again` recommended), and the **edit-mode ST-06 toast** (`SCR-007:89` gives it in prose; no frame draws it). All three recommended as written in §6.4; all three are implementer-derived and want a designer's yes | **`/ux`** | nothing in code; three strings a reviewer cannot verify against a frame |
| **5** | **§8 — promote §3.1's verb rule to an ADR, or add it to `api-standards.md`?** My answer is the standard, not an ADR: the decision is one sentence and `api-standards.md:8-12`'s Shape section is silent on verbs, which is the gap. **But it binds US-019 immediately and every update endpoint after**, so if you'd rather it be a decision record, write it now rather than at the third application. The one I would not argue hard about | **Joy Joshua** | nothing functional |
| **6** | **§4 / §8 — route the AC-04 condition to US-019, not just the conclusion.** US-018 reads `bookedAhead` from the list because **nothing is gated on it**; US-019/AC-08 needs a server-side recount for the inverse reason, in its own words (*"the count is a prediction, the server is the rule"*). Recording "reuse the list's count" without the condition hands US-019 a bug. Record it against US-019 the way US-017 §4.3 routed its own forward constraint to this story | Manager → US-019 | nothing in this story |
| **7** | **§8 edit 4 — a US-017 miss worth fixing here.** `ai/standards/api-standards.md:19-21` still says the desk-number format *"lives in `domain/`"*. US-017 moved it to `libs/contracts` and correctly corrected `domain/README.md:15-18` — but not the API standard, which now contradicts the code it standardises. One sentence, in the story that reuses that schema | DEV | nothing; a standard that is currently false |
| 8 | **§6.1 observation, not this story's to fix.** `DeskFormDialog.tsx:95` sets `maxLength={20}` (matching `deskNumberSchema`'s `.max(20)` pathological-body guard), whereas `SCR-007:59` says *"at most 4 characters"* and open question 2 (`:141`) resolved *"exactly 4 characters… fixes the field length at 4"*. **I recommend the code stay at 20 and the spec be reconciled**, not the reverse: `maxLength={4}` would truncate a pasted `  A-01  ` to `  A-` and produce a confusing refusal, which fights `SCR-007:115`'s own trim rule. Named so it is a visible choice rather than a missed one | `/ux` + Joy Joshua | nothing |

---

**Issue #49 has no bearing on US-018, and both documents agree on both sides — confirmed from the frame and the text.** The verified ST-02 frame (node `225:369`) contains **no status radio**; `SCR-007:50` says *"In edit mode… the status radio is absent"*; ST-02 itself says *"no status choice"* (`:65`); the components table lists `radio-group` for *"ST-01, ST-03 – ST-05, ST-07"* and **omits ST-02** (`:104`); the structural decision (`:125`) is *"Status choice on add, **absent on edit**"* with *"A status control in both modes"* as its named rejected alternative; and US-018's own edge case (`:80`) says *"Only the desk **number** is editable."* #49's disagreement is confined entirely to add mode. One forward note: if #49 resolves toward building the radio, the add/edit divergence grows — which strengthens §6.1's one-component-with-`mode` recommendation rather than weakening it.

---

**Two things outside the note, briefly.** First, the item I would spot-check is **§2.3** — AC-07 turns out to be free, but only because US-017 refused a pre-check for an unrelated reason; if anyone "helpfully" adds `and id <> $2` to be safe, they will have introduced the AC-02 race and be pointing at the fix for AC-07 as justification. Second, **§2.4 (`updated_at`) is the defect most likely to actually ship**: nothing errors, nothing warns, and every test passes without it.