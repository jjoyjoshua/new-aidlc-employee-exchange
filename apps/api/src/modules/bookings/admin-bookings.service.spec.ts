import { describe, expect, it } from 'vitest';
import { createAdminBookingsService, ADMIN_BOOKINGS_PAGE_SIZE } from './admin-bookings.service.js';
import type { AdminBookingRow, AdminBookingsRepository } from './admin-bookings.repository.js';

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

function stubRepository(page: { rows: AdminBookingRow[]; total: number }): AdminBookingsRepository {
  return {
    async listBookingsFromDate() {
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
    let capturedFrom: string | undefined;
    const repository: AdminBookingsRepository = {
      async listBookingsFromDate(from) {
        capturedFrom = from;
        return { rows: [], total: 0 };
      },
    };

    const result = await service(repository).listAllBookings(1);

    expect(capturedFrom).toBe(TODAY);
    expect(result.today).toBe(TODAY);
  });
});
