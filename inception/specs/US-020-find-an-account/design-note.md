# US-020 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-020 — Find an account in the people list](../../stories/user-stories/US-020-find-an-account.md) |
| **Screen**   | [SCR-008](../../design/screens/SCR-008-people.md) **ST-01, ST-02, ST-03, ST-04, ST-15, ST-16**. ST-05 – ST-14 belong to US-023 – US-027 and **none are designed here** — §6 is the whole of what this story does about their controls |
| **Tier**     | Complex — a new **endpoint**, a new **client route**, a **shared component's props**, and a **trust surface** (§0) |
| **Author**   | Architect persona (AI draft), 2026-09-19                                 |
| **Rests on** | [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md), [ADR-004](../../../knowledge/decisions/ADR-004-table-ownership.md), the Gate 1 [`db-design.md`](../../architecture/db-design.md) §5 addendum, and the [US-013](../US-013-see-every-booking/design-note.md), [US-014](../US-014-filter-all-bookings/design-note.md) and [US-016](../US-016-see-the-desk-inventory/design-note.md) design notes — **one new ADR, [ADR-010](../../../knowledge/decisions/ADR-010-unbuilt-destination-controls.md)**, and it is *not* the one the plan expected (§8) |

**Advisory.** The human's GitHub review is the authority. `decisions.md`, `spec.md`,
`implementation-plan.md`, `impact-analysis.md` and `traceability.md` in this package stay DEV's
and are **not edited by this note** — every change this note asks for is collected in §11, for
DEV to apply with its own `change-log.md` row.

**The verdict, in one line each:**

- **D-01 confirmed, and DEV read the architecture correctly.** `db-design.md:351-355` says what
  DEV says it says, verbatim, and it is a Gate 1 decision that outranks the story's own *"as
  `/architect` decides"* wording. **I have nothing to decide here; I am confirming a decision
  already taken** (§2.1).
- **D-02 confirmed** — the summary is a second, unfiltered read, never derived from `users`.
  D-01 makes that not a preference but the only correct option (§2.2). **But the envelope in
  Step 1 carries the same number twice** and must lose its top-level `total` (§3.2) — the one
  change to the contract this note asks for.
- **D-04 confirmed, and it corrects a precedent rather than following one.** US-016 §4.2
  predicted `status: 'active' | 'deactivated'`; that would render `.status-chip--deactivated`, a
  class that **does not exist** (`status-chip.css:69, :75`). DEV's `'active' | 'inactive'` with
  `ACCOUNT_LABEL.inactive = 'Deactivated'` is right, and it is what US-016 §4.2's own CSS
  paragraph predicted three sentences later (§4).
- **D-05 confirmed — build `AccountRowMenu` independently; do not add `scrim?: boolean` to
  `Dialog`.** Not a close call once the widget is named: a menu is not a dialog. Five new props,
  an `aria-modal` lie and a `role` change would be needed, for one caller (§5). **No ADR** —
  this is `components/README.md:6` applied, not a new decision (§8).
- **D-06 confirmed.** `/api/admin/users`. `api-standards.md:8` wants a plural noun; every route
  on this router is its module's folder name (§3.1).
- **D-03 refined, not confirmed — and this is the section to read twice.** The four menu items
  must be `aria-disabled`, **not** `disabled`. US-016's pattern was written for buttons in a
  table row; applied verbatim inside a menu it produces **a menu with nothing focusable in it**,
  which fails AC-12 and AC-10's accessible half (§6). That refinement, and the fact that this is
  the pattern's second recurrence with five more stories queued behind it, is why **ADR-010**
  exists (§8).
- **The Trust row is rated correctly but defended in the wrong place.** The guard is inherited
  and fine; the actual control is the repository's **select list** and a `toEqual` body
  assertion, because the response schema is deliberately not `.strict()` (§7).
- **One major finding the plan does not cover: the `.or()` filter string.** DEV's escape set
  (`%`, `,`) is too narrow, and the whole clause is a **runtime-only assumption a recording fake
  cannot falsify**. One gated case in the harness that already exists closes it (§2.3).

§9.1's "not modified" list is as load-bearing as the modified one. The two things most likely to
ship broken are §2.3's filter string and §6's `disabled` attribute, and **both pass every unit
test DEV's plan currently names.**

---

## 0. The tiering — confirmed, four times over

**Complex.** DEV's classification is right, and by a wider margin than any story since US-013:

| Surface | What it is here |
| --- | --- |
| **Server — contract** | A **new endpoint**, `GET /api/admin/users`, and a new file under `libs/contracts/**` — a protected path (`task-surfaces.md:25-27`), Complex outright |
| **Browser — contract** | A **new client route**, `/admin/people` (`task-surfaces.md:61`). `routes.tsx` gains its fifth authenticated address |
| **Browser — shared component** | `StatusChipProps` gains a fourth discriminant (§4). `components/README.md:3-4` — *"the props and events of anything in here are a contract"* |
| **Trust** | *"credential or PII handling"* (`task-classification.md:50`). No guard is written, but this is the **first response in the system carrying every account's name and email** (§7) |

**The Medium carve-out that looks close, and fails.** `task-surfaces.md:47-48` carves out *"a new
`GET` reusing an existing table and response shape"*. This read reuses the table and **not** the
response shape — `libs/contracts/src/users.ts` is a new file — and the carve-out's words are
conjunctive. It also does not reach the route, the chip or the PII surface, any one of which
carries the tier alone. Recorded so a reviewer does not re-derive it.

### 0.1 What it is *not*, and each absence is defended below

- **Not Persistence.** `user_profiles` exists (`0001_user_profiles.sql:27-44`) and
  `user_profiles_is_active_role_idx` (`:52`) carries the comment *"BR-001.11's 'is there still an
  active admin' count, and the people list's default ordering (REQ-032, US-020)"* — **this story,
  by name, written by US-001**. `db-design.md:349` and `:351-355` both refuse a further index.
  **A migration in this PR is a review finding.**
- **Not a middleware or guard change.** `requireAdmin` mounts once at `/api/admin`
  (`http/app.ts:78`), and its own docblock states the property this story consumes verbatim:
  *"every future admin route inherits the guard before it is written"* (`require-admin.ts:4-7`).
  `apps/api/src/http/**` is a protected path (`task-surfaces.md:24-25`) and **is not modified; a
  diff there is a review finding.**
- **Not a design-token change.** Every token this screen needs exists and has a consumer:
  `--c-state-inactive-*` and `--c-state-available-*` (US-016's), `--c-scrim` (`dialog.css:16`),
  `--c-surface-overlay`, `--shadow-3` (`dialog.css:126`). **`inception/design/tokens.css` is a
  protected path and is not modified.**
- **Not an `eslint.config.mjs` change.** `MAY_IMPORT.users` is `['notifications']`
  (`eslint.config.mjs:16-22`) and this slice calls nothing. A protected path stays untouched.
- **Not a data-fetching-layer change.** `apps/ui/src/lib/data-refresh.ts` is
  `task-surfaces.md:61-63`'s Complex surface, set once for the whole app (ADR-008). This screen
  **must not** subscribe to it — the restraint US-014 §0 and US-016 §0.2 each recorded.
- **Not a new dependency, and not an asset-free story.** `.ilike()`/`.or()` are new *usage* of
  `@supabase/supabase-js`, not a new package (DEV is right). But **`apps/ui/src/assets/` has no
  magnifier** — see §7.1, and it is missing from the plan.

---

## 1. What this story actually is

A first read of `user_profiles` as a list, a search the architecture already decided, and a
four-item menu whose every item leads nowhere yet.

| AC | Where it is answered |
| --- | --- |
| AC-01 every account, four fields, chip | §3.2 (the wire), §4 (the chip). The **word** is the load-bearing half |
| **AC-02 / AC-06 the summary that does not re-count** | **§2.2.** The AC pair QA flags as *"looks like a bug, is a decision"*, and the one a well-meaning refactor breaks |
| AC-03 **(you)** | §7.3 — from `useAuth()`, never from a server field |
| **AC-04 search** | **§2.1 and §2.3.** §2.3 is the section with the real risk in it |
| AC-05 term retained, match line | §3.2 — the denominator is `summary.total`, which is why the envelope loses its duplicate |
| AC-07 no match, two actions | §7.2 — `EmptyState` as-is |
| AC-08 no "nobody exists" branch | A structural absence needing a test that can fail (§10) |
| AC-09 loading and failure | §7.4, and the **disabled-search-field trap** nobody has named yet |
| **AC-10 / AC-11 / AC-12 the menu** | **§5** (what it is), **§6** (what its items are). The two hardest calls in the story |
| AC-13 admin only | §7 — inherited on both sides, and the select list is the real control |

---

## 2. Search, and the summary that must not follow it

### 2.1 D-01 — confirmed, and DEV's reading of the architecture is correct

I re-read `inception/architecture/db-design.md` myself rather than trusting the citation.
`:351-355` reads, in full:

> *"REQ-032's search on name or email is left as a case-insensitive `LIKE` over `full_name` and
> `email` with no special index. At one office — hundreds of accounts, not millions — that is a
> sequential scan of a small table, and adding a trigram index before there is a measurable
> problem is exactly the speculative generality this design avoids. It is called out here so that
> the decision was made rather than overlooked."*

**DEV read it correctly on all three counts.** It says server-side (it is a `LIKE` over columns,
not a browser `Array.filter`); it says case-insensitive; and it says no new index. `:349`'s index
table independently earmarks `user_profiles (is_active, role)` for *"the people list's default
ordering"*, and `0001_user_profiles.sql:50-52` repeats it naming US-020.

**So D-01 is not DEV's decision to defend and not mine to re-take.** The story's *"server-side or
client-side as `/architect` decides"* (`US-020-find-an-account.md:122`) was written before the
db-design addendum existed; the addendum's closing sentence — *"so that the decision was made
rather than overlooked"* — is that file anticipating exactly this moment. **Declining to
relitigate it is the right call**, and `decisions.md` D-01 saying so in writing, including that
client-side was DEV's own first instinct, is the honest version.

One clarification worth carrying forward, because it is the half a reader will get wrong:
**`ILIKE` is what `.ilike()` emits; `db-design.md` says `LIKE` *case-insensitively*, which in
Postgres **is** `ILIKE`.** They are the same decision, not two.

### 2.2 D-02 — confirmed, and it is forced rather than chosen

The summary's four counts are a **second, unfiltered read**, tallied in the service, never derived
from the `users` array in the same response. DEV's reasoning is right and worth restating as a
criterion, because it is the **inverse** of the one US-016 §3.2 used and a reviewer who knows that
note will read it as a contradiction:

> **A derived total belongs on the wire exactly when the client does not hold the whole set.**
> US-016 refused a `counts` object because `GET /api/admin/desks` returns *every* desk and AC-09
> forbids the search that would change that — the server would have been telling the browser the
> length of an array the browser held. **US-020 is the opposite case by construction:** the moment
> `q` is non-empty the browser holds a *subset*, and AC-06 requires a number computed over the
> *whole*. The same rule produces opposite answers because the premise differs.

Say that in the PR. It is one sentence, and without it §2.2 looks like US-016 being overturned.

**Three things the counts must get right, none of which the plan currently asserts:**

1. **`employees + admins === total`, and `deactivated` is a subset of the same rows, not a fourth
   bucket.** AC-02's own example is *"38 people · 36 employees, 2 admins · 1 deactivated"* —
   36 + 2 = 38, and the 1 deactivated account is *inside* that 38. The natural slip is computing
   `total` over active rows only, which passes every seeded fixture where nobody is deactivated.
   **Assert the invariant, not just the four numbers** (§10).
2. **`getSummaryCounts()` selects `role, is_active` and nothing else** — no `id`, no `email`, no
   `full_name`. It is the one query in this story that touches every row and it carries **no PII
   at all**. That is a security property worth one line in its docblock, not an accident.
3. **`Promise.all`, not two sequential awaits.** DEV's Step 4 already says so. Correct, and for
   the right reason: they are independent reads and the screen waits on both.

The volume bound is in approved architecture rather than assumed: *"hundreds of accounts, not
millions"* (`db-design.md:352`). Put that citation in the service docblock, where the person about
to "optimise" the second read into an aggregate will read it.

**Rejected: a PostgREST aggregate for the counts.** US-016 §2.2 rejected the same shape for the
same three reasons, and the first is decisive here too: **PostgREST aggregate functions sit behind
a server setting this repository does not control**, so a recording fake proves nothing and the
story would need a real-Postgres run it otherwise does not (§2.3 is the one place it *does* need
one, and it should not need two). An in-memory tally over a few hundred two-column rows needs no
defence.

### 2.3 The `.or()` filter string — the finding the plan does not cover

**Rating: major.** This is the one place in US-020 where I am asking for work the plan does not
contain.

Step 3 says: *"escape `%`/`,` in `q` first so a literal comma or percent in a search term cannot
alter the `.or()` clause shape"*. The instinct is exactly right and the escape set is **too
narrow**, in two independent ways:

1. **`_` is an ILIKE metacharacter.** It matches any single character. Searching for `a_b` would
   match `axb`. That is a silent **correctness** bug against AC-04's literal substring and the
   story's own edge case (*"Implement case-insensitive substring; do not build fuzzy matching
   without a decision"*). It is not a security issue and it is the one most likely to survive
   review.
2. **`.`, `:`, `(`, `)` and `"` are PostgREST *filter-grammar* metacharacters, not just `,`.**
   `.or()` takes a raw string that PostgREST parses into `column.operator.value` triples; the
   grammar's escape hatch is to **double-quote the value**, escaping `"` and `\` inside it. An
   email search term contains a `.` by definition, so this is not a corner case — it is every
   search anyone will actually run.

**Recommendation, in three parts:**

- **Bound it at the contract.** `adminUsersQuerySchema`'s `q` gains `.max(100)`. One character of
  Zod, and it removes a whole class of pathological pattern.
- **Escape for ILIKE, then quote for PostgREST**, in that order, in **one named pure function** in
  the repository — `\`, then `%`, then `_` for the pattern; then wrap in `"` with `"` and `\`
  escaped for the filter string. One function, so the two `ilike` clauses cannot diverge.
- **Add one gated real-Postgres case.** `apps/api/src/modules/admin/admin.concurrency.spec.ts`
  already exists with exactly this gate (`describe.runIf(RUN)` at `:83`,
  `RUN_BOOKINGS_CONCURRENCY_TEST=1` at `:29`), and its docblock's stated purpose is *"two
  assumptions a fake client can only be TOLD, not discover"*. **This is a third one of precisely
  that kind.** A recording fake asserts *"we issue this string"*; whether PostgREST parses that
  string as one `ilike` over a literal substring is unfalsifiable against it.

**Why this matters more here than it would elsewhere:** a filter string PostgREST re-partitions
does not throw — it returns *different rows*. On a screen whose AC-13 is *"no other person's name
or email is returned"*, a filter that silently widens is the failure mode with the worst blast
radius in the story. US-016 §10 could say *"no new gated test, and the reason is worth stating"*
because `.eq` and `.gte` are ordinary typed filters. **`.or()` is not**, and US-020 does not get
to reuse that sentence.

**Rejected: two separate `.ilike()` queries merged by id in the service.** It avoids the grammar
entirely and is genuinely tempting. Rejected because it doubles the round trips on the screen's
hot path, needs a de-duplication the service must not get wrong, and trades a *provable*
assumption for an *unprovable ordering* one. One gated test is cheaper than a second query
forever.

---

## 3. The contract

### 3.1 D-06 — `/api/admin/users`, confirmed

Three independent reasons, all checked:

- **`api-standards.md:8`** — *"All routes under `/api`; resources are plural nouns
  (`/api/bookings`, `/api/desks`)"*. `users` is a regular plural; `people` is irregular, and the
  standard's two examples are both regular.
- **Every route on this router is already its module's folder name.** `/bookings` →
  `modules/bookings`, `/desks` → `modules/desks` (`admin.router.ts:65, :100`). The module is
  `users` (`apps/api/src/modules/README.md:9`, `eslint.config.mjs:16-22`), and both of DEV's
  citations are accurate.
- **The asymmetry is one now and six later.** US-023 – US-027 all add routes to this same module.
  `/api/admin/people/:id/deactivate` would name a *screen* in the path of a *cascade* that
  `modules/README.md` insists belongs to `users`. Naming the path after the screen would make
  `AppShell.tsx:34`'s display label a de facto API decision.

The UI route stays `/admin/people` — that is the screen's address and its nav label, and the
asymmetry is deliberate and exactly the one `kind: 'inventory'` vs the word *"Active"* already
carries inside `StatusChip`.

### 3.2 The envelope — one change: drop the top-level `total`

Step 1 proposes
`{ users: AdminUser[], total: number, summary: { total, employees, admins, deactivated } }`.

**Recommendation: `{ users, summary }`. Delete the top-level `total`.**

It is the same number as `summary.total`, on the same object, able to disagree with itself. That
is *"a second source for the same fact"* — US-014 §3.1's phrase, applied by US-016 §3.2 to reject
a `counts` object for the same reason. The match line AC-05 needs is:

    Showing ${users.length} of ${summary.total}

`users.length` **is** the matching count — the browser holds the whole filtered array, because
AC-08 and the story's own edge case forbid paging. Nothing on this screen needs a third number.

**The one argument for keeping it, and why it loses:** US-013's all-bookings envelope carries
`total` because that response is *one page of fifty* and the browser genuinely cannot count what
it was not sent. **This response is not paged.** Copying the shape without the premise is how an
envelope acquires a field nobody can explain in six months.

The rest of Step 1 is right and needs no change: `.strict()` on the query schema, **not**
`.strict()` on the response (`libs/contracts/src/desks.ts:51-52`'s convention — additive-safe by
design), and field names mirroring `authenticatedUserSchema` (`libs/contracts/src/auth.ts:64-75`).

### 3.3 `libs/contracts/src/error.ts` is not modified

Every reachable code on this endpoint exists: the session chain's 401s, `admin_only` 403 from the
mount, `invalid_request` for a malformed `q`, `internal_error`. **A new error code in this PR is a
review finding.** `adminUsersQuerySchema` failing produces `invalid_request` exactly as
`allBookingsQuerySchema` does (`admin.router.ts:67-70`) — reuse that branch, do not invent a
`search_too_long`.

### 3.4 `Cache-Control: private, no-store` — confirmed, and this route earns the comment

`admin.router.ts:78-79` carries it on `/bookings` with the comment *"This is the most sensitive
read in the system — everybody's whereabouts, in one body."* **US-020 takes that title.**
Everybody's whereabouts is behind a date filter; everybody's *name and email* is not. Set the
header, and move — or copy — that sentence to this handler.

---

## 4. `StatusChip` gains a fourth `kind` — D-04 confirmed, and it corrects US-016

**Recommendation: add `| { kind: 'account'; status: AccountStatus }` where
`AccountStatus = 'active' | 'inactive'`, with an exported
`ACCOUNT_LABEL = { active: 'Active', inactive: 'Deactivated' }`. Exactly as D-04 states.**

**This overrides a prediction in US-016's own design note, and the override is the point.**
US-016 §4.2 wrote: *"SCR-008's story adds `| { kind: 'account'; status: 'active' | 'deactivated' }`
when it arrives."* Taken literally that ships a **broken chip**, because the component keys its
class on `status` alone:

    // StatusChip.tsx:122 — the kind: 'inventory' branch, and the shape the new branch copies
    <span className={`status-chip status-chip--${props.status}`}>

`status-chip.css` defines `--available`, `--taken`, `--selected`, `--confirmed`, `--completed`,
`--cancelled`, `--active` (`:69`) and `--inactive` (`:75`). There is **no
`.status-chip--deactivated`**, so a `status: 'deactivated'` chip would render unstyled — no fill,
no border, no icon spacing — and no test that asserts a *word* would catch it.

**US-016 §4.2 contradicted itself three sentences later, and the later sentence is the correct
one:** *"the class is keyed on `status` alone, not on `kind`, so a future `kind: 'account'` with
`status: 'active'` lands on the same class — which is correct, because it wants the same
treatment, but it is the kind of coincidence better written down than discovered."* **US-020
resolves the contradiction in favour of the CSS paragraph.** Record that in `StatusChip.tsx`'s
docblock so the next reader of US-016 §4.2 is not misled by it.

SCR-008 is independently on DEV's side. Its components table (`:212`) says the chip is *"the
library's `Inactive` variant carrying the word Deactivated ... cloned from `Inactive`, so the fill,
border and block icon are the same tokens and only the label differs"*, and the designer handoff
(`:323-330`) confirms the borderless treatment is deliberate and token-backed.

**Consequences, all confirming DEV:**

- **No new CSS.** `.status-chip--active` / `--inactive` are reused as-is.
- **No new icon.** `icon-block.svg` is already imported at `StatusChip.tsx:35` and
  `CheckCircleIcon` is inline at `:63`. `ACCOUNT_ICON` is the same two functions under a new name.
- **No token change.** See §0.1.
- **Reuse of `kind: 'inventory'` fails on the word**, exactly as DEV says and for the reason
  US-016 gave about `LABEL.available`: `INVENTORY_LABEL.inactive` is the exported string
  `"Inactive"` (`StatusChip.tsx:61`) and AC-01 requires *"Deactivated"*. The label maps are
  exported precisely so a caller cannot fork one.

**Rejected: refactoring the three near-identical branches into one `LABEL_BY_KIND` lookup while
adding the fourth.** It is the obvious tidy and I am recommending against it. `StatusChipProps` is
a **Complex surface** (`components/README.md:3-4`) with three shipped callers, and the
discriminated union's one-word-per-kind explicitness is the structural half of NFR-008 — a
parameterised map is one step from a free-text label, which is the shape `StatusChip.tsx:17-21`
already rejected. Add the fourth branch in the existing shape. A fifth is the refactor's problem.

---

## 5. The row menu — D-05 confirmed, and it is less of a trade-off than it looks

**Recommendation: build `AccountRowMenu` as a new, screen-private component under
`screens/people/`. Do NOT add `scrim?: boolean` to `Dialog`.** DEV's default stands.

### 5.1 The Dialog option fails on six things, not on one

DEV framed this as scrim-versus-no-scrim. Having read `Dialog.tsx` and `dialog.css` in full, the
scrim is the *smallest* of the differences:

| What `Dialog` does today | What ST-15's popover needs | Fixable by `scrim?: boolean`? |
| --- | --- | --- |
| `.dialog__overlay { position: fixed; inset: 0 }`, flex-centred; **no anchoring concept at all** (`dialog.css:10-18`) | Hangs off the `⋯` it came from (`SCR-008:252`) | **No.** A transparent scrim leaves it viewport-centred |
| `aria-modal="true"` (`Dialog.tsx:93`) | *"An anchored popover is not [modal]"* (`SCR-008:252`) | **No.** And leaving it is an accessibility lie — it tells AT the page behind is inert when it is not |
| A Tab **focus trap** (`Dialog.tsx:67-85`) | Menu semantics: arrow keys move, Tab leaves (`SCR-008:224`) | **No** |
| `role="dialog" \| "alertdialog"` (`Dialog.tsx:26, :93`) | `role="menu"` with `role="menuitem"` children | **No.** Different widget, not a variant |
| `title: string` **required**, rendered as an `<h2>` with a `✕` (`Dialog.tsx:22-23, :94-113`) | The ≥768 popover has no title, no header and no `✕` | **No** — needs `title?` and a header opt-out |
| `footer: ReactNode` **required**, over a `border-top` (`Dialog.tsx:36`, `dialog.css:108-114`) | No footer; `footer={null}` still paints a stray rule | **No** — needs `footer?` and a CSS change |

That is **five new props and a role change on a Complex-surface shared component with one
caller**, and three of those props would have no second consumer in the codebase. Against it:
`components/README.md:6` — *"A component private to one screen belongs in that screen's folder"* —
and `ConfirmDialog` plus every shipped dialog caller sitting inside the blast radius of any change
to `Dialog`'s required props.

**The one honest argument for the Dialog option, and why nothing turns on it:** at 360px the menu
genuinely *is* modal — scrim, no anchor, titled with the person's name (`SCR-008:252`) — which is
`Dialog`'s contract almost exactly. It is still not enough, for the structural reason in §5.2.

### 5.2 The decisive constraint: there is no `matchMedia` in this codebase, and there must not be

I checked rather than assumed. `apps/ui/src` contains **zero** `matchMedia` calls; the only
occurrences are four comments recording the precedent (`AdminBookingRow.tsx:10`,
`all-bookings.css:6`, `DeskInventoryRow.tsx:10`, `desks.css:4`). The device is always the same:
**render one DOM and let CSS choose the presentation.**

So `<Dialog>` below 768 and a bare popover above is not available without introducing a JS
breakpoint read that three prior stories deliberately refused. **One component, one DOM, two CSS
presentations** is the only shape consistent with this codebase — which means `Dialog` is not a
candidate at *either* width, not merely at the desktop one.

### 5.3 The shape, which makes the scrim difference a single CSS rule

This is the part worth building to, because it collapses AC-11 into something small:

    <div class="people-menu__overlay">        <!-- inset:0. Transparent >=768, --c-scrim below.
                                                 Also the outside-click target at BOTH widths. -->
      <div role="menu" aria-labelledby={titleId} class="people-menu">
        <p id={titleId} class="people-menu__title">Dana Silva</p>  <!-- visually hidden >=768 -->
        <button role="menuitem" aria-disabled="true"> Edit
        <button role="menuitem" aria-disabled="true"> Make an admin
        <button role="menuitem" aria-disabled="true"> Reset password
        <hr class="people-menu__divider" aria-hidden="true" />     <!-- AC-10's divider -->
        <button role="menuitem" aria-disabled="true"> Deactivate
      </div>
    </div>

- **The overlay is the whole of the scrim difference**, and it is one `background` declaration
  inside one `@media (min-width: 768px)` block. It is also the outside-click target at both
  widths, which AC-12 needs anyway — so the element earns its place regardless of the scrim.
- **The title element exists at both widths and is visually hidden above 768.** It carries the
  `aria-labelledby` that names the menu after the person at *every* width, which is strictly
  better than SCR-008 asks for and costs nothing. At 360 it renders, which is AC-11 literally.
- **`aria-modal` appears nowhere, at either width.** A menu button's popup is not modal even when
  it covers the screen. This resolves what looks like a contradiction in SCR-008 — the 360 sheet
  is *visually* modal (scrim, no anchor) and *semantically* a menu. Nothing has to differ by width
  in the accessibility tree, which is exactly why one DOM works.
- **Anchoring above 768** is the popover's own `position: absolute` within a positioned row cell.
  jsdom performs no layout, so *placement* is a CSS assertion, not a behavioural one — the same
  honest proxy US-016 §7.1 used for its own two boundaries.

### 5.4 Focus, Escape and the trigger — AC-12

- **The trigger needs its own accessible name per row**: *"Actions for Dana Silva"*.
  `SCR-008:224` is explicit and gives the reason — *"forty controls all called 'Actions' is forty
  identical stops in a screen reader's control list"*. It is also `aria-haspopup="menu"` and
  `aria-expanded`. **None of this is in the plan** (§11).
- **Escape and outside click both dismiss and return focus to the trigger.** `Dialog.tsx:47-58`'s
  capture/restore is the right *idea* and the wrong *mechanism* to copy: it restores
  `document.activeElement` from mount. Here the trigger is known — the row owns the ref — so
  restore to it explicitly. Simpler, and it cannot restore to the wrong element if focus moved.
- **Arrow keys move between the four items** (`SCR-008:224`). **No AC covers this**, which is why
  it will be dropped. Build it: it is the difference between a `role="menu"` that is a menu and
  one that is a lie, and §6 makes it the *only* way to reach the items at all.

---

## 6. The four items — D-03 refined, and this is the section to read twice

**`aria-disabled="true"`, not the `disabled` attribute.** This is the one place I am overriding
`decisions.md`, and the reason is mechanical rather than a matter of taste.

### 6.1 Why the US-016 pattern cannot be applied verbatim here

D-03 says the pattern is applied *"verbatim"* from `US-016/D-02`. The pattern itself is right and
I confirm it — omitting the items would fail AC-10, which is a Gate 1 change routed through a
`change-request` issue, not a delivery decision. But US-016's controls were **`Button`s in a table
row, surrounded by other focusable things**. These four are **the entire contents of a popup**.

`Button` renders `disabled={disabled || busy}` on a real `<button>` (`Button.tsx:62`). A disabled
`<button>` is **not focusable and is skipped by most screen readers' browse modes**. So with
`disabled`:

- **The menu contains zero focusable elements.** It opens, and focus has nowhere to go.
- **AC-12 has nothing to test.** *"Dismissing the menu returns focus to its trigger"* presupposes
  focus left the trigger.
- **§5.4's arrow keys have nothing to move between.**
- **AC-10's accessible half evaporates.** The AC is about *"four actions in a fixed order"* with
  the destructive one last — a safety property (the story's own QA note says so). A keyboard or
  screen-reader user cannot perceive an order they cannot traverse, and the visually-hidden reason
  span is attached to a control nothing will ever announce.

`title` does not rescue it: `AdminBookingRow.tsx:79-81` pairs `title` with a visually-hidden span
precisely because *"`title` alone is not an accessible name in practice"* — US-016 §6.2's own
words — and a visually-hidden span inside an unreachable control is unreachable too.

### 6.2 The fix, and it is small

Render each item as a `<button role="menuitem" aria-disabled="true">` that is **focusable**,
carries its label, carries its reason via a visually-hidden span plus `title`, and **whose
`onClick` returns early**. The item is reachable, announced as *"Make an admin, dimmed"* with its
reason, and orderable by arrow key — and does nothing.

- **`Button` is not modified**, and a diff to `ButtonProps` adding an `ariaDisabled` prop **is a
  review finding**. `ButtonProps extends ButtonHTMLAttributes` (`Button.tsx:20`), so
  `aria-disabled="true"` passes straight through `...rest` — *getting it for free is the argument
  against the prop*, the same argument US-016 §4.3 made about an icon prop.
- **This is the standard menu pattern**, not an invention: keeping disabled items focusable is
  what WAI-ARIA's menu and toolbar patterns recommend, for exactly this reason.
- **Do not also pass `disabled`.** `aria-disabled` alone is the whole change. Passing both
  reinstates the problem.
- **The forcing function stays a test, not a comment** — US-016 §6.2's third point, unchanged.
  Each item is asserted present, correctly named, correctly ordered, `aria-disabled`, and carrying
  its reason. **Title each assertion with the story that deletes it** (US-023 / US-024 / US-027 /
  US-025+US-026).
- **The reason string stays UX's.** DEV's placeholder — reused verbatim from `US-016/D-02` — is
  the right placeholder, and naming a story id to an administrator stays refused.

### 6.3 What this story must NOT build — the review instruction

No confirm dialog, no refusal dialog, no `ConfirmDialog` call, no credential field, no toast, no
`PATCH`/`POST` on `/api/admin/users`, no `/admin/people/new` route, no SCR-009 form. **ST-05
through ST-14 are US-023 – US-027's.** A diff adding any of them is building five stories inside
one, and the story's own UI section lists the six states it exercises.

---

## 7. The trust surface, and the rest of the screen

**The Trust row's rating — *"yes (inherited, not built)"*, medium regression risk — is correct.**
The guard analysis is right: `requireAdmin` is mounted at `/api/admin` and inherited before this
route is written (`require-admin.ts:4-7`). But the impact analysis defends the wrong thing. **The
guard is not where this story can leak.** Three things are:

1. **The select list is the control, and the schema is not.** `adminUsersResponseSchema` is
   deliberately **not** `.strict()` (the project's additive-safe convention, `desks.ts:51-52`) —
   so Zod will **not** strip an accidental extra column on the way out. The only protections are
   the repository's explicit `select('id, full_name, email, role, is_active')` and the service's
   explicit field mapping. `user_profiles` carries `must_change_password`, `deactivated_at`,
   `push_opt_in` and `last_seen_at` (`0001_user_profiles.sql:27-44`), and `must_change_password`
   is a **targeting signal** — it identifies every account currently holding an administrator-set
   password. Put ADR-004's own sentence in the docblock: the explicit column list is *"load-bearing,
   not a style preference"*.
2. **The route test must use `toEqual` on the exact body, never `toMatchObject`.** This is what
   turns (1) from a convention into a check. `admin.routes.spec.ts` already sets that precedent
   (US-016 §10 note 1). **A `toMatchObject` in this PR is a review finding** — it passes a
   response carrying every extra column in the table.
3. **`.max(100)` on `q`**, and the `.or()` string (§2.3), which is where a *widening* leak would
   come from rather than a *column* one.

### 7.1 The search field — missing from the plan

`apps/ui/src/components/` has **no search field**, and `apps/ui/src/assets/` has **no magnifier**
(the eight assets are block, calendar, clock, close, grid, person, plus, login-backdrop). SCR-008's
handoff (`:287-289`) names both as built in Figma: **`Icon / search`** (*"the library had no
magnifier; cloned from `Icon / block`"*) and **`Search field`** (`Default` / `Focus` / `Filled` /
`Disabled`, the `Filled` state carrying the clear `×`).

**Recommendation: compose the existing `TextField`; do not build a shared `SearchField`.**
`TextField` already has a `trailing` slot (`TextField.tsx:28-29`, built for SCR-001's show/hide
toggle) which takes the clear `×`, and `label` plus `disabled` come free through
`InputHTMLAttributes`. What it lacks is a *leading* slot for the magnifier.

Two ways, and I recommend the second:

- **Add `leading?: ReactNode` to `TextFieldProps`.** Symmetric with `trailing`, four lines. But
  `TextFieldProps` is a **Complex surface** with one consumer for the new prop, and
  `TextField.tsx:11` says in its own docblock *"Scoped to SCR-001 and SCR-010's needs"*.
- **Render the magnifier screen-side**, positioned by `people.css` over the field's padding-left —
  the icon is decorative (`aria-hidden`), the field's `label` is its accessible name, and nothing
  shared changes. **This is the recommendation**: a second consumer is what buys `leading`, and
  there is one consumer.

Either way **`icon-search.svg` must be downloaded from the Figma node and added to
`apps/ui/src/assets/`**, imported `?raw` and rendered through a `dangerouslySetInnerHTML` span
exactly as `BlockIcon` does (`StatusChip.tsx:91-95`). **Neither the asset nor the field's
composition appears anywhere in Steps 1–16** (§11).

### 7.2 ST-03, ST-04 and the summary line — three existing components

- **ST-03 uses `EmptyState` unchanged**, with `actions` = **Clear search** *and* **Add person**.
  Its `actions` prop already exists (US-016 §7.3). The table and its headers are **not** rendered.
- **ST-04 uses `Alert tone="danger"` unchanged**, `live="assertive"`, `actions` = **Try again**,
  and **Add person is hidden, not disabled** — AC-09's deliberate half and the story's own
  *"easy to miss"*. `queryByRole('button', { name: /add person/i })` must be **null**. Asserting
  *disabled* here passes a screen that fails the AC.
- **The summary line is screen-private markup**, a `<p role="status">` with one pure
  `summaryLine(summary)` in `copy.ts` — the shape `AllBookings.tsx:192-199` and `Desks` both use.
  `role="status"` is what `SCR-008:227` means by a live region, and it only becomes useful in
  US-024/US-025. **Note the departure from US-016 §7.3 deliberately:** there the argument was that
  the browser holds the whole list; here it takes `summary` from the wire (§2.2) and **must never
  take `users.length`**. One comment on that line is worth more than a paragraph here.

### 7.3 AC-03 — **(you)** comes from `useAuth()`, never from the wire

Compare the row's `id` to the signed-in user's `id` from `useAuth()` (the hook `AppShell.tsx:40`
already uses). **`adminUserSchema` must not gain an `isYou` field**, and a diff adding one is a
review finding: it would be a second source for a fact the browser already holds, and it would
make the same response body mean different things to different callers.

DEV's Step 10 is right that the marker is an **accessible-name suffix**, not a separate DOM node,
so a screen reader announces *"Marcus Vale (you)"* as one name.

### 7.4 Two breakpoints, not one — and the loading trap

**This screen has two different boundaries and they are not the same number.** Confusing them is
the likeliest CSS bug in the story:

| Boundary | What switches | Source |
| --- | --- | --- |
| **1024px** | table ↔ card list | `SCR-008:83-95` — measured; the table needs **896px** and has 648 at 768 |
| **768px** | anchored popover ↔ bottom sheet | `SCR-008:195, :252` |

So **768–1023px gets cards *and* an anchored popover** — the band nobody tests and the one a
single-breakpoint implementation gets wrong. `SCR-008:74-81` is explicit that below 1024 *"the
menu stays a single `Icon button` at the card's top-right"*.

**And the loading trap, which no AC names and which the plan will otherwise ship:** AC-09 disables
the search field *"until there is something to search"*, and `useDesks`'s effect sets
`{ status: 'loading' }` on **every** dependency change (`use-desks.ts:68-70`). Copied as-is,
`useUsers` returns to `loading` on every committed search — so **the search field would disable
itself mid-search, dropping focus and the term.** That contradicts AC-05 and ST-16, which require
the term retained *in the field*.

**Disable the search field only while no list has ever loaded.** Track it in the screen, not the
hook: `hasLoadedOnce`. Skeletons on a re-search are fine and correct; a disabled field is not.

### 7.5 The `q`-driven re-fetch — use the device that already exists

DEV's Step 8 proposes `useUsers(fetchUsers, q)`, a two-argument hook. **Recommendation: keep the
one-argument fetcher signature and thread `q` through the closure**, which is
`Desks.tsx:110-117`'s own `stableFetch` device:

    const resolvedFetch = useMemo(() => fetchUsers ?? createFetchUsers(api), [fetchUsers, api]);
    const [retryKey, setRetryKey] = useState(0);
    const stableFetch = useCallback<UsersFetcher>(
      (signal) => resolvedFetch(committedQ, signal),
      [resolvedFetch, committedQ, retryKey],
    );
    const users = useUsers(stableFetch);

Three things this buys, each of which the two-argument version has to re-solve: the abort
discipline comes free (`use-desks.ts:68-83` aborts the in-flight request on every dep change,
which is exactly what a search needs); **Try again** is `retryKey`, already the established shape
(`Desks.tsx:111-117`); and the hook stays the same shape as the one beside it in `lib/`. The
hazard it avoids is real: `createFetchUsers(api)` called inline in the component body produces a
new identity every render and an **infinite re-fetch loop**.

**On placement:** `lib/fetch-users.ts` and `lib/use-users.ts` with **one** consumer sits against
the project's own two-real-consumers bar (`lib/cancel-booking.ts:4-6`, applied by US-015 §5.1 and
US-016 §5.3, which is why `fetch-desks.ts` moved there). I am **not** asking DEV to move them to
`screens/people/` — `lib/` is where both existing fetchers live, the symmetry is worth more than
the rule here, and US-023 – US-027 are the second consumers arriving next. Recorded so a reviewer
who knows the rule does not raise it as a finding.

---

## 8. One new ADR — and it is not the one the plan expected

The test US-013 §8, US-014 §8, US-015 §7 and US-016 §8 all applied: *does the decision bind work
beyond this story, with a rejected alternative a future author would otherwise re-litigate?*

| Candidate | Verdict |
| --- | --- |
| **D-01 server-side `ILIKE` search (§2.1)** | **No ADR.** `db-design.md:351-355` is the decision, taken at Gate 1, in writing, with its own rejected alternative. A story that *consumes* an approved architecture decision does not get to re-issue it as an ADR |
| **D-02 the unfiltered summary read (§2.2)** | **No ADR.** It is D-01's consequence, and §2.2's criterion belongs in the service docblock where the person about to "fix" it will read it |
| **D-04 `StatusChip`'s fourth `kind` (§4)** | **No ADR.** `StatusChip.tsx:17-21` already carries the policy *and* its rejected alternative. Fourth application. The one new thing — that US-016 §4.2's type sketch was wrong — is a docblock correction, not a decision |
| **D-06 endpoint naming (§3.1)** | **No ADR.** `api-standards.md:8` plus two shipped examples |
| **D-05 the menu component (§5)** | **No ADR, and I would not argue hard *against* one — but the answer is still no.** It looks like the candidate and the plan nominates it. It fails the test on the second clause: `components/README.md:6` already settles it, the project's extraction bar is **two real consumers**, and there is exactly one — SCR-006 **dropped** its own overflow on 2026-09-10, so no second screen wants a menu. The durable half is *"a menu is not a `Dialog` variant"*, and that belongs in **`Dialog.tsx`'s docblock**, where the next person reaching for `scrim?: boolean` will hit it (§8.2). If a second screen ever needs a menu, that story extracts it, and *that* is when a shared component acquires a contract |
| **§6 — a control whose destination is unbuilt** | **ADR-010. Write it.** See below |

### 8.1 Why §6 is the ADR and D-05 is not

US-016 §8 called this *"the one real candidate, and my answer is still no — but this is where I
would not argue hard"*, and left it as **its open item 6**, addressed to the human, with a
condition attached: *"If you expect this three more times this release and want it held by a
document rather than by §6 plus a test, write it now rather than at the third one."*

**The condition is met, and then some:**

1. **It is the second recurrence, with five more queued.** US-016 (three controls) and US-020
   (four menu items), and US-021/US-022 (SCR-009's form) plus US-023 – US-027 each face it again.
   That is not a prediction: `spec.md`'s Out of scope names all five destination stories.
2. **US-020 materially *changes* the pattern.** §6's `aria-disabled` refinement is not a
   restatement — it is a correction that a design-note section cannot carry to the next story,
   because DEV applied US-016's note *verbatim* and the verbatim application was wrong here.
   **That is the failure mode an ADR exists to prevent**, demonstrated once already in this very
   package.
3. **The rejected alternative is actively argued for elsewhere in the tree.** `routes.tsx:10-11` —
   *"a route with no screen behind it is a 404 that looks like a bug"* — and US-013 §6.2 both
   point at omission. A future author reading only those will re-litigate this, correctly
   believing they have the project's rule on their side.
4. **US-016 §8's own counter-argument no longer holds.** It was *"the decision's actual content is
   a rendering plus a copy string, and UX owns the second"*. With §6, the content is now a
   **focusability and semantics rule** that decides whether an AC is testable at all. That is
   architecture, not copy.

**`knowledge/decisions/` holds ADR-001 – 004 and 007 – 009. 005 and 006 are referenced by
framework docs and absent from this repository, so the next free number is `ADR-010`** — verified
by listing the folder, not inferred from the highest number.

`knowledge/decisions/ADR-010-unbuilt-destination-controls.md` lands in this PR. Status
**proposed** — the Decider is the human, per `ai/templates/adr.md`. It supersedes nothing, and it
**does not edit US-016's design note**; it closes US-016 open item 6 and `implementation-plan.md`'s
Open question 5, and both should be marked resolved by it.

### 8.2 Four consequential edits, each required by something that already exists

1. **`apps/ui/src/components/dialog/Dialog.tsx`'s docblock** — add one paragraph: US-020
   evaluated a `scrim?: boolean` prop and declined it; an anchored, non-modal menu is a different
   widget (`role="menu"`, no `aria-modal`, no focus trap, no title, no footer, anchored not
   centred), so `AccountRowMenu` was built beside it rather than through it. **`scrim`, `anchor`
   and `modal` props are refused by design, not overlooked.** This is §8's whole reason for not
   writing an ADR, so the sentence must actually land.
2. **`apps/ui/src/components/status-chip/StatusChip.tsx`'s docblock** — add the fourth family, and
   **state the US-016 §4.2 correction** (§4): the class is keyed on `status`, so the account
   chip's status values are `'active' | 'inactive'` with the *word* "Deactivated" in
   `ACCOUNT_LABEL`, not a `'deactivated'` status value. Name the trap so the next reader of
   US-016 is not misled.
3. **`apps/api/src/modules/users/README.md`** — ADR-004 follow-up 1 requires each module README to
   state what it owns and what it reads. This is the module's **first** file. Record: the
   read-only first slice; the server-side-search decision with its `db-design.md:351` citation;
   the explicit select list and why (§7); and **the forward constraint that US-023 – US-027 write
   to this same module, including the deactivation cascade `modules/README.md` insists belongs
   here and not in `bookings`.**
4. **`apps/api/src/modules/admin/admin.router.ts:78-79`** — its *"most sensitive read in the
   system"* comment now describes a different route (§3.4). Either move it or give the new handler
   its own sentence; leaving two routes both claiming the title is the kind of stale comment
   US-016 §8 kept finding.

`ai/standards/api-standards.md` needs no edit: no new error code, no new status, no pagination
rule. `apps/api/src/modules/README.md`'s `users` row already reads *"Account CRUD, role,
activate/deactivate and its cascade, admin password reset, **search**"*, which covers this read
exactly — written before the module existed.

---

## 9. File placement

**New — `apps/api` and `libs/contracts`**

    libs/contracts/src/users.ts                    (+ .spec.ts)  §3.2 — envelope WITHOUT top-level total
    apps/api/src/modules/users/users.repository.ts (+ .spec.ts)  §2.3 — select list, escape fn, .or()
    apps/api/src/modules/users/users.service.ts    (+ .spec.ts)  §2.2 — Promise.all, the tally
    apps/api/src/modules/users/README.md                         §8.2 item 3 — ADR-004 requires it

**New — `apps/ui`** (all screen-private; the pixel truth is in the frames)

    apps/ui/src/screens/people/People.tsx            (+ .spec.tsx)  ST-01..ST-04, ST-16; §7.2, §7.4, §7.5
    apps/ui/src/screens/people/AccountRow.tsx        (+ .spec.tsx)  table + card trees; AC-01, AC-03
    apps/ui/src/screens/people/AccountRowMenu.tsx    (+ .spec.tsx)  §5, §6 — ST-15
    apps/ui/src/screens/people/AccountSkeletonRow.tsx               64 / 80 / 152 (SCR-008:291-293)
    apps/ui/src/screens/people/copy.ts               (+ .spec.ts)   §7.2; §6's reason; the role label
    apps/ui/src/screens/people/people.css                           TWO boundaries (§7.4); .people__visually-hidden
    apps/ui/src/lib/fetch-users.ts                                  §7.5 — takes (q, signal)
    apps/ui/src/lib/use-users.ts                     (+ .spec.ts)   §7.5 — ONE-argument fetcher
    apps/ui/src/assets/icon-search.svg                              §7.1 — Figma `Icon / search`, MISSING from the plan

**Modified**

    libs/contracts/src/index.ts                             + export * from './users.js'
    apps/api/src/composition.ts                             + createUsersService; users dep on createAdminRouter
    apps/api/src/modules/admin/admin.router.ts              + GET /users; AdminRouterDeps.users; §8.2 item 4
    apps/api/src/modules/admin/admin.routes.spec.ts         AC-01, AC-04, AC-06, AC-13 — toEqual, never toMatchObject
    apps/api/src/modules/admin/admin.concurrency.spec.ts    + ONE gated case for the .or() string (§2.3)
    apps/ui/src/components/status-chip/StatusChip.tsx       + kind 'account'; ACCOUNT_LABEL; docblock (§4, §8.2 item 2)
    apps/ui/src/components/status-chip/StatusChip.spec.tsx  AC-01 — word AND icon, and no danger-family class
    apps/ui/src/components/dialog/Dialog.tsx                DOCBLOCK ONLY — no code change (§8.2 item 1)
    apps/ui/src/routes.tsx                                  + /admin/people under RequireRole (§0, §9.1)
    knowledge/decisions/ADR-010-unbuilt-destination-controls.md   new (§8.1)
    inception/specs/index.md                                US-020's Status -> implemented
    knowledge/traceability/manifest.json                    US-020 requirements[]/acs[]/tests[]

### 9.1 Not modified, and worth saying so

- **`supabase/migrations/**`** — §0.1. The index exists and its comment names US-020.
  **A migration in this PR is a review finding.**
- **`inception/design/tokens.css`** — §0.1. Protected path. **A diff here is a review finding.**
- **`apps/api/src/http/middleware/**` and `http/app.ts`** — §0.1. The mount predates the route.
- **`apps/api/src/modules/auth/auth.repository.ts`** — `profileRepository.findById` is a
  single-row session lookup; this is a different module's different-shaped read of the same table.
  ADR-004 permits the read; nothing here writes.
- **`apps/ui/src/components/dialog/Dialog.tsx`'s *code*, `ConfirmDialog`, `Button`, `EmptyState`,
  `Alert`, `TextField`** — §5.1, §6.2, §7.1, §7.2. Composed as they are. **A new prop on any of
  them is a review finding**, including `ariaDisabled` on `Button` and `leading` on `TextField`.
- **`apps/ui/src/components/status-chip/status-chip.css`** — §4. Both classes exist. Unlike
  US-016, this story adds **no** CSS to the shared chip and **no** new icon asset to it.
- **`apps/ui/src/lib/data-refresh.ts`** — §0.1, and the story's own out-of-scope list.
- **`apps/ui/src/components/app-shell/AppShell.tsx`** — **checked.** `ADMIN_NAV` already contains
  `{ to: '/admin/people', label: 'People', icon: 'person' }` (`AppShell.tsx:34`), and today that
  link falls through to `routes.tsx:76`'s catch-all, which redirects to `/sign-in`. **That is a
  live wrong behaviour in `main`, fixed by this story as a consequence rather than as an AC** —
  the third time in a row (US-016 fixed the same thing for `/admin/desks`). It needs no `bug`
  issue and it is worth one line in the PR, because no AC claims it.
- **`eslint.config.mjs`** — §0.1. `MAY_IMPORT.users` stays `['notifications']`.
- **`libs/contracts/src/error.ts`, `auth.ts`, `desks.ts`** — §3.3. `authenticatedUserSchema` is
  **mirrored, not imported or extended**: it is the session's shape and this is an admin list's
  shape, and they must be able to diverge.
- **`inception/specs/US-020-find-an-account/{spec,implementation-plan,impact-analysis,decisions,traceability}.md`**
  — approved at Gate D1 and **not edited by this note**. Everything this note asks of them is §11.

---

## 10. Test placement per AC

QA's own flags are the organising constraints: **AC-06 is the one that looks like a bug**, **AC-13
matters because this screen holds everybody's name and email**, **AC-10's order and divider are a
safety property**, and **AC-09's two halves are both easy to miss.**

| AC | Proven where | Level |
| --- | --- | --- |
| AC-01 | `users.repository.spec.ts` — the recorded select list is **exactly** `id, full_name, email, role, is_active` and ordered `full_name`; `admin.routes.spec.ts` — **`toEqual` on the exact body** (§7); `AccountRow.spec.tsx` — four fields plus the chip in both trees | repository + route + component |
| **AC-02 / AC-06** | `users.service.spec.ts` — the summary is **byte-identical with and without `q`** for a fixed seed, **`employees + admins === total`**, and `deactivated` counts rows *inside* that total (§2.2); `People.spec.tsx` — the summary line's numbers come from `summary`, and **an active search does not change them** | **service + component** |
| AC-03 | `AccountRow.spec.tsx` — **(you)** appears on the matching `id` only, **inside the accessible name**; `users.spec.ts` — `adminUserSchema` has no `isYou` (§7.3) | component + contract |
| **AC-04** | `users.repository.spec.ts` — the recorded `.or()` string for a plain term, **plus one case per metacharacter** (`_`, `%`, `.`, `,`, `"`, `\`) asserting the escaped form; **`admin.concurrency.spec.ts` (gated) — a term containing `_` and `.` matches the literal row and NOT the wildcard one** (§2.3). The gated case is the only one that can falsify the clause | **repository + gated real Postgres** |
| AC-05 | `People.spec.tsx` — the term stays in the field, the clear control is present, the match line reads `Showing {users.length} of {summary.total}` — **and the field is NOT disabled during the re-fetch** (§7.4) | component |
| AC-07 | `People.spec.tsx` — the message names the term, and **both** `Clear search` and `Add person` are present | component |
| **AC-08** | `People.spec.tsx` — a **negative assertion that can fail**: no control or text matching `/no (people\|accounts)\|nobody (yet\|here)/i` exists in any branch, and the only empty branch reachable is the no-match one. Asserting the absence of a component that was never written proves nothing (US-016 §7.1's point) | **component** |
| **AC-09** | `People.spec.tsx` — loading renders skeletons in **both** trees with the search field **disabled** and **Add person enabled**; error renders `Alert tone="danger"` with **Try again**, no table, and **`queryByRole('button', { name: /add person/i })` is null** — hidden, not disabled. **Plus: a committed search on an already-loaded list leaves the field ENABLED** (§7.4), the case no AC names and the plan would ship wrong | **component** |
| **AC-10** | `AccountRowMenu.spec.tsx` — the four items in **fixed order** by accessible name, the divider before the last, the last reading **Activate** on a deactivated account, the role item reading **Make an employee** on an admin and **Make an admin** on an employee, and each item **`aria-disabled` and focusable, never `disabled`** (§6), each carrying its reason in the accessibility tree. **Title each assertion with the story that deletes it** | **component** |
| AC-11 | `AccountRowMenu.spec.tsx` — one DOM at both widths (§5.3): the title element is present and labels the menu, the overlay exists, and the scrim/anchor difference is a **CSS assertion on `people.css`'s 768 boundary**. jsdom performs no layout; the stylesheet is the honest proxy. Plus `people.css`'s **1024** boundary for the table/card switch — **two boundaries, asserted separately** (§7.4) | component + CSS |
| **AC-12** | `AccountRowMenu.spec.tsx` — Escape dismisses and focus lands on the trigger; an outside click does the same. **Both need a focusable item to have moved focus off the trigger first**, which is §6's whole argument, so write the test that way rather than asserting focus never moved | **component** |
| **AC-13** | `admin.routes.spec.ts` — an Employee token gets **403 `admin_only`** and the serialised body contains **no `email` and no `full_name` value at all**; `People.spec.tsx` under `RequireRole role="admin"` with an Employee session redirects to `/bookings` (`require-role.tsx:29`) | **route + component** |

**Three mechanical notes that cost time in CI rather than here:**

1. **Every `DesksService`/`AdminBookingsService` stub in `admin.routes.spec.ts` is a partial
   object literal.** Adding a required `users` dependency to `AdminRouterDeps` makes **all** of
   them fail to typecheck. Expected, mechanical, better known in advance — US-016 §10 note 2,
   second application.
2. **`users.repository.spec.ts`'s recording fake needs `or` and `ilike` recorders**, which no
   existing fake in this repo has (`.ilike()`/`.or()` appear nowhere in `apps/api/src` —
   verified). Keep the fake's discipline: it exists to prove *"the query we issue"*, and
   `testing-standards.md` bans asserting the mock for anything else. **It cannot prove the query
   we issue is the query Postgres runs** — that is §2.3's gated case.
3. **`adminUsersResponseSchema` is not `.strict()`**, so a contract spec asserting an extra field
   is *rejected* will fail by design. Assert instead that the **route's** body equals the expected
   object exactly (§7).

**Data setup**, the story's QA note taken literally, because each row separates a correct
implementation from a plausible one: about 38 accounts; **2 admins** and **1 deactivated**, so
AC-02's exact example is reproducible; **the signed-in admin among them** (AC-03, AC-08); **a name
producing a match and a near-miss** (*Dana* / *danna*, ST-03's own example); **one account whose
name contains `_` and one whose email contains a `.` before the `@`** (§2.3 — the two rows no
fixture produces naturally, and the two that separate a literal substring match from a wildcard
one).

---

## 11. Amendments to the implementation plan

**This note does not edit `implementation-plan.md`.** Below is what changes, for DEV to apply with
its own `change-log.md` row, per `ai/gates/delivery.md` — the plan was approved at Gate D1 and a
silent change to it is what check 16 exists to catch.

| # | Step | Amendment | Why | Severity |
| --- | --- | --- | --- | --- |
| **A1** | **3** | Widen the escape set to `\`, `%`, `_` for ILIKE and **double-quote the value** for PostgREST's filter grammar (`"`/`\` escaped), in **one named pure function**. Add a repository case per metacharacter | §2.3 — `_` is a correctness bug against AC-04; `.` is in every email | **major** |
| **A2** | **3 / new** | Add **one gated case** to `apps/api/src/modules/admin/admin.concurrency.spec.ts` (`describe.runIf(RUN)`, the harness already exists at `:29, :83`) proving the `.or()` string filters as a literal substring | §2.3 — a recording fake cannot falsify the clause; AC-13's blast radius | **major** |
| **A3** | **6** | State explicitly that the body assertion is **`toEqual` on the exact object**, never `toMatchObject` | §7 — the response schema is not `.strict()`, so the test is the only thing stopping a leaked column | **major** |
| **A4** | **11** | The four menu items are **`aria-disabled="true"` and focusable**, never `disabled`. `Button` is unchanged (`aria-disabled` passes through `...rest`) | §6 — `disabled` leaves the menu with nothing focusable, failing AC-12 and AC-10's accessible half | **major** |
| **A5** | **1** | Drop the top-level `total` from `adminUsersResponseSchema`; the envelope is `{ users, summary }` | §3.2 — `summary.total` is the same number; the match line is `users.length` of `summary.total` | major |
| **A6** | **new, before 13** | Add `apps/ui/src/assets/icon-search.svg` (Figma `Icon / search`, `SCR-008:287`) and render it screen-side over the field's padding — **do not** add `leading` to `TextFieldProps`. Name `TextField` + its `trailing` slot as the search field's composition | §7.1 — the asset and the field's composition appear nowhere in Steps 1–16 | major |
| **A7** | **13** | Disable the search field only while **no list has ever loaded** (`hasLoadedOnce`), not on every `loading` | §7.4 — otherwise the field disables itself mid-search and drops focus and the term, contradicting AC-05/ST-16 | major |
| **A8** | **8** | `useUsers` keeps the **one-argument** fetcher signature; `q` is threaded through a `useCallback` closure — `Desks.tsx:110-117`'s `stableFetch` device — with `retryKey` for **Try again** | §7.5 — free abort discipline, established shape, avoids the inline-fetcher infinite-refetch hazard | major |
| **A9** | **11 / 10** | Add **arrow-key movement** between the four items, `aria-haspopup="menu"` + `aria-expanded` on the trigger, and **a per-row accessible trigger name** — *"Actions for Dana Silva"* | §5.4 — `SCR-008:224` requires all three; none is in the plan, and no AC covers them | major |
| **A10** | **4** | Assert `employees + admins === total` and that `deactivated` is a **subset** of `total`, not a fourth bucket | §2.2 — computing `total` over active rows only passes every fixture with nobody deactivated | major |
| **A11** | **14** | `people.css` carries **two** boundaries: **1024** for table↔card and **768** for popover↔sheet. Assert both | §7.4 — 768–1023 gets cards *and* a popover; a single-breakpoint implementation gets that band wrong | major |
| A12 | **16** | Add the four docblock edits of §8.2 (Dialog, StatusChip, `modules/users/README.md`, `admin.router.ts:78-79`) | §8.2 — each is required by ADR-004 follow-up 1, or by §8's reason for not writing an ADR for D-05 | minor |
| A13 | **16** | Land `knowledge/decisions/ADR-010-unbuilt-destination-controls.md` in this PR, and mark US-016 open item 6 and this plan's Open question 5 resolved by it | §8.1 | minor |
| A14 | Open questions | **Row 4 (D-05 as a `Dialog` variant) is resolved: no** (§5). **Row 5 (D-03 as an ADR) is resolved: yes, ADR-010** (§8.1). **Row 3 (ordering) is resolved: confirmed as `full_name` ASC** (§12 item 4). Rows 1 and 2 stand | — | minor |
| A15 | **1 / 3** | `adminUsersQuerySchema`'s `q` gains `.max(100)` | §2.3 — one character of Zod, removes a class of pathological pattern | minor |

**A1 – A4 are the ones I would not merge without.** A1 and A2 are one finding in two halves; A3
and A4 each turn an AC from asserted into actually proven.

---

## 12. Open items carried out of this note

| # | Item | Owner | Blocks |
| --- | --- | --- | --- |
| **1** | **§2.3** — is running the gated real-Postgres case in CI acceptable, or does it stay a local `RUN_BOOKINGS_CONCURRENCY_TEST=1` invocation as the two existing ones do? My recommendation is **keep the existing convention** (local, documented in the docblock, run once before merge, output pasted into the PR). But `.or()`'s grammar is a *standing* assumption rather than a one-off, so a reviewer may reasonably want it in CI | Joy Joshua + `/devops` | nothing — the case is written either way |
| **2** | **§7.1** — the magnifier. My recommendation is a screen-side decorative icon rather than a `leading` prop on `TextField`. If `/ux` expects SCR-009's form or a later screen to carry a second search field, `leading` becomes the better answer and should be added **there**, with two consumers, not here | `/ux` + DEV | nothing — either path ships |
| **3** | Plan Open question 1 — **the debounce**. 300ms is a sensible default and I am not overriding it, but note the interaction with §7.4: with server-side search, *every* keystroke past the debounce is a round trip carrying every matching account's email. At 38 accounts that is nothing; the number that makes it something is the same *"hundreds"* `db-design.md:352` names. **Recommendation: 300ms, committed on Enter or blur as the plan says, revisited at the same threshold the trigram index would be.** Not a blocker | `/ux` + PO | nothing — ships with the default |
| **4** | Plan Open question 3 — **default ordering**. `full_name` ASC (D-07) is right and I confirm it: `user_profiles_is_active_role_idx` serves BR-001.11's *count*, not this list's *order*, and grouping by activity would need a tie-breaker nobody has stated. **Recorded as confirmed rather than left open** | PO | nothing |
| **5** | **§6.2** — the exact reason string on each `aria-disabled` item. US-016 open item 8, unchanged and now two stories old. The placeholder promises no release, which is the property that matters | `/ux` + PO | four strings |
| **6** | **§5.4 / A9** — none of the three menu accessibility requirements (`SCR-008:224`) has an AC. They are design-spec requirements the story never absorbed. **Build them; but if the PO wants them *tested* as acceptance criteria rather than as good practice, that is a Gate 1 change-request**, not a delivery decision | `/ba` + PO | nothing — A9 builds them regardless |
| **7** | US-016 open item 9 (offset-vs-keyset for future admin lists) is **still not this story's** — this endpoint does not page, by requirement (AC-08, and the story's own edge case). Noted so it is not lost a second time | Joy Joshua | nothing |
