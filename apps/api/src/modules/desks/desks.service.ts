/**
 * US-014's slice — `GET /api/admin/desks` — extended by US-016/AC-04, AC-05 to also tally each
 * desk's `bookedAhead` count, by US-017/AC-01, AC-04 to add `createDesk`, and by US-018/AC-01,
 * AC-02, AC-03, AC-07 to add `renameDesk`, the update side. No longer "a pure mapping, no clock
 * read": one `officeToday`/`nowMs` reading per call, threaded to the borrowed predicate or the
 * rename and nowhere else (US-016 design note §2.3; US-018 design note §2.2).
 */
import type { DeskUpdateResponse, DeskStateResponse, AdminDesk } from '@desk-booking/contracts';
import { officeToday } from '../../domain/booking-window.js';
import { displayStatusPredicate } from '../../domain/booking-history.js';
import type { DesksRepository } from './desks.repository.js';

export type CreateDeskOutcome = { kind: 'ok'; desk: AdminDesk } | { kind: 'duplicate' };
export type RenameDeskOutcome =
  | { kind: 'ok'; desk: DeskUpdateResponse }
  | { kind: 'duplicate' }
  | { kind: 'not_found' };

export type DeactivateDeskOutcome =
  | { kind: 'ok'; desk: DeskStateResponse }
  /** US-019/AC-04 (BR-001.9, V-09). `upcomingBookings` is ALWAYS >= 1 here — it is the number
   *  that caused the refusal, measured in this request (design note §6), and the number SCR-006
   *  ST-06 interpolates into both its body and its primary action's label. */
  | { kind: 'blocked'; upcomingBookings: number }
  | { kind: 'not_found' };

export type ActivateDeskOutcome = { kind: 'ok'; desk: DeskStateResponse } | { kind: 'not_found' };

export interface DesksServiceDeps {
  desks: DesksRepository;
  nowMs: () => number;
  officeTimezone: string;
}

export function createDesksService({ desks, nowMs, officeTimezone }: DesksServiceDeps) {
  return {
    /**
     * US-014/AC-03; US-016/AC-01, AC-04, AC-05. Maps the repository's rows to the wire shape,
     * preserving order, and annotates each with its `bookedAhead` count.
     *
     * ONE clock reading, threaded to the predicate and nothing else — the discipline
     * `listAllBookings` states for its own (`admin-bookings.service.ts`). Two `officeToday` calls
     * in one request could straddle an office midnight and produce a count that disagrees with
     * the list it annotates.
     *
     * `'confirmed'` and the `>= today` bound are never written literally here — both arrive from
     * `displayStatusPredicate`, the same function `deactivateDesk` (below) calls too, so this
     * count and that block cannot drift apart (US-016 design note §2.4; landed by US-019).
     */
    async listAllDesks(): Promise<AdminDesk[]> {
      const today = officeToday(nowMs(), officeTimezone);
      const predicate = displayStatusPredicate('confirmed', today);
      if (predicate.from === undefined) {
        // Reaching here means `displayStatusPredicate('confirmed', ...)` stopped returning a
        // floor — a change to that function this module must not silently tolerate.
        throw new Error("displayStatusPredicate('confirmed', today) returned no floor — this is a bug");
      }

      const [rows, upcomingDeskIds] = await Promise.all([
        desks.listAllDesks(),
        desks.listUpcomingConfirmedDeskIds(predicate.stored, predicate.from),
      ]);

      const counts = new Map<string, number>();
      for (const id of upcomingDeskIds) counts.set(id, (counts.get(id) ?? 0) + 1);

      return rows.map((row) => ({
        id: row.id,
        deskNumber: row.desk_number,
        isActive: row.is_active,
        // AC-05. `?? 0`, never `?? undefined` — a desk with no upcoming bookings reports ZERO,
        // and the em dash SCR-006 draws is a rendering of 0, not a second wire value.
        bookedAhead: counts.get(row.id) ?? 0,
      }));
    },

    /**
     * US-017/AC-01, AC-04. `deskNumber` arrives already normalised (`deskCreateSchema` at the
     * route edge) — this method does not normalise. `bookedAhead: 0` is a fact, not a filler: the
     * row was inserted microseconds ago, so no booking can reference it yet (design note §3.2).
     */
    async createDesk(deskNumber: string): Promise<CreateDeskOutcome> {
      const result = await desks.insertDesk(deskNumber);
      if (result.kind === 'duplicate') return result;

      return {
        kind: 'ok',
        desk: {
          id: result.desk.id,
          deskNumber: result.desk.desk_number,
          isActive: result.desk.is_active,
          bookedAhead: 0,
        },
      };
    },

    /**
     * US-018/AC-01, AC-02, AC-03, AC-05, AC-07. `deskNumber` arrives already normalised
     * (`deskUpdateSchema` at the route edge) — this method does not normalise. No `bookedAhead`
     * in the mapped result: the rename cannot change it (bookings reference `desks.id`, never
     * the number — AC-06) and this method never reads it (design note §3.3, §4).
     *
     * NO call to `listUpcomingConfirmedDeskIds` precedes the update — AC-03 requires the rename
     * to proceed regardless of how many upcoming bookings the desk holds, so nothing here may
     * gate on that count. This is the exact inverse of `deactivateDesk` (below), which DOES gate
     * on `countUpcomingConfirmedForDesk` — that asymmetry must not be collapsed by a future
     * refactor (design note §4; landed by US-019).
     *
     * The single `nowMs()` reading is this method's only clock read, passed to the repository as
     * `updated_at` — never a second reading, and never `now()` in SQL.
     *
     * AC-05 (nobody is notified): this method's only dependency is `desks` (see
     * `DesksServiceDeps`, above) — it has no notification dependency and cannot acquire one
     * without a visible change to that shape. A future author wiring a rename notification
     * (e.g. alongside US-029) must add that dependency here, not bolt it on silently.
     */
    async renameDesk(id: string, deskNumber: string): Promise<RenameDeskOutcome> {
      const result = await desks.updateDeskNumber(id, deskNumber, new Date(nowMs()));
      if (result.kind !== 'ok') return result;

      return {
        kind: 'ok',
        desk: {
          id: result.desk.id,
          deskNumber: result.desk.desk_number,
          isActive: result.desk.is_active,
        },
      };
    },

    /**
     * US-019/AC-01, AC-04, AC-05, AC-07, AC-08 (REQ-017, BR-001.7, BR-001.9, V-09).
     *
     * The count is taken HERE, in this request, immediately before the write — never from a
     * client-supplied number and never from a cached one. US-019/AC-08 is explicit: "the count is
     * a prediction, the server is the rule". `modules/desks/README.md` carries the same warning,
     * written for this method before it existed.
     *
     * ONE `nowMs()` reading, threaded to `displayStatusPredicate` and nowhere else — the
     * discipline `listAllDesks` states above. Two readings could straddle an office midnight and
     * block on a count that disagrees with the count reported.
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
      return {
        kind: 'ok',
        desk: { id: result.desk.id, deskNumber: result.desk.desk_number, isActive: result.desk.is_active },
      };
    },

    /**
     * US-019/AC-09 (REQ-017). No count, no rule, no confirmation — SCR-006's structural decision:
     * "activating adds one back, harms nobody, and is undone by the same control". A block here
     * would be inventing a rule BRD-001 does not have, and a symmetry argument for adding one is
     * exactly what SCR-006 rejected ("confirming both would train the administrator to dismiss the
     * dialog that matters").
     *
     * The ABSENCE of a `countUpcomingConfirmedForDesk` call in this method is US-019/AC-09's
     * server-side half and is worth asserting (design note §11).
     */
    async activateDesk(id: string): Promise<ActivateDeskOutcome> {
      const result = await desks.setDeskActive(id, true);
      if (result.kind !== 'ok') return result;
      return {
        kind: 'ok',
        desk: { id: result.desk.id, deskNumber: result.desk.desk_number, isActive: result.desk.is_active },
      };
    },
  };
}

export type DesksService = ReturnType<typeof createDesksService>;
