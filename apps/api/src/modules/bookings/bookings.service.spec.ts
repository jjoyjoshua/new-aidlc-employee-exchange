import { describe, expect, it } from 'vitest';
import { createBookingsService } from './bookings.service.js';
import type { AvailabilityRepository } from './bookings.repository.js';
import { activeDesks, partiallyTakenDeskIds } from './bookings.fixtures.js';

const OFFICE_TIMEZONE = 'Asia/Kolkata';
const TODAY = '2026-09-16'; // Wednesday

/** Any instant that resolves to `officeDate` in Asia/Kolkata (UTC+5:30) — noon UTC is safely
 *  inside the same calendar day for that offset. */
function nowMsFor(officeDate: string): () => number {
  return () => Date.parse(`${officeDate}T12:00:00Z`);
}

const throwingRepo: AvailabilityRepository = {
  async listActiveDesks() {
    throw new Error('must not be called for a refused date');
  },
  async listConfirmedDeskIds() {
    throw new Error('must not be called for a refused date');
  },
};

describe('bookings.service.getAvailability — the projection (US-006/AC-02, AC-03)', () => {
  it('marks exactly the booked desk ids taken and every other active desk available, omitting none', async () => {
    const desks = activeDesks();
    const takenIds = partiallyTakenDeskIds(desks);
    const availability: AvailabilityRepository = {
      async listActiveDesks() {
        return desks;
      },
      async listConfirmedDeskIds() {
        return takenIds;
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability(TODAY);

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
    const availability: AvailabilityRepository = {
      async listActiveDesks() {
        return [];
      },
      async listConfirmedDeskIds() {
        return [];
      },
    };
    const service = createBookingsService({ availability, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability(TODAY);

    expect(outcome).toEqual({ kind: 'ok', data: { date: TODAY, desks: [] } });
  });
});

describe('bookings.service.getAvailability — reuses the existing date-window guard (defence, not one of this story\'s ACs)', () => {
  it('refuses a weekend date inside the window without querying either table', async () => {
    const service = createBookingsService({ availability: throwingRepo, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability('2026-09-19'); // Saturday

    expect(outcome).toEqual({ kind: 'refused', reason: 'closed' });
  });

  it('refuses a date beyond the 30-day window without querying either table', async () => {
    const service = createBookingsService({ availability: throwingRepo, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability('2026-10-17'); // today + 31

    expect(outcome).toEqual({ kind: 'refused', reason: 'too-far-ahead' });
  });

  it('refuses a past date without querying either table', async () => {
    const service = createBookingsService({ availability: throwingRepo, nowMs: nowMsFor(TODAY), officeTimezone: OFFICE_TIMEZONE });

    const outcome = await service.getAvailability('2026-09-15'); // today - 1

    expect(outcome).toEqual({ kind: 'refused', reason: 'past' });
  });
});
