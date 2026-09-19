# US-017 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-017 — Add a desk](../../stories/user-stories/US-017-add-a-desk.md) |
| **Screen**   | [SCR-007](../../design/screens/SCR-007-desk-form.md) **ST-01, ST-03, ST-04, ST-05, ST-06, ST-07**, rendered over [SCR-006](../../design/screens/SCR-006-desks.md) ST-01. **ST-02 is edit mode and is US-018's** — not designed here, and §7 is the whole of what this story does about it |
| **Tier**     | Complex — a **new write endpoint**, a **new required request field**, a **new error code**, and **two shared-component changes** (§0) |
| **Author**   | Architect persona (AI draft), 2026-09-19                                 |
| **Rests on** | [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md), [ADR-004](../../../knowledge/decisions/ADR-004-table-ownership.md), and the [US-007](../US-007-book-an-available-desk/design-note.md), [US-011](../US-011-cancel-my-own-booking/design-note.md), [US-015](../US-015-cancel-a-booking-on-behalf/design-note.md) and [US-016](../US-016-see-the-desk-inventory/design-note.md) design notes — **no new ADR** (§8), and §4 is the one I would not argue hard about |
| **Verified against** | the real hi-fi frames in *Employee Desk Booking — Design System & Mockups*, not the written spec alone: `HF / SCR-007 · Desk form / ST-01…ST-07` at 1280/768/360 plus the keyboard frame, and the `Desk form popup` master (node `224:17165`). Every copy string in §6 is read off a frame, not paraphrased |

**Advisory.** The human's GitHub review is the authority. `decisions.md` in this package stays DEV's.

The story hands `/architect` one question and says so plainly (line 99): *"Shape is `/architect`'s to settle — no OpenAPI contract exists in this repository yet."* §2 and §3 are the answer. §4 answers a second question the story does not ask but SCR-007 forces.

**The verdict, in one line each:**

- **No migration, and this is the finding to check first.** `desks_desk_number_format` (`0002_desks.sql:30`) admits **only** upper-case values, so `desks_desk_number_key` (`:35`) — a plain, case-*sensitive* unique index — **is** AC-05's case-normalised uniqueness, by construction. The CHECK is what makes the plain index sufficient. **A migration in this PR is a review finding** (§2.1). **Verified independently by DEV against the live file — confirmed.**
- **The database arbitrates uniqueness; no application pre-check `SELECT` exists.** Map `23505` naming `desks_desk_number_key` to a distinguishable outcome, exactly as `bookings.repository.ts:227-243` already does for its two partial indexes. A read-then-write pre-check is the race US-007/D-04 already rejected (§2.3).
- **`normalizeDeskNumber` (trim, then upper) and `DESK_NUMBER_PATTERN` live in `libs/contracts`, once**, evaluated identically by both sides — the `evaluatePasswordPolicy` precedent named in `libs/contracts/src/index.ts:4-8`, and exactly the line ADR-002:76-79 draws for *this very field* (§5). **`apps/api/src/domain/` gains no file**, and `domain/README.md:10` is the one line that has to be corrected because of it.
- **The stored value is uppercased, not merely compared case-insensitively.** AC-03 says so ("stored and displayed as `A-07`"), and `0002_desks.sql:25-29`'s own comment already anticipates the failure mode: *"a normalization bug surfaces as a rejected write rather than as a desk nobody can book."*
- **No route. A dialog on `/admin/desks`, opened from local state** — third application of `use-cancel-dialog` / `use-admin-cancel-dialog`, and what every approved frame draws (a `Scrim` plus a `Desk form` over a full SCR-006). SCR-007's **Surface** line (`:9`) predates the 2026-09-10 correction and is stale (§4).
- **Extract `components/dialog/Dialog.tsx`; `ConfirmDialog` composes it.** Figma models it that way by name — *"built on the shared Dialog header (76px) and Dialog footer so the chrome cannot drift"* (`Desk form popup`, node `224:17165`) — and `ConfirmDialog.tsx:1-19` already states the anti-duplication policy this applies (§5).
- **`409 desk_number_taken` for the duplicate, `400 invalid_request` for the format.** One new error-code string; `conflict()`'s own docblock already names **V-08** as its case (`http/errors.ts:56-63`), which is literally this story's rule (§3.3).
- **`201` with a bare `AdminDesk`**, `bookedAhead: 0`. Not an envelope — `POST /api/bookings` returns a bare object (`bookings.router.ts:148`), and returning `AdminDesk` exactly lets the browser insert the row with no second mapping (§3.2, §6.5).
- **The list is updated in place, never refetched.** `markAdded`, mirroring `use-my-bookings.ts:44-50`'s `markCancelled`, whose docblock gives the reason in advance: *"a refetch here would… flash skeletons over a list the employee is reading"* — which is precisely what ST-06's frame does **not** draw (§6.5).
- **One STOP-and-ask, and it blocks the request contract: the status radio (§1.1, open item 1).**

§7's "must NOT build" list is as load-bearing as everything above it, and the thing most likely to ship wrong is in §2.4.

---

## 0. The tiering — confirmed, for four independent reasons

**Complex.** DEV's classification is right, and it is right four times over:

| Surface | What it is here |
| --- | --- |
| **Server — contract** | A **new write operation**, `POST /api/admin/desks`. `task-surfaces.md:39-41` — *"a new route, or a new write operation (`POST/PUT/PATCH/DELETE`) on an existing one"* — Complex outright, regardless of diff size |
| **Server — contract** | A **new required request field**, `deskNumber`. Same line: *"a new or changed **required** field in a request schema"* |
| **Contract — protected path** | `libs/contracts/**` (`task-surfaces.md:25-27`) gains a request schema, a response alias, a shared regex, a shared normaliser **and a new stable `code` string** in `error.ts`'s enum. ADR-002:81-88 calls those codes *"the most valuable thing in the package"* |
| **Browser — shared component** | A new shared `Dialog` primitive under `components/` **and** an additive prop on `TextField` (§5). `task-surfaces.md:61` and `TextField.tsx:11` — *"**Props and events are a Complex surface.**"* |

### 0.1 The Medium carve-outs, worked through — none is close

`task-surfaces.md:85-94` names four. Unusually for this epic, **not one of them is even arguable**, and that is worth recording so nobody re-derives it:

- **`:89-90` — *"a new `GET` lookup endpoint following an existing read-only pattern"*.** This is a `POST`. The carve-out is explicitly read-only.
- **`:91-92` — *"adding a **nullable** column plus its optional request field… where the migration is additive only"*.** There is **no migration at all** (§2.1), and the field is **required**, not optional. It fails on both clauses.
- **`:93` — *"a new pure rule function in `domain/` with its unit tests, not yet wired to a route"*.** §5 puts the rule in `libs/contracts`, not `domain/`, and it is wired to a route in the same PR.
- **`:94` — *"a new screen folder under `apps/ui` that only composes existing shared components and tokens"*.** `screens/desks/` already exists (US-016), and §5 **widens** two shared components. US-016 §0.1 failed this carve-out on the same second clause.

There is no honest argument for Medium anywhere in this story. Unlike US-016 — whose additive response field was pre-authorised in `desks.ts`'s own docblock — nothing here was written in advance.

### 0.2 What it is *not*, and each absence is defended below

- **Not Persistence, and this is the load-bearing absence.** `desks` already has every column this story writes (`0002_desks.sql:14-23`): `id` defaults to `gen_random_uuid()`, `is_active` defaults to `true` (AC-01's "created **Active**", free), `created_at`/`updated_at` default to `now()`. The format CHECK (`:30`) and the unique index (`:35`) are already the two rules AC-02 and AC-04/AC-05 need. **No column, no index, no trigger, no migration.** `0002_desks.sql:21-23` is explicit about the last one: *"this schema has exactly one trigger (db-design.md §3…) and it is not this"* — `updated_at` is application-maintained, and an `INSERT` needs nothing from the application because the column defaults.
  **`supabase/migrations/**` is a protected path (`task-surfaces.md:28`) and a diff there is a review finding.** If a reviewer believes one is needed, §2.1 is the argument to rebut, and `task-classification.md:110` makes it a STOP-and-ask rather than a delivery decision.
- **Not a trust boundary — but AC-08 is still this story's own AC.** No guard code is written: `requireAdmin` mounts once at `/api/admin` (`http/app.ts:78`), and `admin.router.ts:1-17` states the property this story consumes — *"Every future admin route inherits the same guard the same way."* On the client, the form lives inside `Desks`, already behind `RequireRole role="admin"` (`routes.tsx:66-73`). **`apps/api/src/http/middleware/**` and `http/app.ts` are untouched, and a diff to either is a review finding.** AC-08 still needs a test reaching the real mount with a real Employee session (§10) — the distinction US-016 §0.2 drew for its own AC-10.
- **Not a design-token change.** Every role the SCR-007 frames bind is already consumed by code today: `--c-warning-fill/-border/-ink` and `--c-danger-fill/-border/-ink` by `Alert`, `--c-success-*` by `Toast`, `--c-surface-overlay`/`--c-scrim`/`--shadow-sheet`/`--shadow-3` by `confirm-dialog.css:18-31, :106-118`, `--c-border-control`/`--c-focus-ring`/`--c-focus-ring-offset` by `TextField`, and the disabled treatment by `Button`. **`inception/design/tokens.css` is a protected path (`task-surfaces.md:32`) and is not modified; a diff there is a review finding.**
- **Not a data-fetching-layer change.** `apps/ui/src/lib/data-refresh.ts` is `task-surfaces.md:62-63`'s Complex surface, set once for the whole app (REQ-036/ADR-008). US-016 §0.2 kept this screen off it; **US-017 does not subscribe it either.** The list stays true after an add because §6.5 updates it in place, not because anything refreshes.
- **Not an `eslint.config.mjs` change.** `MAY_IMPORT.desks` is `[]` (`eslint.config.mjs:19`). The new repository method imports `infra/supabase` and `@desk-booking/contracts` and nothing else. A protected path stays untouched.
- **Not Dependency, not Operational, not Config.** No package, no env key, no scheduled work. Two SVG assets *may* be needed and they are files, not dependencies (§6.3) — and one of them already exists.

---

## 1. What this story actually is

One insert, one dialog, and a unique index that was already correct.

| AC | Where it is answered |
| --- | --- |
| AC-01 valid number creates an **Active** desk | §2.2 (the insert names no `is_active`; `0002_desks.sql:19`'s default is the AC), §3.2 (the `201` body), §6.5 (it appears in number order without a refetch) |
| **AC-02** format enforced, no request sent | **§5** — one regex in `libs/contracts`, called by the browser before submit *and* by `deskCreateSchema` at the route edge. The *"no request is sent"* half is the browser's and is the half a test can get wrong (§10) |
| **AC-03** lower case accepted, normalised **upward** | **§2.2** — the **stored** value is `A-07`. Not "compared case-insensitively": stored. `0002_desks.sql:30`'s CHECK makes this non-negotiable rather than a preference |
| **AC-04** duplicate refused, refusal explains itself | **§2.3** at the database, **§3.3** on the wire, **§6.4** at the pixel. Three sections and they are the three most likely to be got wrong independently |
| **AC-05** comparison case-normalised and trimmed | **§2.1** — and the surprise is that the existing schema already enforces it. The trim is the application's; the case-fold is the CHECK's |
| AC-06 save guarded, no layout shift | §6.6 — a synchronous `inFlight` ref **and** `Button`'s `disabled || busy` (`Button.tsx:62`). Two guards, and the ref is the one that makes *"exactly one"* true (`use-my-bookings.ts:137-140` states why) |
| **AC-07** non-duplicate failure keeps the entry | **§3.4**, §6.4. The wire distinction from AC-04 is one `code`; the *"nothing was created"* half is §2.3's no-pre-check insert |
| AC-08 admin only | Inherited on both sides (§0.2), proven at the real mount (§10) |
| AC-09 360px bottom sheet | §5.3 — `confirm-dialog.css:12-31, :106-118` **already implements exactly this**, mobile-first. The extraction carries it over unchanged |

### 1.1 The one thing the story and the screen disagree about — STOP

**SCR-007 requires a status radio on add. US-017 forbids one. No AC covers it. This must be settled before the request contract is written.**

The evidence on each side is explicit, approved, and contradictory:

| | Says |
| --- | --- |
| **SCR-007 ST-01** (`:59`) | *"the status choice defaulting to **Active**"*, and a structural decision (`:125`) defending it: *"A desk being set up before it is usable is a real case, so the choice belongs at creation"* |
| **The approved hi-fi frames** | Every add-mode frame carries two `Radio option` instances (node `221:363`) — *"Active — bookable straight away"* / *"Inactive — set up now, open later"* — in **ST-01** (`225:20`), **ST-03** (`225:750`), **ST-04** (`225:18658`), **ST-05** (`225:19190`) and **ST-07** (`225:19361`). Verified on the frames, not inferred |
| **US-017 edge cases** (`:79`) | *"New desks are created **Active**. BRD-001 states no way to create one inactive, and none is added."* |
| **US-017 AC-01** | *"the desk is created **Active**"* — and **no AC anywhere in the story mentions choosing a status** |
| **BRD-001 REQ-015** (`:66`) | *"An Admin can add a new desk identified by a unique desk number."* Silent on status |

**My recommendation: build no radio in US-017, and route the question to the PO.** Two reasons, and the second is structural rather than a preference:

1. **A control no AC names cannot be proven under this gate.** `ai/gates/delivery.md`'s check table requires every AC in the manifest to have a passing test citing `US-###/AC-##`. A status radio has no AC to cite, so it would ship as the only interactive control on the screen with no requirement behind it.
2. **The story is the delivery baseline, and changing its scope is a Gate 1 act.** US-016 §6.1 established the rule in the opposite direction — *"dropping an AC is a Gate 1 change routed through a `change-request` issue, not a delivery decision"*. Adding a control the ACs do not name is the same move with the sign flipped.

**What it blocks if it goes the other way:** `deskCreateSchema` gains `isActive: z.boolean()` (a second required request field), the insert stops relying on `0002_desks.sql:19`'s default, a `RadioGroup`/`RadioOption` component appears (a third shared-component surface), two icon assets arrive (`Icon / radio-on` 11:16, `Icon / radio-off` 11:12), and the story needs an AC. That is not a small delta, which is why this is a STOP rather than a note.

**Open item 1.** Owner: PO + `/ba`. The cheap resolution is a `change-request` issue adding **AC-10 — a desk may be created Inactive** to US-017, or a one-line correction to SCR-007 ST-01 recording that the radio is deferred. Either is cheap now and expensive once the PR is open.

---

## 2. Uniqueness and normalisation — the section to read twice

### 2.1 The existing schema already enforces AC-04 and AC-05. Read it before writing a migration.

This is the story's biggest decision and it is **checkable, not a judgement call.** `supabase/migrations/0002_desks.sql`:

```sql
  desk_number  text        not null,                                    -- :15
  constraint desks_desk_number_format check (desk_number ~ '^[A-Z]-[0-9]{2}$')   -- :30

create unique index desks_desk_number_key on desks (desk_number);       -- :35
```

The index at `:35` is a **plain, case-sensitive** unique index. Read alone, it does not give BR-001.8's case-normalised uniqueness, and the obvious conclusion is that a migration is needed.

**That conclusion is wrong, and the CHECK at `:30` is why.** `^[A-Z]-[0-9]{2}$` admits **no lower-case value at all**. Over the set of values the table can physically hold, a case-sensitive unique index and a case-insensitive one are the same index — there is no pair of distinct stored values that differ only by case, because one of the pair could never have been written. Uniqueness is case-normalised **by construction**, not by the comparison.

The migration's own comment (`:25-29`) says this was the intent:

> *"It also means a normalization bug surfaces as a rejected write rather than as a desk nobody can book."*

That sentence is the safety property this story inherits: if the application ever forgets to uppercase, the write fails loudly with a `23514` rather than creating `a-01` beside `A-01`.

So, precisely:

| | Enforced by |
| --- | --- |
| AC-02's format | `deskCreateSchema` at the route edge (§3.1) — **and** `desks_desk_number_format` as defence in depth (`:30`) |
| AC-03's upward normalisation | **the application, before the insert** (§2.2). The CHECK does not normalise; it *refuses* anything unnormalised |
| AC-04/AC-05's case-normalised, whitespace-trimmed uniqueness | the **trim in the application** plus **`desks_desk_number_key`** (`:35`), made sufficient by `:30` |

**Rejected alternatives, each with why it is worse here, not merely unnecessary:**

| Option | Verdict |
| --- | --- |
| **A migration: `desk_number citext`, or a `lower(desk_number)` generated column, or `create unique index … on desks (lower(desk_number))`** | **Rejected, and it is not a free "belt and braces".** It adds a second, independent statement of a rule `:30` already makes unfalsifiable, so the two can disagree only by someone weakening the CHECK — at which point the story's own guarantees change. It is a protected-path diff (`task-surfaces.md:28`) and a hard STOP-and-ask (`task-classification.md:110`) bought for nothing. **If a reviewer still wants it, that is a conversation to have before this PR, not inside it** |
| **An application pre-check `SELECT` over `desks` before the insert** | **Rejected — §2.3.** A read-then-write window, and US-007/D-04 already refused it for the same table pair |
| **Reusing the desk list the browser already holds** (`Desks.tsx:62`) to refuse a duplicate client-side | **Rejected outright, and it is the most tempting wrong turn in the UI.** ADR-002:76-79 names *this exact field*: *"'This desk number is already taken, in its normalized form' is BR-001.4 and BR-001.8… and is answered with a `409`. The browser may not evaluate business rules; it never has the data to do so correctly."* The list is a snapshot; a second admin's add makes it wrong. **A duplicate check in `apps/ui` is a review finding** |

**A migration appearing in this PR is a review finding, and §9.1 says so again.**

### 2.2 Normalisation: trim, then upper, once, before everything

```ts
// libs/contracts/src/desks.ts

/** BR-001.4, V-16. The ONE statement of the desk-number format in this project. Both sides
 *  test against this constant — never a re-typed literal, the lesson `password.ts:36-41`
 *  records ("two regexes for one rule is how the checklist and the refusal come to disagree"). */
export const DESK_NUMBER_PATTERN = /^[A-Z]-\d{2}$/;

/** BR-001.4, BR-001.8, V-08, US-017/AC-03, AC-05. Trim, then upper — in that order, and it is
 *  IDEMPOTENT (`f(f(x)) === f(x)`), which is what lets the browser normalise before sending and
 *  the server normalise again on arrival with no third answer possible. Property-tested (§10).
 *
 *  This produces the STORED value, not merely a comparison key: AC-03 requires `a-07` to be
 *  stored and displayed as `A-07`, and `0002_desks.sql:30`'s CHECK would REFUSE anything else —
 *  which is that migration's own stated intent (`:25-29`). */
export function normalizeDeskNumber(raw: string): string {
  return raw.trim().toUpperCase();
}
```

Three properties worth stating in the code, because each one is a bug if it is absent:

- **Trim before upper, not after.** Both orders give the same answer for this alphabet; fixing the order in one function means nobody has to prove that again at a second call site.
- **Idempotent.** The browser sends the normalised value (it computed it to validate), and the server normalises the body again. Without idempotence those two could differ, and the wire would carry a value the server then changes — the class of bug US-014 §5's *"echo a request value back only when the server may have changed it"* rule exists to avoid.
- **`toUpperCase()`, not `toLocaleUpperCase()`.** The alphabet is `A`–`Z` and a Turkish locale's dotless `ı` must not enter this function's behaviour. Say it in the docblock; it costs one line and it is the kind of thing a later "internationalisation" pass helpfully breaks.

**The field does not uppercase on keystroke.** SCR-007:19 says lower case is *"accepted as you type and normalised up"*, and the ST-04 frame settles it visually: the field still reads **`a-01`** after the refusal (`225:18658`, the `Desk number` instance's value). Normalisation happens on save. Uppercasing per keystroke would also fight the caret. **`autoCapitalize="off"` on the input** (SCR-007:115).

### 2.3 The insert: no pre-check, and `23505` is the arbiter

```ts
// apps/api/src/modules/desks/desks.repository.ts — the first WRITE this module has ever held

/** US-017/AC-01, AC-04, AC-05 (REQ-015, BR-001.4, BR-001.8, V-08, V-16). Inserts one desk and
 *  returns the created row, or reports the duplicate. `deskNumber` arrives ALREADY normalised
 *  (`normalizeDeskNumber`, applied by `deskCreateSchema` at the route edge) — this method does
 *  not normalise and must not, or the rule would have two homes.
 *
 *  `is_active` is NOT named: `0002_desks.sql:19` defaults it to `true`, which IS US-017/AC-01's
 *  "created Active". Naming it here would be a second statement of the same default.
 *  `created_at`/`updated_at` likewise default (`:22-23`) — this schema has one trigger and it is
 *  not on this table.
 *
 *  NO availability/existence pre-check precedes this. `desks_desk_number_key` (`0002_desks.sql:35`)
 *  is the sole arbiter, exactly as the two partial unique indexes are for
 *  `insertConfirmedBooking` (US-007/D-04): a `SELECT … WHERE desk_number = ?` followed by an
 *  `INSERT` is a read-then-write window two concurrent admins can both pass.
 *
 *  Only a `23505` naming the ONE known index becomes an outcome; everything else throws, the
 *  mapping contract `bookings.repository.ts:236-242` states for the same class of failure.
 *  A `23514` (the format CHECK) is deliberately NOT mapped: reaching it means the normaliser or
 *  the schema failed, which must surface as a 500 rather than be reported to an administrator as
 *  a duplicate. */
insertDesk(deskNumber: string): Promise<InsertDeskOutcome>;
```

```ts
export type InsertDeskOutcome = { kind: 'ok'; desk: DeskRow } | { kind: 'duplicate' };
```

```ts
async insertDesk(deskNumber) {
  const { data, error } = await supabase()
    .from('desks')
    .insert({ desk_number: deskNumber })
    .select('id, desk_number, is_active')
    .single();

  if (!error) return { kind: 'ok', desk: data as DeskRow };
  if (error.code !== '23505') throw new Error(`desk insert failed: ${error.message}`);
  if (error.message.includes('desks_desk_number_key')) return { kind: 'duplicate' };
  throw new Error(`unrecognised unique violation: ${error.message}`);
}
```

Four notes, each with a real failure behind it:

- **`.select('id, desk_number, is_active')` on the insert, not a second read.** One round trip, and it returns the columns `DeskRow` (`desks.repository.ts:16-20`) already declares — so the service maps it with the same three lines `listAllDesks` already uses.
- **The `error.message.includes(...)` guard is not ceremony.** It is what makes an unrecognised `23505` a 500 rather than a false "already taken". `bookings.repository.ts:242` throws on exactly that branch and the reason carries over verbatim.
- **This is the first write `modules/desks` has ever issued, and ADR-004 is what permits it.** ADR-004:32-33 — *"Only the table's owning module may `INSERT`, `UPDATE` or `DELETE` it"* — and follow-up 2 (`:72-73`) names this module as the place: *"When `modules/desks` is built (US-015/US-017), its README is where `desks` is first declared **owned**, and its write paths are the only ones a reviewer should accept for that table."* **§8 makes that README edit a requirement of this story, not a nicety.**
- **No `updated_at` is set.** The column defaults on insert (`0002_desks.sql:23`). US-018's rename is what first has to set it explicitly, and that is US-018's problem.

### 2.4 The one thing most likely to ship wrong

**It is not the uniqueness. It is normalising in the wrong place.**

If `normalizeDeskNumber` is applied only in the browser and not in `deskCreateSchema`, every test passes: the browser always sends `A-07`, the route accepts it, the insert succeeds, and every AC is green. The defect is invisible until a non-browser caller — a future integration, a `curl`, US-018's own edit path, or a tab running an older build — posts `a-07`. Then `0002_desks.sql:30`'s CHECK fires and the administrator gets a **500**, not AC-02's refusal.

**So: the normalisation is on the schema (`.transform`), not in the route handler and not only in the browser** (§3.1). One place, both sides, and the browser's pre-submit validation is a *second call to the same function*, never a second implementation. Test it from the server side with a raw lower-case body (§10) — the one test that can distinguish a correct implementation from a plausible one.

---

## 3. The contract

### 3.1 The request

```ts
// libs/contracts/src/desks.ts — US-017 adds the write side to US-014/US-016's read slice

/**
 * The desk number as it may arrive on a request (US-017/AC-02, AC-03, AC-05; V-08, V-16).
 *
 * `.max(20)` is a guard against a pathological body, NOT a policy — the same distinction
 * `password.ts:38-41` draws for its own `.max(200)`. It bounds the string BEFORE the trim so a
 * megabyte of spaces is refused rather than trimmed.
 *
 * `.transform` then `.refine`, in that order and not the reverse: the parsed OUTPUT is the
 * normalised value, so `parsed.data.deskNumber` is what gets stored and there is no second place
 * to remember to uppercase (US-017 design note §2.4). `a-07` parses to `A-07`; `a-7` does not
 * parse at all.
 *
 * Exported on its own so US-018's edit request reuses it rather than restating the rule.
 */
export const deskNumberSchema = z
  .string()
  .max(20)
  .transform(normalizeDeskNumber)
  .refine((value) => DESK_NUMBER_PATTERN.test(value));

/**
 * `POST /api/admin/desks`'s one legitimate body. `.strict()` — an unknown field is rejected, not
 * ignored, matching every other request schema in this package (`bookings.ts:15-20, :47, :60,
 * :140-153`).
 *
 * ONE field. No `isActive`: BRD-001 gives no way to create an inactive desk and US-017's edge
 * cases refuse to add one — see design note §1.1, which is an OPEN QUESTION for the PO, because
 * SCR-007 ST-01 and the approved hi-fi frames draw a status radio. If that resolves the other
 * way, this schema gains a required `isActive: z.boolean()` and the story gains an AC.
 *
 * No `id`: the database mints it (`0002_desks.sql:14`). A caller-supplied primary key is an
 * attack surface, not a convenience.
 *
 * The field-level `.transform` keeps this a ZodObject, so `.strict()` applies and US-018 may
 * `.extend()` it — unlike `allBookingsQuerySchema`, whose OBJECT-level `.refine` makes it a
 * ZodEffects (`bookings.ts:154-159`).
 */
export const deskCreateSchema = z.object({ deskNumber: deskNumberSchema }).strict();
export type DeskCreateRequest = z.input<typeof deskCreateSchema>;
```

**`z.input`, not `z.infer`, for the request type** — with a `.transform` in the chain the two differ, and the browser builds the *input* shape. Getting this backwards typechecks and then confuses the next reader; one line of comment earns its place.

### 3.2 The response: `201` with a bare `AdminDesk`

**Recommendation: `201` with `adminDeskSchema`'s object, unwrapped.** No new response schema, no envelope.

```ts
res.status(201).json({ id, deskNumber, isActive, bookedAhead: 0 });
```

Three reasons, and the third is the one that pays:

1. **It matches the only create precedent in the codebase.** `POST /api/bookings` answers `201` with a bare `bookingSchema` object (`bookings.router.ts:148`). An envelope here would make the two creates differ for no reason. `{ desks: [...] }` on the `GET` (`admin.router.ts:96`) is a *collection* envelope, which is a different question — US-013 §2.5's criterion.
2. **`bookedAhead: 0` is a fact, not a filler.** The row was inserted microseconds ago and `bookings.desk_id` references it; no booking can exist. It costs nothing and it keeps the body a valid `AdminDesk`.
3. **Which is what makes §6.5 trivial.** The browser parses the `201` with `adminDeskSchema` — the schema it already imports — and hands the result straight to `markAdded`. **No second mapping, no partial type, no `Omit<AdminDesk, 'bookedAhead'>`.** A `{ desk: … }` envelope or a narrower `CreatedDesk` shape would each buy one more type for the browser to unwrap.

`adminDeskSchema` (`desks.ts:13-40`) is **not modified**. `adminDesksResponseSchema` (`:49-53`) is **not modified**. A `deskCreatedResponseSchema` alias is optional sugar; I would not add one.

**`Cache-Control` is not set on the `201`.** `admin.router.ts:95` sets `private, no-store` on the `GET` because the body is a list; a `201` for a resource the caller just created is not cacheable by any intermediary that matters, and adding the header would imply a rule this route does not have. One line of comment, not one line of code.

### 3.3 The duplicate: `409 desk_number_taken`, a new code

```ts
// libs/contracts/src/error.ts — one string added to errorCodeSchema

  // US-017/AC-04 — `desks_desk_number_key` fired (V-08, BR-001.8). The number is already held by
  // a desk, ACTIVE OR INACTIVE: there is no delete, so a deactivated desk still holds its number
  // (US-017 edge cases). Distinct from `desk_already_booked`, which is a BOOKING race on a desk
  // that exists — one character apart in a switch, which is why both are constants.
  'desk_number_taken',
```

**409, via `conflict()`, and the helper already claims this case by requirement ID.** `http/errors.ts:56-63`:

> *"Something else got there first, **or the value is taken (V-04, V-05, V-08, V-10)**… Retryability is carried by the `code`, not by the status class: the screen decides what to offer."*

**V-08 is this story's rule**, spelled out at `BRD-001:271`. The helper was written for it. Not `422 unprocessable`, whose docblock draws the line explicitly (`:65-69`): *"Not a race: the rule says no — 'this desk has 3 upcoming bookings, so it can't be retired'"*. That is US-019's shape; a taken value is `conflict`'s.

**Why a new code rather than reusing `desk_already_booked`** (`error.ts:38`): that code means the `bookings_one_confirmed_per_desk_per_day` index fired — a different table, a different index, a different screen, a different remedy. Reusing it would make SCR-007 ST-04 and SCR-003's booking race indistinguishable to any `switch`.

**One code, not two.** AC-04's *"or `a-01`, or `A-01 ` with trailing whitespace"* is the **same** collision after normalisation, and the server, holding only the normalised value, cannot tell them apart and does not need to (§6.4 shows the browser can and does).

The message: `'That desk number is already in use.'` — for logs and non-browser consumers. **The browser renders its own copy keyed on the `code`**, the discipline `admin.router.ts:120-122` states in these words.

### 3.4 The format refusal, and why it needs no code

`400 invalid_request` via `badRequest`, exactly as every other route in this codebase does it (`admin.router.ts:61-63`, `:112-114`; `bookings.router.ts:122-124`) — generic, with no Zod issue list echoed back (`bookings.router.ts:89`).

**AC-02 says no request is sent, so this branch has no live UI path** — it is a server-side defence, the same status `bookings.router.ts:28-32` records for `REFUSAL_MESSAGE`: *"a server-side defence with no live UI path, not a state a screen renders."* It is still correct API design and still needs a route test (§10).

**No new error code for the format.** `invalid_request` already exists and already means this.

### 3.5 The three outcomes the browser needs

```ts
// apps/ui/src/lib/add-desk.ts — the shape `cancel-booking.ts:29-41` established

export type AddDeskOutcome =
  | { kind: 'ok'; desk: AdminDesk }
  /** US-017/AC-04 — 409 `desk_number_taken`. The ONE refusal with copy of its own (SCR-007 ST-04). */
  | { kind: 'duplicate' }
  /** US-017/AC-07 — transport failure, timeout, 5xx, an unparseable body, or a 400 the browser's
   *  own validation should have caught. `api-client.ts:71` folds 5xx and `:84` an unrecognisable
   *  error body into `unavailable`, so all four arrive here as one, which is exactly ST-07's
   *  "server error, timeout or lost connection". */
  | { kind: 'failed' };
```

Three, not four: unlike `cancel-booking.ts`, there is no second server-answered refusal to separate from a transport failure, because AC-07 explicitly groups them. **A `400` maps to `failed`, not to a fourth kind** — reaching it means the browser's own validation was wrong, which is a defect to log, not a state to design.

---

## 4. Routing — a dialog on `/admin/desks`, and no new address

**This is the question the story does not ask and SCR-007 forces, and it is the one I would not argue hardest about.**

### 4.1 The evidence, which is one-sided once the frames are opened

SCR-007's **Surface** field (`:9`) says `/admin/desks/new` and `/admin/desks/:id/edit`. Everything else in the same file, and every approved frame, says otherwise:

- **The Layout section (`:28`) is an explicit correction, dated:** *"Rendered as a modal over SCR-006 at ≥768px and as a **bottom sheet** below it… **Corrected 2026-09-10:** this sentence said 'full-screen view', which contradicted both the approved wireframe and the popup rule every other overlay in this design follows."*
- **The designer handoff (`:156`) is categorical:** *"**Every frame is drawn over SCR-006**, dimmed, because that is the screen this form opens from and a form card on an empty ground reads as a page rather than as an overlay."*
- **The frames themselves confirm it structurally**, which is stronger than any sentence: `HF / SCR-007 · ST-01 · 1280` (node `225:3`) contains the full SCR-006 tree — `Sidebar`, `Page header`, `Result summary`, four desk rows — then a `Scrim` (`225:19`) and a `Desk form` instance (`225:20`). The 360 frame (`225:148`) is identical with the form bottom-anchored full-width. **A route would render SCR-006 or the form, never both.**
- **ST-06 has no form at all** (`226:3053`): it is SCR-006 with `Row · A-12 (just added)` sorted between `A-02` and `B-03`, the summary line recounted, and a `Toast`. **No scrim.** With a dialog that is `setState(undefined)` plus §6.5's insert. With a route it is a navigation, a refetch, and a toast threaded through navigation state.
- **The `Desk form popup` master's own description** (node `224:17165`) calls it a popup and describes the 360 treatment as *"the bottom-sheet treatment every popup in this file uses — a strip of the dimmed screen stays visible above it."*

**The Surface line is stale — it is the one sentence in SCR-007 that the 2026-09-10 correction did not reach.** It is not an architecture decision to reverse; it is a spec line to fix. **Open item 3**, for `/ux`.

### 4.2 Recommendation and the rejected alternatives

**Recommendation: no new route. `Desks.tsx` owns the dialog's state, opened by the header `Add desk`, dismissed by Cancel / Escape / the close icon / a successful save.** `apps/ui/src/routes.tsx` is **not modified**.

| Option | Verdict |
| --- | --- |
| **Real routes `/admin/desks/new`** (and `/admin/desks/:id/edit`) | **Rejected.** Contradicts every approved frame (§4.1). It also breaks two stated requirements outright: SCR-007:111 requires focus to return *"to the control that opened it — **Add desk** in the header, or that row's **Edit**"*, and a route change unmounts the opener, turning a `ref` into a mount-ordering problem; and SCR-007:28's *"a strip of the screen it came from visible"* is not expressible when the parent is unmounted |
| **A route that renders `<Desks>` plus the dialog** (a layout route with an outlet) | **Rejected, and it is the sophisticated wrong answer.** It buys a deep link nobody asked for and pays with a second source of truth for "is the dialog open": the URL and `Desks`'s own state. `use-admin-cancel-dialog.ts` deliberately holds one |
| **Same-screen dialog, local state** (recommended) | Third application of a pattern already in the tree twice. Matches every frame. Focus restoration is a `ref`. ST-06 is a state transition, not a navigation |

**`routes.tsx:9-11` does not decide this, and a reviewer who reaches for it should be told so.** Its rule — *"a route with no screen behind it is a 404 that looks like a bug"* — forbids **stubbing** an address. US-016 §6.1 applied it to a control whose destination did not exist. Here the destination *could* exist: this story builds the screen. **The rule is silent, and the design is not.** Saying that out loud is worth a line in the PR, because US-016's note leaned on that rule hard and a reviewer will expect it to cut the same way twice.

**Third application, not first, which is why §8 says no ADR.** `screens/my-bookings/use-cancel-dialog.ts` (US-011) and `screens/all-bookings/use-admin-cancel-dialog.ts` (US-015) are both admin-or-owner actions opened from a list row with no route change. `use-admin-cancel-dialog.ts:14-31` is the shape to copy: a state object holding the subject plus `busy` plus an `outcome`, and `open` / `confirm` / `dismiss`.

### 4.3 The forward constraint this places on US-018 — carry it explicitly

**US-018 adds no route either.** It reuses this dialog in edit mode: SCR-007's own components table (`:102`) lists one `dialog` for ST-01–ST-07, and the `Desk form popup` master holds add and edit as **variants of one component**, not two. US-018's author must read that as a contract rather than infer it. **Open item 4**, routed the way US-016 §2.4 routed its own predicate constraint to US-019.

### 4.4 The honest cost

There is no shareable URL for "add a desk", and browser Back does not dismiss the dialog (Escape and Cancel do — SCR-007:111 names those two and not Back). Both are true of `ConfirmDialog` today and neither has been raised. If the PO wants a deep link, that is a Gate 1 change with an AC, not a delivery decision.

---

## 5. The dialog — extract the shell; `ConfirmDialog` composes it

### 5.1 What exists, and what it cannot do

**A shared dialog primitive already exists**: `apps/ui/src/components/confirm-dialog/ConfirmDialog.tsx`. It carries everything the hard parts need — a scrim overlay (`:108`), focus capture and restoration (`:63-70`), a focus trap on Tab (`:84-101`), Escape suppressed while `busy` (`:77-80`), a header close icon (`:124-132`), an in-dialog `Alert` for errors (`:136-140`), and `confirm-dialog.css:12-31, :106-118`'s **exact** bottom-sheet-below-768 / centred-480-above treatment that AC-09 asks for.

It also cannot host SCR-007's form, for five reasons that are requirements rather than preferences:

| ConfirmDialog today | SCR-007 needs |
| --- | --- |
| `role="alertdialog"` (`:112`), asserted by `ConfirmDialog.spec.tsx:209` | `role="dialog"` — a form is not an alert, and `alertdialog` tells a screen reader to expect a message, not a field |
| `<Button variant="danger">` hardcoded (`:147`) | the primary green `Add desk` (frame `225:20`, `--c-action` / `--c-action-label`) |
| `body: ReactNode`, no form element | `<form onSubmit>` — SCR-007:111, *"Enter saves from the field"* |
| focuses the dialog itself (`:65`) | focuses the **field** (SCR-007:59, and the ST-01 frame draws the field in `state="Focus"`) |
| a fixed `confirmLabel` | **`Add desk`** in ST-01/03/04/05, **`Try again`** in ST-07 — verified on frame `225:19361` |
| `id="confirm-dialog-title"` hardcoded (`:114, :118`) | a `useId()` id, since two dialog *kinds* now exist |

### 5.2 Recommendation: `components/dialog/Dialog.tsx`, composed by both

**Recommendation: extract the shell into `apps/ui/src/components/dialog/Dialog.tsx` + `dialog.css`, refactor `ConfirmDialog` to compose it behaviour-preservingly, and build `screens/desks/DeskFormDialog.tsx` on it too.**

```ts
export interface DialogProps {
  title: string;
  /** `alertdialog` for a confirmation (ConfirmDialog's, asserted by its own spec); `dialog` for a
   *  form (SCR-007). Defaults to `dialog` — the safer of the two for a new caller. */
  role?: 'dialog' | 'alertdialog';
  children: ReactNode;
  /** The footer's contents, right-aligned above the `--c-border` rule. Each caller owns its own
   *  buttons: the labels, the variants and the order are SCR-specific and a `confirmLabel` prop
   *  is what makes a shell start growing a second component's vocabulary. */
  footer: ReactNode;
  /** Escape and the close icon are suppressed while true (SCR-002 ST-08, SCR-007 ST-05). */
  busy?: boolean;
  /** Focused on open. Omitted -> the dialog itself, which is ConfirmDialog's behaviour today. */
  initialFocusRef?: React.RefObject<HTMLElement>;
  onDismiss: () => void;
}
```

**Two reasons it is the right shape, and neither is mine:**

1. **Figma already models it this way, by name.** The `Desk form popup` master's description (node `224:17165`): *"built on the shared **Dialog header** (76px) and **Dialog footer** so the chrome cannot drift."* Two component sets, one shared chrome — which is exactly `Dialog` + two callers, not one component with a `mode` prop.
2. **`ConfirmDialog.tsx:1-19` already states the anti-duplication policy this applies.** It was *"built here as a generic, `bookings`-free primitive… because no dialog/modal component existed anywhere in `apps/ui/src/components` before this story — US-011 needs the identical dialog for its own cancel flow and **extends this one rather than reconciling two copies later**."* US-017 is the third caller. Building a second focus trap now is the reconciliation that docblock exists to prevent.

**The behaviour-preservation contract, stated so it is checkable:** `ConfirmDialog.spec.tsx` is **not edited**, and its 200-plus lines passing unchanged is the evidence that US-007/AC-07, US-011 and US-015 are untouched. **A diff to `ConfirmDialog.spec.tsx` in this PR is a review finding** — if the refactor needs the test changed, the refactor is wrong. The one visible change is the title element's `id`, which becomes a `useId()` value; nothing asserts it (`ConfirmDialog.spec.tsx` queries by role and name throughout).

| Option | Verdict |
| --- | --- |
| **Extend `ConfirmDialog` with ~5 props** (`role`, `confirmVariant`, `onSubmit`, `initialFocusRef`, a variable footer) | **Rejected.** Every prop weakens the name: a component called `ConfirmDialog` whose `role`, confirm variant and footer are all caller-supplied is a `Dialog` that has not been renamed. `components/README.md:3-4` makes props a contract, so five of them is five contract changes rather than one |
| **A screen-private dialog under `screens/desks/`** | **Rejected.** A second focus trap, a second Escape handler, a second scrim and a second copy of `confirm-dialog.css:12-31, :106-118`'s breakpoint. It is the drift `ConfirmDialog.tsx:1-19` names, and AC-09 would then be satisfied by a copy of CSS that nothing keeps in step |
| **Extract `Dialog`; both compose it** (recommended) | Matches Figma's own decomposition, matches the component's own stated intent, AC-09 comes for free and correct, and `ConfirmDialog.spec.tsx` staying green is a real proof rather than a hope |
| **Extract `Dialog`, leave `ConfirmDialog` alone for now** | **The named fallback**, if the human would rather US-017's PR not touch three merged stories' shared component. It leaves two dialog implementations in `components/`, which I would want recorded as a follow-up issue in the same breath, not as a `// TODO` |

**Open item 5** carries the fallback, because it is a scope call and scope is the human's.

### 5.3 AC-09 is already solved, and that is worth knowing before anyone measures anything

`confirm-dialog.css` (moving to `dialog.css`) is **mobile-first**: the sheet is the default (`:12-31` — `align-items: flex-end`, `width: 100%`, `border-radius: var(--r-lg) var(--r-lg) 0 0`, `--shadow-sheet`) and the centred `max-width: 480px` card is the `@media (min-width: 768px)` override (`:106-118`). That is SCR-007's *"modal ≥768px, bottom sheet below"* and the designer handoff's *"at 768 and 1280 the card is a centred **480px** modal"*, already built and already shipped in US-011.

**So AC-09 needs no new CSS and no measurement.** The keyboard clearance SCR-007:116 records (a 290px keyboard in a 780px viewport leaving the confirm action 16px clear) was measured in Figma against a **420px** add-mode sheet — and frame `225:148`'s `Desk form` instance is exactly `360 × 420`. The implementation matches if the sheet is not given a `min-height` and the body is not given a fixed height. **Say that in the PR**: AC-09 is satisfied by *not* adding CSS, which is an easy thing for a reviewer to mistake for an omission.

jsdom performs no layout, so AC-09's test is a **stylesheet assertion** — the honest proxy US-016 §7.1 used for its own breakpoints, made once here rather than re-derived.

### 5.4 `TextField` gains `helper` — the second shared-component change

SCR-007's components table (`:103`) specifies the `text-field` as carrying *"label, **helper text**, error slot and invalid styling"*. `TextFieldProps` (`TextField.tsx:16-32`) has `label`, `error`, `invalid` and `trailing` — **no helper**.

**Recommendation: add `helper?: ReactNode`, rendered after the error paragraph** (the frame's order is field → error → helper: `225:750` shows *"Use one letter, a dash and two digits — like A-01."* above *"One letter, a dash, two digits — like A-01. The letter groups desks into zones on the booking screen."*), **and included in the composed `aria-describedby`.**

**Rendering the helper as loose screen-private markup beside the field is the tempting alternative and it is unsafe, for a reason in the file.** `TextField.tsx:61-63`:

```tsx
aria-invalid={isInvalid ? true : undefined}
aria-describedby={error ? messageId : undefined}
{...rest}
```

`{...rest}` is **last**, so a caller-supplied `aria-describedby` silently **overwrites** the error-message association — and `messageId` comes from an internal `useId()` (`:35-36`), so the caller cannot compose the two. A screen-private helper would therefore be either unassociated (failing SCR-007's own a11y intent) or associated at the cost of AC-02's error announcement. **One additive prop fixes it inside the component, where the id lives.**

While there: `maxLength={4}` (SCR-007:59) and `autoCapitalize="off"` (`:115`) both pass through `...rest` as ordinary input attributes. **No prop is needed for either**, and adding one would be the speculative generality `Button.tsx:4-6` warns about.

---

## 6. The browser

### 6.1 Where the parts live

**Recommendation — screen-private under `apps/ui/src/screens/desks/`:**

```
DeskFormDialog.tsx      the form: ST-01, ST-03, ST-04, ST-05, ST-07
use-add-desk-dialog.ts  the state machine — `use-admin-cancel-dialog.ts`'s shape
```

`components/README.md:6` is the standing rule — *"A component private to one screen belongs in that screen's folder, not here"* — and this form is SCR-007's, which is SCR-006's overlay and nothing else's. The *shell* is shared (§5.2); the *form* is not. US-018 reuses it from the same folder.

`apps/ui/src/lib/add-desk.ts` is the fetcher, beside `cancel-booking.ts`, because `lib/` is where this codebase puts the `ApiClient`-to-outcome adapters (`cancel-booking.ts`, `fetch-desks.ts`). **One consumer today is enough for `lib/`** — that is where the layer lives, not an extraction — whereas `components/` has the two-consumer bar (`lib/cancel-booking.ts:4-6`, applied by US-015 §5.1 and US-016 §5.3).

### 6.2 The state machine, and what it copies

```ts
// apps/ui/src/screens/desks/use-add-desk-dialog.ts

export interface AddDeskDialogState {
  busy: boolean;
  /** `duplicate` is ST-04 (a warning Alert with a Title, ABOVE the field); `failed` is ST-07
   *  (a danger Alert, and the confirm action's label becomes "Try again"). Two renderings,
   *  because AC-04 and AC-07 are two ACs — collapsing them is the likeliest slip (§6.4). */
  outcome?: 'duplicate' | 'failed';
  /** ST-04's case sentence appears ONLY when case caused the collision (SCR-007:77). Computed
   *  here, not on the server (§6.4). */
  collidedOnCaseOnly: boolean;
}
```

`open()` / `submit(raw)` / `dismiss()`, with `use-admin-cancel-dialog.ts:39, :45-49`'s **synchronous `inFlight` ref** checked and set before any state read. `use-my-bookings.ts:137-140` states why the ref rather than the state: *"checked and set before any state read, so a second regain landing while a refresh is still in flight is refused regardless of whether React has re-rendered yet."* That sentence is AC-06's *"exactly one desk is created"*.

### 6.3 ST-01 — the copy, verbatim from the frames

Every string below is read off `HF / SCR-007 · ST-01 · 1280` (node `225:20`), not from the written spec. **Copy lives in `screens/desks/copy.ts`**, beside US-016's (`copy.ts:9-32`), never derived from a server message — the rule that file already states (`:1-6`).

| Element | String |
| --- | --- |
| Dialog title | `Add desk` |
| Field label | `Desk number` |
| Helper | `One letter, a dash, two digits — like A-01. The letter groups desks into zones on the booking screen.` |
| Cancel | `Cancel` |
| Confirm (ST-01/03/04/05) | `Add desk` |
| Confirm (**ST-07**) | **`Try again`** |
| Close icon | `aria-label="Dismiss"` — `ConfirmDialog.tsx:127`'s own string, and the same `icon-close.svg` asset (node `11:50`) |

The dialog's accessible name is `Add desk` (SCR-007:114), which the `Dialog` shell's `aria-labelledby` gives.

**One fidelity note that is not an AC.** `apps/ui/src/assets/icon-plus.svg` was added by US-016 (§4.3) and **is imported by nothing today** — verified, no match in `apps/ui/src`. SCR-006's handoff (`:226-229`) records the plus in **Add desk** being rebound to `--c-action-label`, so the header button is its intended first consumer. This story rewrites that button (`Desks.tsx:46-53`) and can wire it in one import, with no new `Button` prop — US-016 §4.3's argument: `button.css`'s `gap: var(--s-8)` and `currentColor` give it for free. **Recommend doing it and naming it in the PR as a fidelity fix rather than an AC**, so a reviewer does not go looking for the criterion.

### 6.4 ST-03, ST-04, ST-07 — three refusals, three different renderings

**Getting these three confused is the most likely UI defect in the story**, because two of them are Alerts and two of them mark the field.

| State | Where | Rendering |
| --- | --- | --- |
| **ST-03** format (AC-02) | **inside** `TextField` | The field's own `error` prop — the message beneath the input with `TextField.tsx:72-83`'s icon. **No Alert.** Two messages: `Give the desk a number.` when empty or whitespace-only, `Use one letter, a dash and two digits — like A-01.` when the shape is wrong (SCR-007:71; the frame draws the second, `225:750`). **The confirm action stays enabled** (SCR-007:71) — do not disable it while invalid |
| **ST-04** duplicate (AC-04) | **above** the field | `<Alert tone="warning" title={…}>` — verified `tone="Warning"`, `showTitle`, **`showActions={false}`** on frame `225:18658`. Title: `A-01 is already taken by another desk.` Body: `Desk numbers have to be unique, and capitals don't make a difference — a-01 and A-01 count as the same.` **The field also takes the danger border and the invalid icon**, and keeps `a-01` exactly as typed |
| **ST-07** failure (AC-07) | **above** the field | `<Alert tone="danger">`, no title, no actions: `We couldn't save that just now. Try again.` The field is **normal**, not invalid — nothing is wrong with the entry. The **footer's confirm becomes `Try again`** (frame `225:19361`) |

**`Alert` is not modified.** `AlertProps.title` already exists and its docblock says who it was for (`Alert.tsx:21-22`): *"Leads with the fact. Off by default — SCR-007 ST-04 is what wanted it (PRIN-3)."* US-017 is the caller that docblock was written for. `live` defaults to `'assertive'` (`:30`), which is SCR-007:114's *"announced once, leading with the colliding number."* **A new prop on `Alert` in this PR is a review finding.**

**The case sentence is conditional, and the browser is the only place that can decide it.** SCR-007:77: *"The case sentence appears only when the collision was case-insensitive rather than exact, because otherwise it explains something that did not happen."* The server holds only the normalised value and cannot tell. The browser holds both:

```ts
const collidedOnCaseOnly = raw.trim() !== normalizeDeskNumber(raw);
```

Pure, synchronous, no extra request, no extra column, no extra field on the wire. **This is why §2.3's "no pre-check SELECT" costs nothing**: the one piece of information the refusal needs beyond the code is information the server never had.

### 6.5 ST-06 — insert in place, never refetch

**Recommendation: `lib/use-desks.ts` gains `markAdded(desk: AdminDesk)`, inserting the row in `deskNumber` order. `Desks.tsx` does not re-fetch.**

The precedent is written down and its reasoning transfers exactly. `use-my-bookings.ts:44-50`, on `markCancelled`:

> *"…no `retry()`, no `status: 'loading'` transition. The server already confirmed the outcome; a refetch here would re-announce… over ST-10's own toast, **flash skeletons over a list the employee is reading**…"*

`useDesks` sets `{ status: 'loading' }` at the top of every effect run (`use-desks.ts:31`), so a refetch would blank the whole table to skeletons after a successful add — which is not what ST-06's frame draws (`226:3053`: the full list, with `Row · A-12 (just added)` between `A-02` and `B-03`, and a Toast).

- **`Desks.tsx:60-63`'s `retryKey` device stays exactly as it is.** It is ST-04's **Try again** and nothing else. Reusing it for the post-add refresh is the wrong tool and produces the skeleton flash above.
- **Sorted insert, and a plain string comparison is correct here.** `bookings.repository.ts:53-56` already records why: `desk_number` is a fixed-width `A-01` format, so lexicographic order **is** the intended total order — *"AC-05's total order over the fixed-width `A-01` format (`zones.ts` relies on this same property independently)"*. AC-01's *"appears in the inventory in number order"* is then proven client-side without a round trip.
- **Additive for `AllBookings`.** `UseDesksResult` becomes `UseDesksState & { markAdded }`, the shape `UseMyBookingsResult` already has (`use-my-bookings.ts:37-57`). `AllBookings.tsx:122-123, :183` reads only `.status` and `.desks`. **`AllBookings.tsx` is not modified.**
- **`lib/**` is not `components/**`.** Per US-015 §5.1 and US-016 §5.3's tier note, this is Medium, not the Complex shared-component surface — the tier is already Complex for four other reasons (§0).
- **The summary line recounts for free.** `summaryLine` is pure over the array (`copy.ts:58-63`), so ST-06's *"41 desks"* needs no code, and `Desks.tsx:74-76`'s `role="status"` announces it.

**The toast** is in-page local state, not navigation state — `MyBookings.tsx:107-110, :142`'s `cancelledMessage` device, which its own comment distinguishes from the two navigation-carried toasts above it. Copy, verbatim from node `226:3236`:

```ts
/** SCR-007 ST-06. Names the effect on BOOKABILITY, not just the outcome — the fact everyone else
 *  in the office cares about (PRIN-5, the reasoning `cancelledToast` states in my-bookings). */
export function deskAddedToast(deskNumber: string): string {
  return `Desk ${deskNumber} added. People can book it from today.`;
}
```

**`Toast` is not modified** (`Toast.tsx:15-30`): no dismiss, no timer, no queue, `role="status"`.

**Focus lands on the new row** (SCR-007:90 — *"so on a small screen the new desk is not somewhere off-screen"*). `DeskInventoryRow` already carries the hook: `data-desk-row={desk.id}` on both the `<tr>` (`DeskInventoryRow.tsx:87`) and the `<li>` (`:103`). Focus the first focusable match after the state settles. **The dual-tree device (US-016 §7.1) means two elements carry the same attribute**; the hidden one is `display: none` and therefore not focusable in a real browser, so calling `.focus()` in document order lands on the visible tree. jsdom cannot tell them apart, so the honest assertion is *"focus moved to an element carrying `data-desk-row={newId}`"*, not *"to the table row"* — say so in the test, or a later reader will think it is a weak assertion rather than a deliberately scoped one.

### 6.6 AC-06 at the pixel

`Button`'s `busy` keeps the label and adds a spinner (`Button.tsx:26-32`, `:68-69`) and sets `disabled || busy` (`:62`), *"so the browser stops Enter and Space too"*. That is *"shows busy with its label kept"* and *"does not shift the layout"*, already built and already asserted for SCR-001. The `Desk form popup` master confirms the geometry is unchanged in the disabled/busy variants (*"Geometry is unchanged, so ST-08's 'no layout shift' still holds"*).

While busy: the field is **read-only** (frame `225:19190` shows the quiet fill — `TextField`'s `readOnly` already renders `field--readonly`, `TextField.tsx:42`), **Cancel is disabled**, the close icon is disabled, and Escape is suppressed — all four of which the `Dialog` shell's `busy` prop gives, because `ConfirmDialog.tsx:77-80, :129, :143` already does exactly this.

---

## 7. What this story must NOT build — the review instruction

Mirroring US-016 §6.2, because the same three stories are still queued behind this one.

**US-018's (edit a desk number):**
- No `/admin/desks/:id/edit` route, and no route of any kind (§4.3).
- No **edit mode**: no `Edit desk A-01` title, no prefilled-and-selected field, no `Save changes` label, no `PATCH`/`PUT` endpoint, no `deskUpdateSchema`.
- **No ST-02**, and specifically **no upcoming-bookings warning note.** SCR-007:126 routes the real decision to *"Open question 3 on SCR-006"*, which is not this story's.
- `DeskInventoryRow.tsx:55-58`'s **Edit** button stays `disabled` with its reason, and `DeskInventoryRow.spec.tsx:78-87` stays exactly as it is.

**US-019's (take a desk out of service):**
- No activate/deactivate endpoint, no deactivation block, no `bookedAhead` gate.
- No SCR-006 **ST-05 – ST-10**, no `Dialog State=Blocked`.
- `DeskInventoryRow.tsx:59-62`'s toggle stays `disabled` with its reason.

**Nobody's:**
- **No migration** (§0.2, §2.1). No `citext`, no generated column, no functional index, no `updated_at` trigger.
- **No delete.** US-016/AC-09 forbids it and this story's own edge case explains why: *"the deactivated desk still holds the number… numbers are never released. Deliberate — bookings reference desks."*
- **No search or filter parameters on `GET /api/admin/desks`.** US-016/AC-09 settled it and `admin.router.ts:88-90` records the settlement.
- **No status radio** until open item 1 says otherwise (§1.1). And if it does, it arrives with an AC.
- **No token change, no `Alert` prop, no `Button` prop, no `Toast` prop, no `EmptyState` prop** (§0.2, §6.4, §6.6).
- **No global `sr-only` utility.** `all-bookings.css:201-206` records the convention — each surface defines its own — and `desks.css:177-180` already has `.desks__visually-hidden` for this screen.
- **No change to `data-refresh.ts`, `AppShell.tsx`, `eslint.config.mjs`, `http/app.ts`, or `apps/api/src/http/middleware/**`.**
- **No `apps/api/src/domain/` file** (§5 of the contract discussion — see §8's edit 3).

---

## 8. No new ADR — five consequential edits instead

**Recommendation: no ADR.** The test US-013 §8 through US-016 §8 applied: *does the decision bind work beyond this story, with a rejected alternative a future author would otherwise re-litigate?*

| Candidate | Verdict |
| --- | --- |
| **No migration; the existing CHECK makes the plain unique index sufficient (§2.1)** | **No ADR.** It is a fact about a file, not a decision. It belongs in the repository docblock and the module README, where the person about to write the migration will read it |
| **The format regex and normaliser in `libs/contracts` (§5)** | **No ADR.** ADR-002:76-79 decides it for *this field by name*, and `index.ts:4-8` records `evaluatePasswordPolicy` as the same call already made. Third application |
| **`409 desk_number_taken` (§3.3)** | **No ADR.** `http/errors.ts:56-63` already claims V-08 by ID. A story that consumes a decision does not need one |
| **A dialog on the parent route rather than an address (§4)** | **The one real candidate, and my answer is still no — but this is where I would not argue hard.** It binds US-018, SCR-008's forms and SCR-006's own ST-05–ST-08 dialogs, and a future author reading SCR-007:9's `/admin/desks/new` will absolutely re-litigate it. Against: it is the **third** application of a pattern `use-cancel-dialog.ts` and `use-admin-cancel-dialog.ts` already establish, and the real defect is one stale line in a screen spec, which a `/ux` correction fixes more cheaply than an ADR. **If you expect SCR-008 to raise it again and want it held by a document rather than by §4 plus a spec fix, write it now rather than at the third one.** Open item 6 |
| **Extracting `Dialog` (§5.2)** | **No ADR.** `ConfirmDialog.tsx:1-19` already carries the policy *and* its rejected alternative, and Figma's own decomposition agrees. Second application of US-010's *"one component, not a sibling"* |

**Five consequential edits, US-013's device, each required by something that already exists:**

1. **`apps/api/src/modules/desks/README.md`** — **ADR-004 follow-up 2 (`:72-73`) makes this mandatory, not optional**: *"When `modules/desks` is built (US-015/US-017), its README is where `desks` is first declared **owned**, and its write paths are the only ones a reviewer should accept for that table."* `:5-7` currently says the table is owned *"once US-017 … build this module"* in the future tense and that *"no code writes it; rows arrive via a manual dev seed."* Both sentences stop being true in this PR. Record: the write path, the `23505` mapping, the normalisation contract (the repository receives an already-normalised value), and the fact that `0002_desks.sql:30` is what makes `:35` sufficient.
2. **`apps/api/src/modules/desks/desks.repository.ts:5`** — *"desk WRITES will land here once US-015/US-017 build them."* They have landed. US-015 is now *Cancel a booking on behalf*; the writer is US-017. Rewrite the prediction as the record. (US-016 §8 flagged this same stale numbering and the file still carries it.)
3. **`apps/api/src/domain/README.md:10`** — *"Is this desk number valid, and what is its normalized form? (BR-001.4, BR-001.8)"* lists this rule under `domain/`, and §5 puts it in `libs/contracts` instead. **The line has to be corrected or it becomes false**, and the correction is short because the precedent is already in the tree: the booking-window rules split the same way, with `refusalFor`/`lastBookableDate`/`addDays` imported from `@desk-booking/contracts` (`bookings.service.ts:10-21`) and only the clock-dependent `officeToday` living in `domain/booking-window.ts` (`:21`). The desk-number rule has **no** clock-dependent part, so it lives wholly in contracts and `domain/` gains no file. Say that, rather than deleting the line.
4. **`supabase/migrations/0002_desks.sql:5-6`** — the header says *"US-015/US-017 (admin adds and renames a desk) are what will write it; nothing in US-006 does."* A migration's text is history and I would normally leave it, but this one names a story that no longer means what it says. **My recommendation is to leave the SQL untouched and record the correction in the module README instead** — a migration file that has been applied is a record of what ran, not a document to maintain. Flag it in the PR so a reviewer sees the choice was made rather than missed.
5. **`libs/contracts/src/desks.ts`'s file docblock (`:1-5`)** — it says *"US-014's slice — `GET /api/admin/desks`"*. The file now holds a write contract and a shared rule. One sentence.

**`ADR-004-table-ownership.md` is not edited** in this PR, although `:41` and follow-up 2 carry the same stale `US-015/US-017` reference. A story PR is the wrong vehicle for editing an accepted decision's text — **US-016 open item 7, still open, still the human's.**

`ai/standards/api-standards.md` **does** want a row for `desk_number_taken`, unlike US-016 which added no code. Check whether the file tabulates codes; if it does, this story adds the row.

---

## 9. File placement

**New — `libs/contracts`**

```
libs/contracts/src/desks.ts       + DESK_NUMBER_PATTERN, normalizeDeskNumber,
                                    deskNumberSchema, deskCreateSchema  (§2.2, §3.1)
libs/contracts/src/error.ts       + 'desk_number_taken'                  (§3.3)
libs/contracts/src/desks.spec.ts  the normaliser's idempotence + AC-02's table (§10)
```

**New — `apps/ui`**

```
apps/ui/src/components/dialog/Dialog.tsx        (+ .spec.tsx)  the shell (§5.2)
apps/ui/src/components/dialog/dialog.css                       MOVED from confirm-dialog.css (§5.3)
apps/ui/src/screens/desks/DeskFormDialog.tsx    (+ .spec.tsx)  ST-01, ST-03, ST-04, ST-05, ST-07
apps/ui/src/screens/desks/use-add-desk-dialog.ts (+ .spec.ts)  AC-06's guard (§6.2)
apps/ui/src/lib/add-desk.ts                     (+ .spec.ts)   three outcomes (§3.5)
```

**Modified — `apps/api`**

```
apps/api/src/modules/desks/desks.repository.ts       + insertDesk, InsertDeskOutcome; docblock (§2.3, §8)
apps/api/src/modules/desks/desks.repository.spec.ts  the recorded insert; the 23505 mapping; the 23514 throw
apps/api/src/modules/desks/desks.service.ts          + createDesk; outcome mapping (§2.3)
apps/api/src/modules/desks/desks.service.spec.ts     AC-01, AC-03, AC-04
apps/api/src/modules/admin/admin.router.ts           + POST /desks (§3)
apps/api/src/modules/admin/admin.routes.spec.ts      a NEW describe; the four existing stubs must gain insertDesk (§10)
apps/api/src/modules/desks/README.md                 ADR-004 follow-up 2 — REQUIRED (§8)
apps/api/src/domain/README.md                        :10 — where the rule actually landed (§8)
```

`apps/api/src/composition.ts` is **not modified**: `createDesksService` already receives the repository at `:108` and the router already receives the service at `:117`. The new method rides the existing wiring — worth one line in the PR, because a reviewer will look for the composition diff and its absence is correct.

**Modified — `apps/ui`**

```
apps/ui/src/components/text-field/TextField.tsx      + helper; composed aria-describedby (§5.4)
apps/ui/src/components/text-field/TextField.spec.tsx the helper's association
apps/ui/src/components/confirm-dialog/ConfirmDialog.tsx  composes Dialog — BEHAVIOUR-PRESERVING (§5.2)
apps/ui/src/components/confirm-dialog/confirm-dialog.css shrinks to what is not shell
apps/ui/src/lib/use-desks.ts                         + markAdded; UseDesksResult shape (§6.5)
apps/ui/src/lib/use-desks.spec.ts                    markAdded's sorted insert
apps/ui/src/screens/desks/Desks.tsx                  AddDeskButton enabled + opens; the dialog; the toast (§6)
apps/ui/src/screens/desks/Desks.spec.tsx             the forcing test DELETED; AC tests added (§10)
apps/ui/src/screens/desks/copy.ts                    + the SCR-007 strings and deskAddedToast (§6.3, §6.5)
apps/ui/src/screens/desks/copy.spec.ts               the new strings
apps/ui/src/screens/desks/desks.css                  the header button, if the plus icon lands (§6.3)
```

**Modified — framework**

```
inception/specs/index.md                 the US-017 row
knowledge/traceability/manifest.json     US-017 tests[] — and see §10's note 1, which is a CI rule
ai/standards/api-standards.md            the desk_number_taken row, if that file tabulates codes
```

### 9.1 Not modified, and worth saying so

- **`supabase/migrations/**`** — §0.2, §2.1. Protected path. **A migration in this PR is a review finding**, and §2.1 is the argument to rebut before writing one.
- **`inception/design/tokens.css`** — §0.2. Every role the frames bind is already consumed by `Alert`, `Toast`, `TextField`, `Button` or `confirm-dialog.css`. Protected path.
- **`apps/api/src/http/middleware/**` and `http/app.ts`** — §0.2. `requireAdmin` at `app.ts:78` predates the route and `admin.router.ts:1-17` states the inheritance.
- **`apps/ui/src/routes.tsx`** — §4. **The single most likely wrong diff in this PR**, because SCR-007:9 asks for it in writing. A route here is a review finding, and §4.1's frame evidence is the rebuttal.
- **`apps/api/src/composition.ts`** — the wiring already exists (`:108`, `:117`).
- **`apps/ui/src/components/alert/Alert.tsx`, `toast/Toast.tsx`, `button/Button.tsx`, `empty-state/EmptyState.tsx`** — §6.4, §6.5, §6.6. Composed as they are. **A new prop on any of them is a review finding**; `Alert.title` was already added for this exact state.
- **`apps/ui/src/components/confirm-dialog/ConfirmDialog.spec.tsx`** — §5.2. Its being untouched and green **is** the evidence the refactor preserved US-007/AC-07, US-011 and US-015.
- **`apps/ui/src/screens/all-bookings/**`** — §6.5. `useDesks`'s new member is additive and `AllBookings.tsx:122-123, :183` reads only `.status` and `.desks`.
- **`apps/ui/src/screens/desks/DeskInventoryRow.tsx` and `DeskInventoryRow.spec.tsx`** — §7. **This story must not touch these files.** `DeskInventoryRow.spec.tsx`'s forcing test (`:78-87`) is about **Edit** and **Deactivate**, which are US-018's and US-019's. Only `Desks.spec.tsx`'s Add-desk assertions are this story's.
- **`apps/ui/src/lib/data-refresh.ts`, `eslint.config.mjs`, `apps/api/src/domain/*.ts`, `apps/ui/src/components/app-shell/AppShell.tsx`** — §0.2, §7.
- **`libs/contracts/src/desks.ts`'s `adminDeskSchema` and `adminDesksResponseSchema`** — §3.2. The response shapes are reused, not widened.

**Four protected paths are in the "not modified" list.** A story that adds a write endpoint, a required request field and an error code while touching no migration, no middleware, no token and no lint rule is the shape to aim for, and it is worth stating in the PR the way US-013 through US-016 each did.

---

## 10. Test placement per AC

QA's own flags are the organising constraints: **AC-02 deserves a table-driven test**, **AC-04 and AC-05 are the same rule from two sides and the `a-01` case is the one that matters**, and **AC-03 must assert storage *and* display, not just that the save succeeded.**

| AC | Proven where | Level |
| --- | --- | --- |
| **AC-01** | `desks.repository.spec.ts` — the recorded insert is `.from('desks').insert({ desk_number })` and **names no `is_active`** (the default at `0002_desks.sql:19` is the AC); `desks.service.spec.ts` — a valid number yields `{ kind:'ok', desk: { isActive: true, bookedAhead: 0 } }`; `admin.routes.spec.ts` — `201` with that body; `Desks.spec.tsx` — after a successful add the new desk appears **in number order**, not appended (§6.5) | **repository + service + route + component** |
| **AC-02** | `libs/contracts/src/desks.spec.ts` — **the table-driven case QA asked for**: `''`, `'   '`, `'A-1'`, `'AA-01'`, `'A-001'`, `'Window seat 3'`, `'1-01'`, `'A-0'`, `'a-1'` all fail `deskCreateSchema`; `'A-01'`, `'a-07'`, `'Z-99'`, `'  b-12  '` all pass. `DeskFormDialog.spec.tsx` — an invalid entry renders the right one of **two** messages and **the fetcher is never called** (`expect(addDesk).not.toHaveBeenCalled()`), which is the *"no request is sent"* half; `admin.routes.spec.ts` — a raw `A-1` body gets `400 invalid_request` | **contract + component + route** |
| **AC-03** | `libs/contracts/src/desks.spec.ts` — `deskCreateSchema.parse({ deskNumber: 'a-07' }).deskNumber === 'A-07'`, and a **property test** that `normalizeDeskNumber` is idempotent; `desks.repository.spec.ts` — **the recorded insert carries `'A-07'`, never `'a-07'`** (this is the "stored" half, and the assertion that a comparison-only implementation fails); `Desks.spec.tsx` — the row renders `A-07` (the "displayed" half) | **contract + repository + component** |
| **AC-04** | `desks.repository.spec.ts` — a `23505` naming `desks_desk_number_key` returns `{kind:'duplicate'}`; **a `23505` naming anything else THROWS**; **a `23514` THROWS** (§2.3); `admin.routes.spec.ts` — the duplicate yields **`409` with `code: 'desk_number_taken'`**, asserted through `errorBodySchema` (ADR-002 follow-up 6); `DeskFormDialog.spec.tsx` — a `duplicate` outcome renders the warning Alert **with the title naming the number**, keeps the typed value, and **the dialog stays open** | **repository + route + component** |
| **AC-05** | `libs/contracts/src/desks.spec.ts` — `'a-01'`, `'A-01 '`, `' A-01'` and `'A-01'` all normalise to the **same** string. **This is the whole of AC-05 that TypeScript can prove**, because the collision itself is the unique index's, and §2.1 is the written argument that the index is sufficient; `DeskFormDialog.spec.tsx` — the case sentence appears for `a-01` and **is absent** for an exact `A-01` collision (SCR-007:77, §6.4) | **contract + component** |
| **AC-06** | `use-add-desk-dialog.spec.ts` — **two synchronous `submit()` calls issue exactly ONE fetch**, asserted without an intervening `await` (the `inFlight` ref, not the `busy` state — §6.2); `DeskFormDialog.spec.tsx` — while busy the confirm keeps its **label** and carries `aria-busy`, and Cancel and the close icon are disabled | **hook + component** |
| **AC-07** | `DeskFormDialog.spec.tsx` — a `failed` outcome renders the **danger** Alert, **retains the typed value**, and the confirm's label becomes **`Try again`**; `add-desk.spec.ts` — a `500`, an `unavailable`, and an unparseable error body **all** map to `failed`, and **only** `desk_number_taken` maps to `duplicate`. **The "nothing was created" half is structural** — §2.3's insert has no pre-check to half-apply — and is stated in the PR rather than faked with a test that cannot fail | **component + lib** |
| **AC-08** | `admin.routes.spec.ts` — an **Employee** session `POST`ing `/api/admin/desks` gets **403**, reaching the real mount (`http/app.ts:78`); no token gets 401. Extend the existing describe at `:458-524`, whose `appWith` already threads a real session | **route** |
| **AC-09** | `dialog.spec.tsx` + a stylesheet assertion — the sheet is the **default** (`align-items: flex-end`, `width: 100%`, squared bottom corners) and the centred `max-width: 480px` is inside `@media (min-width: 768px)`. jsdom does no layout, so the stylesheet is the honest proxy (US-016 §7.1's device). Plus: no fixed `min-height`, no `min-width` — the two properties that would produce the horizontal scroll AC-09 forbids | **component + CSS** |
| — | `ConfirmDialog.spec.tsx` **unchanged and green** — §5.2's behaviour-preservation evidence. Not an AC of this story, and the most important test in the PR | **component** |

**Five mechanical notes that cost time if they are discovered in CI instead of here:**

1. **`aidlc-check` treats any literal `US-0NN` in a test file as a citation.** Commit `dfbc9a2` — *"aidlc-check treats any literal US-0NN text in a test file as a citation requiring that story to list the file in its own manifest `tests[]`"* — is four days old and was caused by exactly this. So: **`apps/ui/src/screens/desks/Desks.spec.tsx` must be added to US-017's manifest `tests[]`** the moment it gains a `US-017/AC-##` title, **and `DeskInventoryRow.spec.tsx` must gain no literal `US-017` text** (§9.1 — it is not this story's file).
2. **Every `DesksRepository` stub in `admin.routes.spec.ts` is a full object literal** — four call sites at `:461`, `:475-482`, `:496-505` and `:519`, plus the `desks?: DesksRepository` seam at `:111` and `composition.ts:64`. **Adding a third interface method makes all four fail to typecheck.** Expected, mechanical, and better known in advance — the same note US-016 §10 made for the second method.
3. **`Desks.spec.tsx:143-150` is DELETED, not retitled.** *"the add-desk story deletes this: the header Add desk is disabled with a reason"* is the forcing function; its replacement is a positive test that **Add desk** is enabled and opens the dialog.
4. **`Desks.spec.tsx:84-92` must be EDITED, and it is the one that will be missed.** The empty-state test loops `for (const button of addDeskButtons) expect(button).toBeDisabled();` at `:91`. That line now fails. **Change the assertion, keep the title and its `US-016/AC-06` citation** — losing the citation would silently drop another story's coverage, the hazard US-015 §5.4 named. `:103` and `:114` (loading/error) need no change: `/^Add desk/` still matches once the reason leaves the accessible name.
5. **`copy.ts:24`'s `UNAVAILABLE_CONTROL_REASON` stays.** `DeskInventoryRow.tsx:55-62` still uses it for Edit and the toggle. Only `Desks.tsx:46-53`'s `AddDeskButton` stops.

**No new gated real-Postgres test, and the reason matters.** §2.3's insert uses `.insert(...).select(...).single()` and maps a `23505` by message — no embed, no aggregate, no count hint, nothing runtime-only. It is the *same* mechanism `bookings.repository.concurrency.spec.ts` already exercises for the booking indexes, so **if a gated real-Postgres test is wanted for the duplicate**, that file is the precedent and the marginal cost is low. I do not think it is needed — `0002_desks.sql:35`'s index is a plain `create unique index` with no partial predicate, unlike the two partial indexes US-007 had to prove — but it is the one place where "prove it against Postgres" would be a reasonable reviewer request rather than a reflex.

**Data setup**, the story's QA note taken literally: an existing **`A-01`**; an existing **deactivated** desk holding a number (the edge case's *"a deactivated desk still holds the number"*); an **empty inventory** (AC-01 against ST-03, which is a different render path — `Desks.tsx:109-113`).

---

## 11. Open items carried out of this note

| # | Item | Owner | Blocks |
| --- | --- | --- | --- |
| **1** | **§1.1 — STOP.** SCR-007 ST-01 and all five approved add-mode hi-fi frames carry an **Active / Inactive status radio**; US-017's edge case (`:79`) says none is added; **no AC covers it**. Two approved Gate 1 artifacts disagree. My recommendation is **omit it in US-017** (a control with no AC cannot be proven under the gate's AC→test rule) and settle it by `change-request` — either an AC-10 on US-017 or a one-line correction to SCR-007 | **PO + `/ba`** | **the request contract's shape, a radio component, two icon assets, and an AC** |
| 2 | **§2.1** — the "no migration" reading has been independently verified by DEV against the live `0002_desks.sql` (the CHECK admits only upper-case, so the plain unique index is sufficient). Recorded, not blocking | Verified | — |
| **3** | **§4.1** — SCR-007's **Surface** field (`:9`) says `/admin/desks/new` and `/admin/desks/:id/edit`; the Layout section, the designer handoff and **every one of the 22 frames** say modal-over-SCR-006. The Surface line is the one sentence the 2026-09-10 correction missed. A one-line spec fix | **`/ux`** | nothing in code; a reviewer's confidence in §4 |
| **4** | **§4.3** — **US-018 adds no route either** and reuses `DeskFormDialog` in edit mode. Record it against US-018 so its author reads it as a contract rather than an omission, the way US-016 §2.4's predicate constraint was routed to US-019 | Manager → US-018 | nothing in this story |
| **5** | **§5.2** — extract `Dialog` and refactor `ConfirmDialog` onto it inside this PR (my recommendation; the evidence of safety is `ConfirmDialog.spec.tsx` unchanged and green), **or** ship `Dialog` for the desk form alone and leave `ConfirmDialog` as a second implementation with a follow-up issue? The second is a scope call, and scope is yours | **Joy Joshua + DEV** | which files §9 touches; nothing functional |
| **6** | **§8** — promote §4's "an overlay is a dialog on the parent route, never an address" to an ADR now, since SCR-008's forms will face it again? My answer is **no** (third application of an existing pattern; the real defect is open item 3's stale line), but this is the one I would not argue hard about | Joy Joshua | nothing |
| **7** | **§6.3** — `apps/ui/src/assets/icon-plus.svg` was added by US-016 and is imported by **nothing**. The **Add desk** button this story rewrites is its intended first consumer (US-016 §4.3, SCR-006 handoff `:226-229`). Wire it, as a named fidelity fix rather than an AC? My recommendation: yes, one import | DEV + `/ux` | nothing |
| 8 | **§8, edit 4** — `0002_desks.sql:5-6`, `desks.repository.ts:5` and `ADR-004:41` all still say desk writes arrive with *"US-015/US-017"*; US-015 is now the admin cancel. This story fixes the repository docblock; I recommend leaving the applied migration's text alone, and **ADR-004 stays US-016 open item 7** | Joy Joshua | nothing |
| 9 | **§10, note 1** — `aidlc-check`'s literal-`US-0NN` rule bit this repo four days ago (`dfbc9a2`). `Desks.spec.tsx` **must** be listed in US-017's manifest `tests[]`, and `DeskInventoryRow.spec.tsx` must stay free of `US-017`. Recorded here because it is a CI failure that reads as a mystery | DEV | a red check |

---

## Notes outside the design note

Five things worth attention separately from the note pasted above.

1. **The status radio is a real Gate 1 conflict, not a spec ambiguity, and it is cheap only right now.** The radios are in every one of the five approved add-mode frames, defended by a structural decision in SCR-007 with a named rejected alternative. Against that, US-017's edge case forbids it in one sentence and no AC mentions it. Whichever way it goes, somebody's approved artifact is wrong and should be corrected rather than quietly overruled by whoever writes the code first. **If you spot-check one thing in this note, make it open item 1.**

2. **"No migration" is the finding most worth a second pair of eyes, because it is counter-intuitive.** A plain `create unique index … on desks (desk_number)` is *not* case-insensitive uniqueness in general — it is here only because a CHECK constraint three lines earlier makes lower case unstorable. DEV has independently verified this against the live migration file.

3. **The two most likely wrong diffs are both things SCR-007 asks for in writing.** A route (`SCR-007:9`) and a client-side duplicate check against the desk list the browser already holds. §4 and §2.1's third rejected row are the rebuttals, and both are worth a sentence in the PR description rather than a review thread.

4. **US-016 left `icon-plus.svg` in the tree with no importer.** Not a defect — the design note predicted the consumer — but it is the kind of thing that survives three more stories and then gets deleted as dead code by someone who does not know a frame is waiting for it.

5. **`DeskInventoryRow.spec.tsx` must not be touched by this story.** That file's forcing test is about **Edit** and **Deactivate**, which belong to US-018 and US-019. Only `Desks.spec.tsx` carries Add-desk assertions, and it carries **two** of them — the obvious one (deleted) and a much easier one to miss inside a test titled for US-016/AC-06 (edited, citation kept). Getting that second one wrong is a red CI check that looks like a flake.
