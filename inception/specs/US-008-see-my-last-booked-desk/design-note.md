# US-008 — design note (Architect, advisory)

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Story**    | [US-008 — See which desk I booked last](../../stories/user-stories/US-008-see-my-last-booked-desk.md) |
| **Screen**   | [SCR-003](../../design/screens/SCR-003-book-a-desk.md) **ST-01** and **ST-07** — one label on an existing row. No new state |
| **Tier**     | Complex — `libs/contracts/**` is a protected path (`ai/standards/task-surfaces.md:25-27`) and the props of a shared component are Complex (`:61`) |
| **Author**   | Architect persona (AI draft), 2026-09-18                                 |
| **Rests on** | [ADR-002](../../../knowledge/decisions/ADR-002-shared-api-contract-package.md), [ADR-004](../../../knowledge/decisions/ADR-004-table-ownership.md) — **no new ADR** (§0) |

**Advisory.** The human's GitHub review is the authority. `decisions.md` in this package stays DEV's.

The story delegates one thing by name — *"Needs the employee's most recent booking to be readable
alongside availability. Shape is `/architect`'s to settle — no OpenAPI contract exists in this
repository yet"* (story §API impacts). §1–§3 settle it. §4 and §5 are the two places where following
the story literally produces the wrong behaviour, and neither is visible until you write the query.

---

## 0. No ADR, and why that is the honest answer

An ADR is warranted when a real trade-off has a rejected alternative that a future author would
otherwise re-litigate. This story has none. The shape question (§1) has one alternative and it loses
in two lines. The eligibility question (§2) is already answered by the pattern `myBooking` set three
weeks ago. The repository question (§3) is a naming convention, not a decision.

What governs it is already written down: ADR-002 fixes the shared-Zod-contract mechanism and the
additive-field discipline, and `libs/contracts/src/availability.ts:53-54` states the house rule in
its own words — responses are **not** `.strict()`, so an additive field must not break a tab loaded
before the deploy. `myBooking` was itself added that way in US-007 (`availability.ts:67-74`). US-008
is the second application of a settled pattern, not a new one.

**So: design note alone.** The story is still **Complex** — it touches `libs/contracts` and changes
`DeskRow`'s props — and Complex is precisely the tier that requires this note to exist before the
code (`ai/gates/delivery.md:53`). Tiering and ADR-worthiness are different questions and this story
is a clean example of the difference.

---

## 1. Where the label surfaces — a new top-level `usualDeskId`

### 1.1 The recommendation

```ts
// libs/contracts/src/availability.ts — added to availabilityResponseSchema
/**
 * US-008/REQ-034. The caller's most recently booked desk, **already filtered to eligibility**:
 * present only when that desk is in `desks` above AND its `status` is `available` (AC-05's three
 * causes, one outcome — design note §2). `null` when the caller has never booked (AC-04), or when
 * the desk is taken, inactive or otherwise absent. The browser renders the label on the row whose
 * `id` matches and does NOT re-derive eligibility — there is nothing here to re-check.
 *
 * `.nullable().default(null)` for the same reason `myBooking` has it (US-007): a server that
 * evaluated the question always answers it, and an old fixture with no key at all still parses.
 */
usualDeskId: z.string().uuid().nullable().default(null),
```

Nothing else on the wire changes. `deskAvailabilitySchema` is untouched.

### 1.2 The trade-off, in two lines

Embedding a per-row flag (`isUsual: boolean` on every `DeskAvailability`) would put a **per-caller**
fact inside a structure that is otherwise a **per-date fact about the office**, and would ship a
field that is `false` on 39 rows out of 40 to say one thing about one row. US-006's note already
drew this line for exactly this field (`US-006/design-note.md` §2.4: *"Keep viewer-specific facts out
of the desk's status"*), and US-007 followed it by adding `myBooking` top-level rather than marking
the desk row. Consistency here is not aesthetic: a reviewer who sees one viewer-specific fact in the
row and one beside it has to work out which rule applies next time.

The cost of the top-level field is one `===` at the render site (`ZoneGroup` already has `desk.id`
in hand for `selectedDeskId`, line 38 — this is the identical shape). That is the whole cost.

### 1.3 On the name

`usualDeskId`, not `lastBookedDeskId`. The field is **not** raw history — it is the answer to
"which row gets the label", already filtered by §2. A name promising unfiltered history would invite
exactly the client-side re-derivation §2 exists to prevent, and it would be a lie whenever the
employee's last-booked desk is taken. `usual` is also the word on the screen (SCR-003 line 44,
*"↻ your usual"*, and the structural decision at line 188), so the contract and the copy agree.

The docblock must say it is derived from the **single most recent booking**, not from frequency —
"usual" implies a count and the derivation has none. That sentence belongs in the schema, because
the schema is what the next reader opens.

---

## 2. AC-05 is resolved on the server, and the browser cannot re-open it

**Recommendation: backend-resolved, and the response never carries an ineligible id.**

In `bookings.service.ts`, `getAvailability`, after the projection is built:

```ts
// US-008/AC-01, AC-05. One predicate, three causes:
//   - TAKEN        -> the row exists with status 'taken'          -> excluded here
//   - INACTIVE     -> listActiveDesks never returned it           -> not in `projected` at all
//   - ABSENT       -> same                                        -> not in `projected` at all
// The browser is handed an id it can label unconditionally, or null. It never re-checks.
const lastDeskId = await availability.findMyLastBookedDeskId(userId);
const usualDeskId =
  lastDeskId && projected.some((d) => d.id === lastDeskId && d.status === 'available')
    ? lastDeskId
    : null;
```

Three reasons this is not merely the simpler option:

1. **It is the pattern already in place.** `myBooking` is resolved server-side and the browser
   renders it with no cross-checking (`BookADesk.tsx:242`). The same employee-specific question,
   answered the same way, in the same response.
2. **A client-side cross-check is a second implementation of AC-05.** The rule "labelled only when
   available" would then exist in the service (as an omission) and in the component (as a
   condition), and the first divergence renders a "your usual" badge on a Taken desk — the exact
   *"tease"* the AC's own rationale names.
3. **It is where the data already is.** The service holds `projected` and the desk id in the same
   scope. Sending the raw id and asking the browser to filter would send *more* and mean *less*.

No existing ADR bears against it. ADR-004 (read across, write within) is about which module may
issue SQL against which table — this read is `bookings`, the module's **own** table, so ADR-004 is
satisfied trivially. ADR-002's line between contract and rule (*"the browser may not evaluate
business rules"*, ADR-002 §What does not go in it) actively **supports** resolving it server-side.

**The new read is date-independent**, so it joins the existing `Promise.all` in `getAvailability`
(`bookings.service.ts:71-75`) as a fourth parallel read — no added latency, one more round trip.
Put it after the `refusalFor` early-return like the others, so a refused date still runs no queries.

**One consequence to write into the PR, not to discover in review:** when the caller already holds
a Confirmed booking for the selected date, `myBooking` is non-null and `BookADesk.tsx:242` replaces
the entire desk list with `ExistingBookingState`. No row renders, so no label renders. That is
correct and needs no code. It does mean **a UI test that seeds `myBooking` and expects a label
cannot pass** — seed `myBooking: null` in every US-008 screen test.

---

## 3. The repository method

```ts
/** US-008/AC-03. The caller's most recently booked desk id across ALL dates — derived from
 *  history, never a stored preference (there is no favourite-desk column and this story adds
 *  none). `desk_id` ONLY: no user_id, no dates, no status — the caller's own history is not
 *  something this response describes, only something it is derived from.
 *
 *  NO status filter: a Cancelled booking counts as history (product decision, story §Edge
 *  cases — it still records where the employee chose to sit).
 *
 *  Ordered `booking_date desc, created_at desc` — see design note §5 for why the second key is
 *  load-bearing and not belt-and-braces. Served by `bookings_user_id_booking_date_idx`
 *  (`supabase/migrations/0003_bookings.sql:77`, already tagged REQ-034 when it was created).
 *
 *  `undefined` means the caller has never booked (AC-04). */
findMyLastBookedDeskId(userId: string): Promise<string | undefined>;
```

```ts
async findMyLastBookedDeskId(userId) {
  const { data, error } = await supabase()
    .from('bookings')
    .select('desk_id')
    .eq('user_id', userId)
    .order('booking_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`bookings lookup failed: ${error.message}`);
  return (data as { desk_id: string } | null)?.desk_id ?? undefined;
}
```

Naming follows the module's existing shape: `findMyConfirmedBooking` (`find` + `My` + what) and
`listActiveDesks` / `listConfirmedDeskIds` (`list` for a set). `find…` + singular + `…Id` says
"at most one, and only the id" before anyone opens it.

**It returns an id, not a row.** `myBooking` needed `desk_number` because it renders text the
desk list does not contain. This one renders nothing of its own — the desk number already comes
from `desks[]`. Joining `desks(desk_number)` here would fetch a string to throw away, and would
add a second source for a name the row already carries. Do not.

---

## 4. AC-05 and the Edge cases contradict each other on rename — and only one is implementable

This is the one place the story does not say a single thing, and it needs the human, not DEV.

- **AC-05** lists three causes of no-label: *"is **Taken** … or is now **Inactive**, or has been
  renamed"*.
- **Edge cases** says the opposite: *"The desk was renamed since (US-018, BR-001.19): the booking
  points at the desk, not the string, so the label **follows the rename**. If the desk no longer
  exists at all, AC-05 applies."*

**Recommendation: the Edge-cases reading is right, and AC-05's third clause should be corrected to
"or no longer exists".** Not a preference — AC-05's literal reading is not implementable against
this schema. `bookings` stores `desk_id` and no desk-number snapshot (`0003_bookings.sql`), so the
server has no way to know a desk was ever renamed. Implementing "renamed → suppress" would need a
new column recording the number at booking time, written by US-007's insert path, which is a schema
change, a contract change and a requirement nobody wrote. The Edge-cases reading needs zero code:
the id is stable across a rename, so the label follows it automatically.

**Nothing blocks implementation** — both readings agree on the two causes DEV actually implements
(taken, inactive), and both agree a deleted desk gets no label (which is also free: desks are never
deleted, `on delete restrict` at `0003_bookings.sql:27`, and an absent id fails §2's `some()`).
What is blocked is **QA**: the story's QA notes say *"AC-05 has three causes"*, and a test named
`… (US-008/AC-05)` asserting no label after a rename would fail against the recommended behaviour.

**Action: raise it with the BA before QA derives tests.** If the PO confirms the Edge-cases reading,
AC-05's wording is a one-line `change-request` on the story. Do not silently implement one reading
and leave the other in the file.

---

## 5. "Two bookings on the same date is impossible" is false once Cancelled counts

The story's first edge case reasons: *"Two bookings on the same most recent date is impossible —
BR-001.1 allows one per day — so 'most recent' is unambiguous."*

That is true of **Confirmed** bookings only, and it stops being true the moment a Cancelled booking
counts toward history. The guarantee is a **partial** unique index —
`bookings_one_confirmed_per_user_per_day … where status = 'confirmed'` (`0003_bookings.sql:67-68`)
— and it was made partial deliberately *"so cancelling frees the slot immediately (BR-001.2's
cancel-then-book)"* (`:59-60`). Cancel-then-book is the product's **normal** path for changing your
desk, and it leaves two rows with the same `user_id` and the same `booking_date`.

So the common case is: employee books A-01 for Friday, changes their mind, cancels, books A-05.
Two rows, one date. `order('booking_date', desc).limit(1)` alone returns **either** of them — the
tie is broken by whatever Postgres feels like, and the label points at A-01 (the desk they rejected)
about half the time, non-deterministically, in a way no fixed-data test will reliably catch.

**`order('created_at', { ascending: false })` as the second key is what makes the answer correct**,
not merely deterministic: the later-created row is the choice that replaced the earlier one.
`created_at` is `not null default now()` (`0003_bookings.sql`), so it is always present.

Pin it: seed one cancelled and one confirmed booking for the same user on the same date, with the
confirmed one created later, and assert `usualDeskId` is the confirmed desk. That test is the only
thing standing between this story and a coin flip.

---

## 6. The browser side — and the `aria-label` that will silently swallow AC-06

### 6.1 Plumbing

`BookADesk.tsx` passes `availability.data.usualDeskId` to each `ZoneGroup` exactly as it already
passes `selectedDeskId` (line 298); `ZoneGroup` threads it to `DeskRow` as
`usual={desk.id === usualDeskId}` beside the existing `selected={desk.id === selectedDeskId}`
(`ZoneGroup.tsx:38`). Both components stay presentational and hold no state, per the rule US-007's
note set (F-8) and both files already document.

The copy is *"your usual"* (SCR-003 line 44 and the structural decision at line 188). Put it in
`apps/ui/src/screens/book-a-desk/copy.ts` beside the other approved strings, not inline in the
component — that file exists so reaching for one of these strings puts the others in view.

### 6.2 AC-06 needs the accessible name changed, and this is the finding I care most about

AC-06 requires the label to be *"announced by a screen reader alongside the desk number and its
availability"*. Adding a visible `<span>your usual</span>` inside the row **will not achieve that**,
and it will look like it does.

`DeskRow.tsx:46` sets `aria-label={deskNumber}` on the `<button role="radio">`. An `aria-label`
**replaces** the name computed from the element's contents. So the accessible name of an available
row is today exactly `"A-01"` — the `StatusChip`'s "Available" text is already not part of it, and
a new "your usual" span would not be either. In a radio group, that name is what is announced on
arrow navigation, which is the primary way this list is traversed (SCR-003 line 168: *"The desk list
is a radio group: one tab stop, arrows move selection"*).

**Fix: compose the label rather than adding a child and hoping.**

```tsx
// US-008/AC-06 (NFR-008). `aria-label` REPLACES the name computed from contents, so the chip's
// word and the hint's text are invisible to the name computation unless they are named here.
// Order matches SCR-003's announcement rule — the desk, then its availability, then the hint.
aria-label={[deskNumber, LABEL[selected ? 'selected' : 'available'], usual ? 'your usual desk' : undefined]
  .filter(Boolean)
  .join(', ')}
```

Two notes on that. The visible chip stays as it is — this changes the *name*, not the render. And
the availability word appearing in the name is strictly a fix: US-006/AC-02 and SCR-003 line 170
both require availability to be conveyed by word, and a screen-reader user arrowing through the
radio group does not currently hear it. That is a pre-existing gap from US-006, not one US-008
introduces, but **US-008 is the story whose AC makes it a defect**, so it gets fixed here.

Assert it as a name, not as text: `getByRole('radio', { name: 'A-01, Available, your usual desk' })`.
A `getByText('your usual')` assertion passes today against a row no screen reader would announce it
on, which is exactly the false green this finding exists to prevent.

The **taken** row (`DeskRow.tsx:33-38`) is a plain `<div>` with no `aria-label`, so its contents are
read normally — and it never carries the label anyway (§2). No change there.

### 6.3 AC-02 — the one thing that must stay structurally impossible

`usualDeskId` must never be written into `selectedDeskId`, and the initial state
(`BookADesk.tsx:81`, `useState<string | undefined>(undefined)`) must not change. The two values are
deliberately separate pieces of state with separate props; AC-02's *"the label is a hint, never a
pre-commitment"* holds because nothing connects them, not because a condition says so.

Assert on load: the confirm action still reads *"Select a desk"* and is disabled, and no row has
`aria-checked="true"` — **with `usualDeskId` seeded**. A test that seeds `null` proves nothing about
AC-02.

---

## 7. Findings

Rated per `ai/quality/review-checklist.md`. None blocks implementation.

| # | Rating | Where | Finding | Fix |
| - | ------ | ----- | ------- | --- |
| F-1 | major | the story, AC-05 vs §Edge cases | The two contradict each other on rename, and AC-05's literal reading is not implementable — `bookings` stores no desk-number snapshot | Raise with the BA before QA derives tests; recommended answer is the Edge-cases reading, as a one-line `change-request` on AC-05 (§4) |
| F-2 | major | `bookings.repository.ts` (new method) | With Cancelled counting, two rows can share the most recent `booking_date` (cancel-then-book), so `order(booking_date desc).limit(1)` alone returns a coin flip — often the desk the employee rejected | Second sort key `created_at desc`; seed the cancel-then-rebook case and assert the confirmed desk (§5) |
| F-3 | major | `apps/ui/src/components/desk-row/DeskRow.tsx:46` | `aria-label={deskNumber}` replaces the name computed from contents, so a visible "your usual" span is not announced — AC-06 would be unmet by an implementation that looks right and passes a `getByText` assertion | Compose the `aria-label` as desk number, availability, hint; assert by accessible name (§6.2) |
| F-4 | minor | `bookings.service.ts` `getAvailability` | An unfiltered id reaching the browser would put AC-05 in two places | Filter in the service with the single `some()` predicate; the browser does `id ===` and nothing more (§2) |
| F-5 | minor | US-008 screen tests | A test seeding `myBooking` non-null can never see a label — the desk list is replaced entirely (`BookADesk.tsx:242`) | Seed `myBooking: null` in every US-008 screen test, and say so in the PR (§2) |
| F-6 | minor | `BookADesk.tsx:81` | AC-02 holds because `usualDeskId` and `selectedDeskId` are unconnected; a "helpful" refactor could connect them | Assert on load, **with `usualDeskId` seeded**, that nothing is checked and confirm reads *"Select a desk"* (§6.3) |
| F-7 | nit | `libs/contracts/src/availability.ts` | "usual" implies frequency; the derivation is a single most-recent row | Say so in the schema docblock (§1.3) |

**Suggested verdict: proceed.** F-1 needs the BA before QA writes AC-05's tests, and it does not
block DEV — both readings agree on everything DEV implements. F-2 and F-3 must land in the
implementation, not in a D2 review thread: each is one line, and each is the difference between a
test that passes and a story that works.

---

## 8. What this note does not touch

- `decisions.md` — DEV's file. Nothing here pre-empts it; §4 is a question for the BA, not a decision
  for DEV to record.
- The Gate D1 approval. This note is a persona obligation between D1 and D2, not a second gate
  (`ai/gates/delivery.md:37`).
- `myBooking`, `desks[]`, and every existing schema in `availability.ts`. This story is additive on
  the wire and subtracts nothing.
