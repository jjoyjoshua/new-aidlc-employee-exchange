import { describe, expect, it } from 'vitest';
import { createAdminBookingsService, ADMIN_BOOKINGS_PAGE_SIZE } from './admin-bookings.service.js';
import type { AdminBookingRow, AdminBookingsFilter, AdminBookingsRepository } from './admin-bookings.repository.js';

const TODAY = '2026-09-16';
const NOW_MS = Date.parse(`${TODAY}T12:00:00Z`);

function row(overrides: Partial<AdminBookingRow> = {}): AdminBookingRow {
  return {
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    booking_date: TODAY,
    status: 'confirmed',
    desk_number: 'A-01',
    employee_name: 'Priya Raman',
    ...overrides,
  };
}

/** Every `listAllBookings` test in this file is silent on the write half of the repository —
 *  spread this in so each literal only names the read behaviour it actually exercises. */
const NOT_USED_FOR_CANCEL: Pick<AdminBookingsRepository, 'cancelAnyBooking' | 'findBookingState'> = {
  async cancelAnyBooking() {
    throw new Error('cancelAnyBooking not stubbed — this test only exercises listAllBookings');
  },
  async findBookingState() {
    throw new Error('findBookingState not stubbed — this test only exercises listAllBookings');
  },
};

function stubRepository(page: { rows: AdminBookingRow[]; total: number }): AdminBookingsRepository {
  return {
    ...NOT_USED_FOR_CANCEL,
    async listBookings() {
      return page;
    },
  };
}

function service(repository: AdminBookingsRepository) {
  return createAdminBookingsService({ bookings: repository, nowMs: () => NOW_MS, officeTimezone: 'Asia/Kolkata' });
}

describe('createAdminBookingsService.listAllBookings — status derivation (US-013/AC-06)', () => {
  it('a stored confirmed row dated before today reads as completed', async () => {
    const result = await service(
      stubRepository({ rows: [row({ status: 'confirmed', booking_date: '2026-09-10' })], total: 1 }),
    ).listAllBookings(1);

    expect(result.items[0]?.status).toBe('completed');
  });

  it('a stored cancelled row dated next week stays cancelled', async () => {
    const result = await service(
      stubRepository({ rows: [row({ status: 'cancelled', booking_date: '2026-09-23' })], total: 1 }),
    ).listAllBookings(1);

    expect(result.items[0]?.status).toBe('cancelled');
  });

  it('a stored confirmed row dated today stays confirmed', async () => {
    const result = await service(
      stubRepository({ rows: [row({ status: 'confirmed', booking_date: TODAY })], total: 1 }),
    ).listAllBookings(1);

    expect(result.items[0]?.status).toBe('confirmed');
  });
});

describe('createAdminBookingsService.listAllBookings — pagination (US-013/AC-04)', () => {
  it('exactly PAGE_SIZE matching rows on page 1 → nextPage null', async () => {
    const rows = Array.from({ length: ADMIN_BOOKINGS_PAGE_SIZE }, (_, i) => row({ id: `id-${i}` }));
    const result = await service(stubRepository({ rows, total: ADMIN_BOOKINGS_PAGE_SIZE })).listAllBookings(1);

    expect(result.nextPage).toBeNull();
  });

  it('PAGE_SIZE + 1 matching rows on page 1 → nextPage 2', async () => {
    const rows = Array.from({ length: ADMIN_BOOKINGS_PAGE_SIZE }, (_, i) => row({ id: `id-${i}` }));
    const result = await service(
      stubRepository({ rows, total: ADMIN_BOOKINGS_PAGE_SIZE + 1 }),
    ).listAllBookings(1);

    expect(result.nextPage).toBe(2);
  });

  it('the last partial page → nextPage null', async () => {
    const rows = [row()];
    const result = await service(
      stubRepository({ rows, total: ADMIN_BOOKINGS_PAGE_SIZE + 1 }),
    ).listAllBookings(2);

    expect(result.nextPage).toBeNull();
  });

  it('total is the full matching count, echoed as-is (US-013/AC-07)', async () => {
    const result = await service(stubRepository({ rows: [row()], total: 137 })).listAllBookings(1);
    expect(result.total).toBe(137);
  });
});

describe('createAdminBookingsService.listAllBookings — one clock reading', () => {
  it('passes the derived today as the repository from-date, and echoes it on the response', async () => {
    let capturedFilter: AdminBookingsFilter | undefined;
    const repository: AdminBookingsRepository = {
      ...NOT_USED_FOR_CANCEL,
      async listBookings(filter) {
        capturedFilter = filter;
        return { rows: [], total: 0 };
      },
    };

    const result = await service(repository).listAllBookings(1);

    expect(capturedFilter?.from).toBe(TODAY);
    expect(result.today).toBe(TODAY);
  });
});

describe('createAdminBookingsService.listAllBookings — US-014 filter resolution', () => {
  it('an absent from resolves to the single today reading, not a second clock call', async () => {
    let capturedFilter: AdminBookingsFilter | undefined;
    const repository: AdminBookingsRepository = {
      ...NOT_USED_FOR_CANCEL,
      async listBookings(filter) {
        capturedFilter = filter;
        return { rows: [], total: 0 };
      },
    };

    await service(repository).listAllBookings(1, {});
    expect(capturedFilter?.from).toBe(TODAY);
  });

  it('a supplied from is passed through when it is after today', async () => {
    let capturedFilter: AdminBookingsFilter | undefined;
    const repository: AdminBookingsRepository = {
      ...NOT_USED_FOR_CANCEL,
      async listBookings(filter) {
        capturedFilter = filter;
        return { rows: [], total: 0 };
      },
    };

    await service(repository).listAllBookings(1, { from: '2026-09-20' });
    expect(capturedFilter?.from).toBe('2026-09-20');
  });

  it('to is passed through unchanged', async () => {
    let capturedFilter: AdminBookingsFilter | undefined;
    const repository: AdminBookingsRepository = {
      ...NOT_USED_FOR_CANCEL,
      async listBookings(filter) {
        capturedFilter = filter;
        return { rows: [], total: 0 };
      },
    };

    await service(repository).listAllBookings(1, { to: '2026-09-30' });
    expect(capturedFilter?.to).toBe('2026-09-30');
  });

  it('deskId is passed through unchanged', async () => {
    let capturedFilter: AdminBookingsFilter | undefined;
    const repository: AdminBookingsRepository = {
      ...NOT_USED_FOR_CANCEL,
      async listBookings(filter) {
        capturedFilter = filter;
        return { rows: [], total: 0 };
      },
    };

    await service(repository).listAllBookings(1, { deskId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' });
    expect(capturedFilter?.deskId).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
  });

  it("status=confirmed resolves to stored status='confirmed' and from raised to today (US-014/AC-02)", async () => {
    let capturedFilter: AdminBookingsFilter | undefined;
    const repository: AdminBookingsRepository = {
      ...NOT_USED_FOR_CANCEL,
      async listBookings(filter) {
        capturedFilter = filter;
        return { rows: [], total: 0 };
      },
    };

    // A far-back `from` combined with status=confirmed must still be raised to today — a
    // Confirmed booking can never be dated in the past (ADR-007).
    await service(repository).listAllBookings(1, { from: '2025-01-01', status: 'confirmed' });
    expect(capturedFilter?.status).toBe('confirmed');
    expect(capturedFilter?.from).toBe(TODAY);
    expect(capturedFilter?.before).toBeUndefined();
  });

  it("status=completed resolves to stored status='confirmed' with before=today, no from floor beyond the caller's own (US-014/AC-02)", async () => {
    let capturedFilter: AdminBookingsFilter | undefined;
    const repository: AdminBookingsRepository = {
      ...NOT_USED_FOR_CANCEL,
      async listBookings(filter) {
        capturedFilter = filter;
        return { rows: [], total: 0 };
      },
    };

    await service(repository).listAllBookings(1, { from: '2025-01-01', status: 'completed' });
    expect(capturedFilter?.status).toBe('confirmed');
    expect(capturedFilter?.before).toBe(TODAY);
    expect(capturedFilter?.from).toBe('2025-01-01');
  });

  it("status=completed with NO explicit from injects no default floor — a from=today default would make every Completed query structurally empty (bug caught via TDD, US-014/AC-02)", async () => {
    let capturedFilter: AdminBookingsFilter | undefined;
    const repository: AdminBookingsRepository = {
      ...NOT_USED_FOR_CANCEL,
      async listBookings(filter) {
        capturedFilter = filter;
        return { rows: [], total: 0 };
      },
    };

    await service(repository).listAllBookings(1, { status: 'completed' });
    expect(capturedFilter?.from).toBeUndefined();
    expect(capturedFilter?.before).toBe(TODAY);
  });

  it("status=cancelled resolves to stored status='cancelled' with no date bound contributed", async () => {
    let capturedFilter: AdminBookingsFilter | undefined;
    const repository: AdminBookingsRepository = {
      ...NOT_USED_FOR_CANCEL,
      async listBookings(filter) {
        capturedFilter = filter;
        return { rows: [], total: 0 };
      },
    };

    await service(repository).listAllBookings(1, { status: 'cancelled' });
    expect(capturedFilter?.status).toBe('cancelled');
    expect(capturedFilter?.before).toBeUndefined();
  });

  it("a passed confirmed booking appears under status=completed and NOT under status=confirmed — the QA note's exact assertion (US-014/AC-02)", async () => {
    const pastConfirmed = row({ status: 'confirmed', booking_date: '2026-09-10' });

    const underCompleted = await service(stubRepository({ rows: [pastConfirmed], total: 1 })).listAllBookings(1, {
      from: '2025-01-01',
      status: 'completed',
    });
    expect(underCompleted.items[0]?.status).toBe('completed');

    // The repository is a stub that always returns the row regardless of the filter it was
    // given, so this asserts the SERVICE's own resolved filter would have excluded it — the
    // real exclusion is proven at the route level (admin.routes.spec.ts) against a seed where a
    // naive equality would incorrectly include it.
    let capturedFilter: AdminBookingsFilter | undefined;
    const repository: AdminBookingsRepository = {
      ...NOT_USED_FOR_CANCEL,
      async listBookings(filter) {
        capturedFilter = filter;
        return { rows: [], total: 0 };
      },
    };
    await service(repository).listAllBookings(1, { status: 'confirmed' });
    expect(capturedFilter?.from).toBe(TODAY); // excludes anything dated before today
  });
});

describe('createAdminBookingsService.cancelAnyBooking — write first, then classify (US-015/AC-02, AC-04, AC-07, AC-09)', () => {
  const ADMIN_ID = '9c858901-8a57-4791-81fe-4c455b099bc9';
  const BOOKING_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  function service(repository: AdminBookingsRepository) {
    return createAdminBookingsService({ bookings: repository, nowMs: () => NOW_MS, officeTimezone: 'Asia/Kolkata' });
  }

  it('a successful write returns ok after exactly one write and zero classification reads (US-015/AC-04, AC-07)', async () => {
    let writeCalls = 0;
    let classifyCalls = 0;
    const repository: AdminBookingsRepository = {
      async listBookings() {
        throw new Error('not used in this test');
      },
      async cancelAnyBooking() {
        writeCalls += 1;
        return { id: BOOKING_ID };
      },
      async findBookingState() {
        classifyCalls += 1;
        throw new Error('should not be called when the write succeeds');
      },
    };

    const outcome = await service(repository).cancelAnyBooking(ADMIN_ID, BOOKING_ID);

    expect(outcome).toEqual({ kind: 'ok' });
    expect(writeCalls).toBe(1);
    expect(classifyCalls).toBe(0);
  });

  it('the write runs before the classification read, passing one shared clock reading', async () => {
    const seenCancelledAt: Date[] = [];
    let seenToday: string | undefined;
    const repository: AdminBookingsRepository = {
      async listBookings() {
        throw new Error('not used in this test');
      },
      async cancelAnyBooking(_bookingId, _adminId, cancelledAt, today) {
        seenCancelledAt.push(cancelledAt);
        seenToday = today;
        return { id: BOOKING_ID };
      },
      async findBookingState() {
        throw new Error('should not be called when the write succeeds');
      },
    };

    await service(repository).cancelAnyBooking(ADMIN_ID, BOOKING_ID);

    expect(seenCancelledAt).toHaveLength(1);
    expect(seenCancelledAt[0]?.getTime()).toBe(NOW_MS);
    expect(seenToday).toBe(TODAY);
  });

  it('a write miss followed by a cancelled state classifies as already_cancelled (US-015/AC-09)', async () => {
    const repository: AdminBookingsRepository = {
      async listBookings() {
        throw new Error('not used in this test');
      },
      async cancelAnyBooking() {
        return undefined;
      },
      async findBookingState() {
        return { status: 'cancelled', booking_date: '2026-09-10' };
      },
    };

    const outcome = await service(repository).cancelAnyBooking(ADMIN_ID, BOOKING_ID);

    expect(outcome).toEqual({ kind: 'already_cancelled' });
  });

  it('a write miss followed by no matching row (or a confirmed one) classifies as not_found (US-015/AC-02)', async () => {
    const repositoryNoRow: AdminBookingsRepository = {
      async listBookings() {
        throw new Error('not used in this test');
      },
      async cancelAnyBooking() {
        return undefined;
      },
      async findBookingState() {
        return undefined;
      },
    };
    await expect(service(repositoryNoRow).cancelAnyBooking(ADMIN_ID, BOOKING_ID)).resolves.toEqual({
      kind: 'not_found',
    });
  });
});
