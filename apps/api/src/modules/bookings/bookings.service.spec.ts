import { describe, expect, it } from 'vitest';
import { createBookingsService } from './bookings.service.js';
import type { AvailabilityRepository } from './bookings.repository.js';
import {
  activeDesks,
  activeDeskRow,
  emptyAvailabilityRepository,
  fullyBookedDesks,
  inactiveDeskRow,
  partiallyTakenDeskIds,
  throwingAvailabilityRepository,
} from './bookings.fixtures.js';

const OFFICE_TIMEZONE = 'Asia/Kolkata';
const TODAY = '2026-09-16'; // Wednesday
const CALLER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OTHER_USER_ID = '9c858901-8a57-4791-81fe-4c455b099bc9';

/** Any instant that resolves to `officeDate` in Asia/Kolkata (UTC+5:30) — noon UTC is safely
 *  inside the same calendar day for that offset. */
function nowMsFor(officeDate: string): () => number {
  return () => Date.parse(`${officeDate}T12:00:00Z`);
}

const throwingRepo = throwingAvailabilityRepository;

describe('bookings.service.getAvailability — the projection (US-006/AC-02, AC-03)', () => {
  it('marks exactly the booked desk ids taken and every other active desk available, omitting none', async () => {
    const desks = activeDesks();
    const takenIds = partiallyTakenDeskIds(desks);
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async listActiveDesks() {
        return desks;
      },
      async listConfirmedDeskIds() {
        return takenIds;
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability(TODAY, CALLER_ID);

    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;

    expect(outcome.data.desks).toHaveLength(40);
    const takenSet = new Set(takenIds);
    for (const desk of outcome.data.desks) {
      expect(desk.status).toBe(takenSet.has(desk.id) ? 'taken' : 'available');
    }
    // The story's own AC-01 example.
    expect(outcome.data.desks.filter((d) => d.status === 'available')).toHaveLength(12);
  });

  it('echoes the requested date on the response', async () => {
    const service = createBookingsService({
      availability: emptyAvailabilityRepository,
      nowMs: nowMsFor(TODAY),
      officeTimezone: OFFICE_TIMEZONE,
    });

    const outcome = await service.getAvailability(TODAY, CALLER_ID);

    expect(outcome).toEqual({
      kind: 'ok',
      data: { date: TODAY, desks: [], myBooking: null, usualDeskId: null, nextFreeDays: [] },
    });
  });
});

describe('bookings.service.getAvailability — reuses the existing date-window guard (defence, not one of this story\'s ACs)', () => {
  it('refuses a weekend date inside the window without querying either table', async () => {
    const service = createBookingsService({ availability: throwingRepo, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability('2026-09-19', CALLER_ID); // Saturday

    expect(outcome).toEqual({ kind: 'refused', reason: 'closed' });
  });

  it('refuses a date beyond the 30-day window without querying either table', async () => {
    const service = createBookingsService({ availability: throwingRepo, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability('2026-10-17', CALLER_ID); // today + 31

    expect(outcome).toEqual({ kind: 'refused', reason: 'too-far-ahead' });
  });

  it('refuses a past date without querying either table', async () => {
    const service = createBookingsService({ availability: throwingRepo, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability('2026-09-15', CALLER_ID); // today - 1

    expect(outcome).toEqual({ kind: 'refused', reason: 'past' });
  });
});

describe('bookings.service.getAvailability — myBooking (US-007/AC-06)', () => {
  it("projects the caller's own confirmed booking as myBooking", async () => {
    const desk = activeDeskRow('desk-1', 'A-01');
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async listActiveDesks() {
        return [{ id: desk.id, desk_number: desk.desk_number }];
      },
      async listConfirmedDeskIds() {
        return [desk.id];
      },
      async findMyConfirmedBooking(userId, date) {
        if (userId !== CALLER_ID || date !== TODAY) return undefined;
        return { id: 'booking-1', desk_id: desk.id, desk_number: desk.desk_number };
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability(TODAY, CALLER_ID);

    expect(outcome).toMatchObject({
      kind: 'ok',
      data: { myBooking: { id: 'booking-1', deskId: desk.id, deskNumber: desk.desk_number } },
    });
  });

  it('projects myBooking: null when the caller holds no confirmed booking that date', async () => {
    const service = createBookingsService({
      availability: emptyAvailabilityRepository,
      nowMs: nowMsFor(TODAY),
      officeTimezone: OFFICE_TIMEZONE,
    });

    const outcome = await service.getAvailability(TODAY, CALLER_ID);

    expect(outcome).toMatchObject({ kind: 'ok', data: { myBooking: null } });
  });

  it("a DIFFERENT user's confirmed booking on the same date never surfaces as the caller's myBooking, though the desk still shows taken (US-007/AC-06 — the negative case, Architect design note §2.2/F-5)", async () => {
    const desk = activeDeskRow('desk-1', 'A-01');
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async listActiveDesks() {
        return [{ id: desk.id, desk_number: desk.desk_number }];
      },
      async listConfirmedDeskIds() {
        return [desk.id]; // taken — OTHER_USER_ID holds it
      },
      async findMyConfirmedBooking(userId) {
        // The repository itself filters on userId (proven in bookings.repository.spec.ts); this
        // stub models exactly that filter's outcome for a caller who is NOT the occupant —
        // catching a dropped `.eq('user_id', …)` upstream is what this stub's shape is for.
        if (userId === OTHER_USER_ID) return { id: 'booking-1', desk_id: desk.id, desk_number: desk.desk_number };
        return undefined;
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability(TODAY, CALLER_ID);

    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.data.myBooking).toBeNull();
    // Re-asserting US-006/AC-06's non-disclosure guarantee in the same file this story loosens
    // it (design note §2.2): the desk is TAKEN, and nothing in the body says by whom.
    expect(outcome.data.desks).toEqual([{ id: desk.id, deskNumber: desk.desk_number, status: 'taken' }]);
    const raw = JSON.stringify(outcome.data);
    expect(raw).not.toContain(OTHER_USER_ID);
    expect(raw).not.toContain('userId');
  });
});

describe('bookings.service.getAvailability — usualDeskId (US-008/FR-04)', () => {
  it("labels the caller's last-booked desk as usualDeskId when it is available today (US-008/AC-01)", async () => {
    const desk = activeDeskRow('desk-1', 'A-01');
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async listActiveDesks() {
        return [{ id: desk.id, desk_number: desk.desk_number }];
      },
      async findMyLastBookedDeskId() {
        return desk.id;
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability(TODAY, CALLER_ID);

    expect(outcome).toMatchObject({ kind: 'ok', data: { usualDeskId: desk.id } });
  });

  it('yields usualDeskId: null when the caller has never booked (US-008/AC-04)', async () => {
    const service = createBookingsService({
      availability: emptyAvailabilityRepository,
      nowMs: nowMsFor(TODAY),
      officeTimezone: OFFICE_TIMEZONE,
    });

    const outcome = await service.getAvailability(TODAY, CALLER_ID);

    expect(outcome).toMatchObject({ kind: 'ok', data: { usualDeskId: null } });
  });

  it('yields usualDeskId: null when the last-booked desk is taken today (US-008/AC-05)', async () => {
    const desk = activeDeskRow('desk-1', 'A-01');
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async listActiveDesks() {
        return [{ id: desk.id, desk_number: desk.desk_number }];
      },
      async listConfirmedDeskIds() {
        return [desk.id]; // taken by someone (possibly the caller themself, on a different date's booking)
      },
      async findMyLastBookedDeskId() {
        return desk.id;
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability(TODAY, CALLER_ID);

    expect(outcome).toMatchObject({ kind: 'ok', data: { usualDeskId: null } });
  });

  it('yields usualDeskId: null when the last-booked desk is inactive or absent today (US-008/AC-05)', async () => {
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async listActiveDesks() {
        return []; // the last-booked desk is inactive/retired — absent from the active list entirely
      },
      async findMyLastBookedDeskId() {
        return 'now-inactive-desk-id';
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability(TODAY, CALLER_ID);

    expect(outcome).toMatchObject({ kind: 'ok', data: { usualDeskId: null } });
  });

  it('still labels the last-booked desk when it is available under a DIFFERENT deskNumber than when booked, the filter matches on id, not name (US-008/AC-05, Edge cases — rename)', async () => {
    const desk = activeDeskRow('desk-1', 'B-09'); // renamed since the booking was made
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async listActiveDesks() {
        return [{ id: desk.id, desk_number: desk.desk_number }];
      },
      async findMyLastBookedDeskId() {
        return desk.id;
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability(TODAY, CALLER_ID);

    expect(outcome).toMatchObject({ kind: 'ok', data: { usualDeskId: desk.id } });
  });
});

describe('bookings.service.createBooking — the date guard (US-007/AC-11, FR-03)', () => {
  it('short-circuits a weekend date to date_refused without calling getDeskById or insertConfirmedBooking', async () => {
    const service = createBookingsService({ availability: throwingRepo, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.createBooking(CALLER_ID, { date: '2026-09-19', deskId: 'desk-1' });

    expect(outcome).toEqual({ kind: 'date_refused', reason: 'closed' });
  });

  it('short-circuits a date beyond the 30-day window to date_refused without calling the repository', async () => {
    const service = createBookingsService({ availability: throwingRepo, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.createBooking(CALLER_ID, { date: '2026-10-17', deskId: 'desk-1' });

    expect(outcome).toEqual({ kind: 'date_refused', reason: 'too-far-ahead' });
  });

  it('short-circuits a past date to date_refused without calling the repository', async () => {
    const service = createBookingsService({ availability: throwingRepo, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.createBooking(CALLER_ID, { date: '2026-09-15', deskId: 'desk-1' });

    expect(outcome).toEqual({ kind: 'date_refused', reason: 'past' });
  });
});

describe('bookings.service.createBooking — the desk guard (US-007/AC-12, FR-04)', () => {
  it('yields desk_not_found for a missing desk, without calling insertConfirmedBooking', async () => {
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async getDeskById() {
        return undefined;
      },
      async insertConfirmedBooking() {
        throw new Error('must not be called when the desk guard already refused');
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.createBooking(CALLER_ID, { date: TODAY, deskId: 'does-not-exist' });

    expect(outcome).toEqual({ kind: 'desk_not_found' });
  });

  it('yields desk_inactive for a desk with is_active: false, without calling insertConfirmedBooking', async () => {
    const inactive = inactiveDeskRow();
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async getDeskById() {
        return inactive;
      },
      async insertConfirmedBooking() {
        throw new Error('must not be called when the desk guard already refused');
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.createBooking(CALLER_ID, { date: TODAY, deskId: inactive.id });

    expect(outcome).toEqual({ kind: 'desk_inactive' });
  });
});

describe('bookings.service.createBooking — the insert outcome (US-007/FR-01, FR-02)', () => {
  it('maps a successful insert to ok, carrying the desk number already read by the desk guard', async () => {
    const desk = activeDeskRow('desk-1', 'A-02');
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async getDeskById() {
        return desk;
      },
      async insertConfirmedBooking() {
        return { kind: 'ok', id: 'new-booking-id' };
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.createBooking(CALLER_ID, { date: TODAY, deskId: desk.id });

    expect(outcome).toEqual({
      kind: 'ok',
      booking: { id: 'new-booking-id', deskId: desk.id, deskNumber: 'A-02', date: TODAY, status: 'confirmed' },
    });
  });

  it('maps a desk_conflict insert outcome straight through (US-007/AC-08)', async () => {
    const desk = activeDeskRow('desk-1');
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async getDeskById() {
        return desk;
      },
      async insertConfirmedBooking() {
        return { kind: 'desk_conflict' };
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.createBooking(CALLER_ID, { date: TODAY, deskId: desk.id });

    expect(outcome).toEqual({ kind: 'desk_conflict' });
  });

  it('maps a user_conflict insert outcome straight through (US-007/AC-05)', async () => {
    const desk = activeDeskRow('desk-1');
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async getDeskById() {
        return desk;
      },
      async insertConfirmedBooking() {
        return { kind: 'user_conflict' };
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.createBooking(CALLER_ID, { date: TODAY, deskId: desk.id });

    expect(outcome).toEqual({ kind: 'user_conflict' });
  });
});

describe('bookings.service.getAvailability — nextFreeDays (US-009/AC-01, AC-02, AC-06)', () => {
  it('offers the next two working days with a free desk when the selected date is fully booked', async () => {
    const desks = fullyBookedDesks();
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async listActiveDesks() {
        return desks;
      },
      async listConfirmedDeskIds() {
        return desks.map((d) => d.id); // every desk taken on TODAY
      },
      async listConfirmedDeskIdsInRange(from, to) {
        expect(from).toBe('2026-09-17');
        expect(to).toBe('2026-10-16'); // lastBookableDate(TODAY)
        // Thu 17 Sep is ALSO fully booked; Fri 18 and Mon 21 (weekend between) are free.
        return desks.map((d) => ({ booking_date: '2026-09-17', desk_id: d.id }));
      },
      async listMyConfirmedDatesInRange() {
        return [];
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability(TODAY, CALLER_ID);

    expect(outcome).toMatchObject({ kind: 'ok', data: { nextFreeDays: ['2026-09-18', '2026-09-21'] } });
  });

  it('skips a date the caller already holds a confirmed booking on, even when it is free (US-009/AC-06, BR-001.1)', async () => {
    const desks = fullyBookedDesks();
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async listActiveDesks() {
        return desks;
      },
      async listConfirmedDeskIds() {
        return desks.map((d) => d.id);
      },
      async listConfirmedDeskIdsInRange() {
        return []; // every candidate day has a free desk by occupancy alone
      },
      async listMyConfirmedDatesInRange() {
        return ['2026-09-17', '2026-09-18']; // the caller already holds Thu and Fri
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability(TODAY, CALLER_ID);

    expect(outcome).toMatchObject({ kind: 'ok', data: { nextFreeDays: ['2026-09-21', '2026-09-22'] } });
  });

  it('never runs the range reads when there are no active desks at all (US-009/AC-07)', async () => {
    let rangeCalls = 0;
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async listActiveDesks() {
        return [];
      },
      async listConfirmedDeskIdsInRange() {
        rangeCalls += 1;
        return [];
      },
      async listMyConfirmedDatesInRange() {
        rangeCalls += 1;
        return [];
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability(TODAY, CALLER_ID);

    expect(outcome).toMatchObject({ kind: 'ok', data: { nextFreeDays: [] } });
    expect(rangeCalls).toBe(0);
  });

  it('never runs the range reads when the selected date is not fully booked', async () => {
    const desks = activeDesks();
    const takenIds = partiallyTakenDeskIds(desks);
    let rangeCalls = 0;
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async listActiveDesks() {
        return desks;
      },
      async listConfirmedDeskIds() {
        return takenIds;
      },
      async listConfirmedDeskIdsInRange() {
        rangeCalls += 1;
        return [];
      },
      async listMyConfirmedDatesInRange() {
        rangeCalls += 1;
        return [];
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability(TODAY, CALLER_ID);

    expect(outcome).toMatchObject({ kind: 'ok', data: { nextFreeDays: [] } });
    expect(rangeCalls).toBe(0);
  });

  it("never runs the range reads when the caller already holds a booking for the date (ST-10 outranks ST-04, design note §2.6/§4.1)", async () => {
    const desks = fullyBookedDesks();
    const [firstDesk] = desks;
    if (!firstDesk) throw new Error('fixture must provide at least one desk');
    let rangeCalls = 0;
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async listActiveDesks() {
        return desks;
      },
      async listConfirmedDeskIds() {
        return desks.map((d) => d.id);
      },
      async findMyConfirmedBooking() {
        return { id: 'booking-1', desk_id: firstDesk.id, desk_number: firstDesk.desk_number };
      },
      async listConfirmedDeskIdsInRange() {
        rangeCalls += 1;
        return [];
      },
      async listMyConfirmedDatesInRange() {
        rangeCalls += 1;
        return [];
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability(TODAY, CALLER_ID);

    expect(outcome).toMatchObject({ kind: 'ok', data: { nextFreeDays: [] } });
    expect(rangeCalls).toBe(0);
  });

  it("never runs the range reads when the selected date is the window's last bookable day (US-009/AC-05, the from > to guard)", async () => {
    const desks = fullyBookedDesks();
    let rangeCalls = 0;
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async listActiveDesks() {
        return desks;
      },
      async listConfirmedDeskIds() {
        return desks.map((d) => d.id);
      },
      async listConfirmedDeskIdsInRange() {
        rangeCalls += 1;
        return [];
      },
      async listMyConfirmedDatesInRange() {
        rangeCalls += 1;
        return [];
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability('2026-10-16', CALLER_ID); // TODAY + 30, the window's edge

    expect(outcome).toMatchObject({ kind: 'ok', data: { nextFreeDays: [] } });
    expect(rangeCalls).toBe(0);
  });

  it('propagates a failed range read rather than resolving nextFreeDays: [] (honest failure — [] is itself a legitimate answer, AC-05)', async () => {
    const desks = fullyBookedDesks();
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async listActiveDesks() {
        return desks;
      },
      async listConfirmedDeskIds() {
        return desks.map((d) => d.id);
      },
      async listConfirmedDeskIdsInRange() {
        throw new Error('range read failed');
      },
      async listMyConfirmedDatesInRange() {
        return [];
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    await expect(service.getAvailability(TODAY, CALLER_ID)).rejects.toThrow('range read failed');
  });
});

describe('bookings.service.cancelBooking (US-007/AC-07, FR-06)', () => {
  it('maps a successful cancel to ok', async () => {
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async cancelOwnedBooking() {
        return { id: 'b1' };
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.cancelBooking(CALLER_ID, 'b1');

    expect(outcome).toEqual({ kind: 'ok' });
  });

  it('maps no matching row to not_found — not found, not owned, and not-currently-confirmed all land here alike (D-03)', async () => {
    const availability: AvailabilityRepository = {
      ...emptyAvailabilityRepository,
      async cancelOwnedBooking() {
        return undefined;
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.cancelBooking(CALLER_ID, 'not-mine-or-gone');

    expect(outcome).toEqual({ kind: 'not_found' });
  });
});
