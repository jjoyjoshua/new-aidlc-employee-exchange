/**
 * US-014's read slice — `GET /api/admin/desks`. Architect design note §3
 * (`inception/specs/US-014-filter-all-bookings/design-note.md`); ADR-004 for why this read lives
 * in its own module rather than inside `modules/bookings`. US-017 adds the write side —
 * `POST /api/admin/desks` — and the desk-number format rule both sides evaluate identically
 * (`inception/specs/US-017-add-a-desk/design-note.md` §2, §5). US-018 adds the update side —
 * `PATCH /api/admin/desks/:id` — reusing `deskNumberSchema` rather than restating it
 * (`inception/specs/US-018-correct-a-desk-number/design-note.md` §3.2).
 */
import { z } from 'zod';

/** One desk in the administrator's desk vocabulary (US-014/AC-03, story Edge cases). Every desk,
 *  ACTIVE AND INACTIVE — an inactive desk's historic bookings must stay findable. Deliberately NOT
 *  `deskAvailabilitySchema` (`availability.ts`): that shape's `status` is a per-date occupancy
 *  fact, and an inactive desk is absent from it entirely — the opposite of what this filter needs
 *  (design note §0). */
export const adminDeskSchema = z.object({
  id: z.string().uuid(),
  /** `A-01` (BR-001.4). `z.string().min(1)`, not the format regex — strictness belongs on
   *  requests, exactly as `deskAvailabilitySchema.deskNumber` records. */
  deskNumber: z.string().min(1),
  /** `desks.is_active` (REQ-017, BR-001.7), carried so the filter can mark an inactive desk in
   *  its own list rather than hiding it. */
  isActive: z.boolean(),
  /**
   * US-016/AC-04, AC-05 (BR-001.9). How many CONFIRMED bookings this desk holds dated the
   * office's today or later — the exact quantity US-019's hard block tests, which is why
   * SCR-006 shows it: the block becomes predictable instead of discovered.
   *
   * "Today" is the OFFICE's today, resolved server-side from one clock reading per request
   * (NFR-001) — never the browser's. A count computed against a device date would disagree
   * with the block that refuses the deactivation.
   *
   * REQUIRED, and 0 rather than absent. AC-05's whole content is that none must not look like
   * missing data; an optional field makes "no upcoming bookings" and "this server did not tell
   * you" the same value on the wire, and no amount of rendering recovers that. The em dash
   * SCR-006 draws is a RENDERING of 0 (US-016 design note §7.2), not a second wire value.
   *
   * Cancelled bookings, Completed ones and past Confirmed ones are all excluded — see
   * `domain/booking-history.ts`'s `displayStatusPredicate`, which is where the predicate lives
   * and the only place it may be written (US-016 design note §2.4).
   */
  bookedAhead: z.number().int().nonnegative(),
});
export type AdminDesk = z.infer<typeof adminDeskSchema>;

/**
 * `GET /api/admin/desks`'s `200` body. An OBJECT, not a bare array — US-016 added `bookedAhead`
 * to `adminDeskSchema` additively, exactly as this shape was built to allow (ADR-002's
 * asymmetry; US-016 design note §3.1), without changing this envelope's own type. Not
 * `.strict()` — every response in this package is additive-safe (`auth.ts`'s stated rule).
 */
export const adminDesksResponseSchema = z.object({
  /** Ordered `desk_number` ASC — `desks_desk_number_key` already serves the ORDER BY, so no new
   *  index is needed. */
  desks: z.array(adminDeskSchema),
});
export type AdminDesksResponse = z.infer<typeof adminDesksResponseSchema>;

/** BR-001.4, V-16 (US-017/AC-02). The ONE statement of the desk-number format in this project.
 *  Both sides test against this constant — never a re-typed literal, the lesson `password.ts`
 *  records for its own policy ("two regexes for one rule is how the checklist and the refusal
 *  come to disagree"). */
export const DESK_NUMBER_PATTERN = /^[A-Z]-\d{2}$/;

/**
 * BR-001.4, BR-001.8, V-08, US-017/AC-03, AC-05. Trim, then upper — in that order, and it is
 * IDEMPOTENT (`f(f(x)) === f(x)`), which is what lets the browser normalise before sending and
 * the server normalise again on arrival with no third answer possible.
 *
 * This produces the STORED value, not merely a comparison key: AC-03 requires `a-07` to be
 * stored and displayed as `A-07`, and `0002_desks.sql`'s
 * `desks_desk_number_format` CHECK would REFUSE anything else — which is that migration's own
 * stated intent.
 *
 * `toUpperCase()`, not `toLocaleUpperCase()`: the alphabet is `A`-`Z` and a locale (e.g. Turkish
 * dotless `ı`) must never enter this function's behaviour.
 */
export function normalizeDeskNumber(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * The desk number as it may arrive on a request (US-017/AC-02, AC-03, AC-05; V-08, V-16).
 *
 * `.max(20)` is a guard against a pathological body, NOT a policy — the same distinction
 * `password.ts` draws for its own `.max(200)`. It bounds the string BEFORE the trim so a
 * megabyte of spaces is refused rather than trimmed.
 *
 * `.transform` then `.refine`, in that order and not the reverse: the parsed OUTPUT is the
 * normalised value, so `parsed.data.deskNumber` is what gets stored and there is no second place
 * to remember to uppercase (design note §2.4). `a-07` parses to `A-07`; `a-7` does not parse
 * at all.
 *
 * Exported on its own so a future edit request (US-018) reuses it rather than restating the
 * rule — and it now does (`deskUpdateSchema`, below).
 */
export const deskNumberSchema = z
  .string()
  .max(20)
  .transform(normalizeDeskNumber)
  .refine((value) => DESK_NUMBER_PATTERN.test(value), {
    message: 'Use one letter, a dash and two digits — like A-01.',
  });

/**
 * `POST /api/admin/desks`'s one legitimate body (US-017/AC-01). `.strict()` — an unknown field is
 * rejected, not ignored, matching every other request schema in this package.
 *
 * ONE field. No `isActive`: BRD-001 gives no way to create an inactive desk and US-017's own
 * edge cases refuse to add one (design note §1.1 — a Gate 1 conflict with SCR-007's approved
 * frames, tracked for reconciliation as a change-request rather than built speculatively here).
 *
 * No `id`: the database mints it. A caller-supplied primary key is an attack surface, not a
 * convenience.
 */
export const deskCreateSchema = z.object({ deskNumber: deskNumberSchema }).strict();
export type DeskCreateRequest = z.input<typeof deskCreateSchema>;

/**
 * `PATCH /api/admin/desks/:id`'s path parameter (US-018/AC-01). One param, a uuid, `.strict()` —
 * the shape `cancelBookingParamsSchema` (`bookings.ts`) established and US-015 reused verbatim.
 *
 * NOT `cancelBookingParamsSchema` itself, although it is structurally identical: that schema's
 * name asserts the id is a booking's. A desk id validated by a booking's schema typechecks and
 * then misleads every future reader of both.
 */
export const deskIdParamsSchema = z.object({ id: z.string().uuid() }).strict();
export type DeskIdParams = z.infer<typeof deskIdParamsSchema>;

/**
 * `PATCH /api/admin/desks/:id`'s one legitimate body (US-018/AC-01, AC-02). `.strict()` — an
 * unknown field is rejected, not ignored, matching every other request schema in this package.
 *
 * `deskNumberSchema` is REUSED, not restated — AC-02's "the same format and uniqueness rules
 * apply as on create" is true because it is the SAME object, not because two copies agree today.
 *
 * NOT `export const deskUpdateSchema = deskCreateSchema`, although the two are structurally
 * identical right now. They are two contracts that happen to coincide: issue #49 may add a
 * required `isActive` to CREATE, which SCR-007 forbids on EDIT ("Status choice on add, absent on
 * edit"). An alias would put a status field on this endpoint silently, the day that resolves.
 *
 * No `id` in the body: it is the path parameter, and accepting it in both places creates two
 * sources for one fact that can disagree (design note §3.2).
 */
export const deskUpdateSchema = z.object({ deskNumber: deskNumberSchema }).strict();
export type DeskUpdateRequest = z.input<typeof deskUpdateSchema>;

/**
 * `PATCH /api/admin/desks/:id`'s `200` body (US-018/AC-01).
 *
 * DERIVED from `adminDeskSchema` with `.omit`, never re-declared — so it cannot drift from the
 * shape `GET /api/admin/desks` returns.
 *
 * `bookedAhead` is omitted deliberately: a rename cannot change it (bookings reference `desks.id`,
 * never the number — US-018/AC-06), the server has not re-read it, and sending it back would cost
 * a second query to restate an invariant. The browser keeps the count it already has (design note
 * §3.3, §4).
 */
export const deskUpdateResponseSchema = adminDeskSchema.omit({ bookedAhead: true });
export type DeskUpdateResponse = z.infer<typeof deskUpdateResponseSchema>;
