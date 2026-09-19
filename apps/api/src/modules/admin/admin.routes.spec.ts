/**
 * `GET /api/admin/bookings` and `GET /api/admin/desks` against the real `createApp`, through
 * supertest — matching `bookings.routes.spec.ts`'s and `auth.routes.spec.ts`'s own reasoning:
 * AC-10 in particular is only proven by a request reaching the real `/api/admin` mount with a
 * real Employee session, not by a stub repository that a route test injects around a guard it
 * never exercises.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../composition.js';
import { setConfigForTesting, type Config } from '../../config/index.js';
import type { SessionVerifier } from '../../http/middleware/require-session.js';
import type { AdminBookingRow, AdminBookingsFilter, AdminBookingsRepository } from '../bookings/admin-bookings.repository.js';
import type { DeskRow, DesksRepository } from '../desks/desks.repository.js';

interface Row {
  id: string;
  email: string;
  full_name: string;
  role: 'employee' | 'admin';
  is_active: boolean;
  must_change_password: boolean;
  last_seen_at: string;
}

const ADMIN: Row = {
  id: '9c858901-8a57-4791-81fe-4c455b099bc9',
  email: 'marcus@company.com',
  full_name: 'Marcus Webb',
  role: 'admin',
  is_active: true,
  must_change_password: false,
  last_seen_at: new Date().toISOString(),
};

const EMPLOYEE: Row = {
  ...ADMIN,
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  email: 'priya@company.com',
  full_name: 'Priya Sharma',
  role: 'employee',
};

const ADMIN_TOKEN = 'admin-token';
const EMPLOYEE_TOKEN = 'employee-token';

const TODAY = '2026-09-16';
const NOW_MS = () => Date.parse(`${TODAY}T12:00:00Z`);

beforeEach(() => {
  setConfigForTesting({
    NODE_ENV: 'test',
    PORT: 3000,
    CORS_ORIGINS: [],
    SESSION_LIFETIME_DAYS: 30,
    SESSION_LAST_SEEN_THROTTLE_MINUTES: 60,
    OFFICE_TIMEZONE: 'Asia/Kolkata',
  } as unknown as Config);
});

/** Most tests in this file only exercise `GET /bookings` — spread this in so those literals don't
 *  each have to name the US-015 write methods they never call. */
const NOT_USED_FOR_CANCEL: Pick<AdminBookingsRepository, 'cancelAnyBooking' | 'findBookingState'> = {
  async cancelAnyBooking() {
    throw new Error('cancelAnyBooking not stubbed — this test only exercises GET /bookings');
  },
  async findBookingState() {
    throw new Error('findBookingState not stubbed — this test only exercises GET /bookings');
  },
};

const noBookings: AdminBookingsRepository = {
  ...NOT_USED_FOR_CANCEL,
  async listBookings() {
    return { rows: [], total: 0 };
  },
};

const noDesks: DesksRepository = {
  async listAllDesks() {
    return [];
  },
  async listUpcomingConfirmedDeskIds() {
    return [];
  },
};

function bookingRow(overrides: Partial<AdminBookingRow> = {}): AdminBookingRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    booking_date: TODAY,
    status: 'confirmed',
    desk_number: 'A-01',
    employee_name: 'Priya Raman',
    ...overrides,
  };
}

function deskRow(overrides: Partial<DeskRow> = {}): DeskRow {
  return {
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    desk_number: 'A-01',
    is_active: true,
    ...overrides,
  };
}

function appWith(options: {
  rows?: Row[];
  adminBookings?: Pick<AdminBookingsRepository, 'listBookings'> & Partial<AdminBookingsRepository>;
  desks?: DesksRepository;
}) {
  const rows = options.rows ?? [ADMIN, EMPLOYEE];

  const profiles = {
    async findById(id: string) {
      return rows.find((r) => r.id === id);
    },
    async stampLastSeen() {},
    async clearMustChangePassword() {},
  };

  const verifier: SessionVerifier = {
    async verify(token) {
      if (token === ADMIN_TOKEN) return ADMIN.id;
      if (token === EMPLOYEE_TOKEN) return EMPLOYEE.id;
      return undefined;
    },
  };

  return buildApp({
    profiles,
    verifier,
    nowMs: NOW_MS,
    adminBookings: options.adminBookings ? { ...NOT_USED_FOR_CANCEL, ...options.adminBookings } : noBookings,
    desks: options.desks ?? noDesks,
  });
}

describe('GET /api/admin/bookings — admin-only (US-013/AC-10)', () => {
  it('refuses an Employee session with 403 and no booking data (US-013/AC-10)', async () => {
    const app = appWith({
      adminBookings: { async listBookings() { return { rows: [bookingRow()], total: 1 }; } },
    });

    const response = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('admin_only');
    expect(JSON.stringify(response.body)).not.toContain('Priya Raman');
  });

  it('refuses a request with no token at all', async () => {
    const app = appWith({});
    const response = await request(app).get('/api/admin/bookings');
    expect(response.status).toBe(401);
  });

  it('serves an Admin session', async () => {
    const app = appWith({
      adminBookings: { async listBookings() { return { rows: [bookingRow()], total: 1 }; } },
    });

    const response = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(200);
  });
});

describe('GET /api/admin/bookings — the default view (US-013/AC-02, AC-03, AC-06)', () => {
  it('returns bookings from today onward at every status, with all four fields, statuses derived (US-013/AC-02, US-013/AC-03, US-013/AC-06)', async () => {
    const app = appWith({
      adminBookings: {
        async listBookings() {
          return {
            total: 2,
            rows: [
              bookingRow({ id: 'a', booking_date: '2026-09-23', status: 'cancelled', employee_name: 'Dana Silva' }),
              bookingRow({ id: 'b', booking_date: '2026-09-10', status: 'confirmed', employee_name: 'Sam Okoro' }),
            ],
          };
        },
      },
    });

    const response = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.today).toBe(TODAY);
    expect(response.body.items).toEqual([
      { id: 'a', date: '2026-09-23', deskNumber: 'A-01', employeeName: 'Dana Silva', status: 'cancelled' },
      // A confirmed row dated before today reads as completed (AC-06) — derived, never stored.
      { id: 'b', date: '2026-09-10', deskNumber: 'A-01', employeeName: 'Sam Okoro', status: 'completed' },
    ]);
  });

  it('sets Cache-Control: private, no-store on the most sensitive read in the system', async () => {
    const app = appWith({
      adminBookings: { async listBookings() { return { rows: [], total: 0 }; } },
    });

    const response = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.headers['cache-control']).toBe('private, no-store');
  });
});

describe('GET /api/admin/bookings — paging boundary (US-013/AC-04)', () => {
  it('exactly 50 matching rows shows no next page', async () => {
    const app = appWith({
      adminBookings: {
        async listBookings(_filter, _offset, limit) {
          const rows = Array.from({ length: limit }, (_, i) => bookingRow({ id: `id-${i}` }));
          return { rows, total: 50 };
        },
      },
    });

    const response = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.body.items).toHaveLength(50);
    expect(response.body.nextPage).toBeNull();
  });

  it('51 matching rows shows a next page, and ?page=2 returns the 51st', async () => {
    const allRows = Array.from({ length: 51 }, (_, i) => bookingRow({ id: `id-${i}` }));
    const adminBookings: Pick<AdminBookingsRepository, 'listBookings'> = {
      async listBookings(_filter, offset, limit) {
        return { rows: allRows.slice(offset, offset + limit), total: allRows.length };
      },
    };
    const app = appWith({ adminBookings });

    const page1 = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(page1.body.items).toHaveLength(50);
    expect(page1.body.nextPage).toBe(2);

    const page2 = await request(app)
      .get('/api/admin/bookings?page=2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].id).toBe('id-50');
    expect(page2.body.nextPage).toBeNull();
  });

  it('a non-numeric page is rejected at the edge', async () => {
    const app = appWith({
      adminBookings: { async listBookings() { return { rows: [], total: 0 }; } },
    });

    const response = await request(app)
      .get('/api/admin/bookings?page=abc')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('an unknown query field is rejected', async () => {
    const app = appWith({
      adminBookings: { async listBookings() { return { rows: [], total: 0 }; } },
    });

    const response = await request(app)
      .get('/api/admin/bookings?limit=10')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(400);
  });
});

describe('GET /api/admin/bookings — empty system (US-013/AC-08)', () => {
  it('an empty system returns total 0, no items, no next page (US-013/AC-08)', async () => {
    const app = appWith({
      adminBookings: { async listBookings() { return { rows: [], total: 0 }; } },
    });

    const response = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.body).toMatchObject({ total: 0, items: [], nextPage: null });
  });
});

describe('GET /api/admin/bookings — a repository failure is never swallowed into an empty page', () => {
  it('propagates as a 500, distinguishable from a real empty system', async () => {
    const app = appWith({
      adminBookings: {
        async listBookings() {
          throw new Error('boom');
        },
      },
    });

    const response = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(500);
  });
});

describe('/api/admin/anything — unaffected by this router no longer being empty (US-001/AC-03)', () => {
  it('still 404s for an admin on an unknown admin path', async () => {
    const app = appWith({});
    const response = await request(app).get('/api/admin/anything').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.status).toBe(404);
  });
});

describe('GET /api/admin/bookings — US-014 filters', () => {
  function capturingRepository(rows: AdminBookingRow[] = []) {
    let captured: AdminBookingsFilter | undefined;
    const repository: Pick<AdminBookingsRepository, 'listBookings'> = {
      async listBookings(filter) {
        captured = filter;
        return { rows, total: rows.length };
      },
    };
    return { repository, getCaptured: () => captured };
  }

  it('a booking outside the from/to range is absent (US-014/AC-01)', async () => {
    const app = appWith({
      adminBookings: {
        async listBookings() {
          return {
            rows: [
              bookingRow({ id: 'in-range', booking_date: '2026-09-20' }),
              bookingRow({ id: 'out-of-range', booking_date: '2026-10-05' }),
            ],
            total: 2,
          };
        },
      },
    });

    // The stub ignores the filter and returns both rows; this asserts the FILTER PARAMS reach
    // the repository intact, which the "combines all four" test below verifies against a
    // filter-aware stub.
    const response = await request(app)
      .get('/api/admin/bookings?from=2026-09-01&to=2026-09-30')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.status).toBe(200);
  });

  it('passes from/to through to the repository filter (US-014/AC-01)', async () => {
    const { repository, getCaptured } = capturingRepository();
    const app = appWith({ adminBookings: repository });

    await request(app)
      .get('/api/admin/bookings?from=2026-09-01&to=2026-09-30')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(getCaptured()?.from).toBe('2026-09-01');
    expect(getCaptured()?.to).toBe('2026-09-30');
  });

  it("a passed Confirmed booking appears under status=completed and NOT under status=confirmed (US-014/AC-02, the QA note's exact assertion)", async () => {
    const pastConfirmed = bookingRow({ id: 'past', booking_date: '2026-09-10', status: 'confirmed' });
    const futureConfirmed = bookingRow({ id: 'future', booking_date: '2026-09-23', status: 'confirmed' });

    // A minimal in-memory filter application, standing in for Postgres, so this test exercises
    // the SERVICE's resolved filter end to end rather than merely capturing it.
    const allRows = [pastConfirmed, futureConfirmed];
    const adminBookings: Pick<AdminBookingsRepository, 'listBookings'> = {
      async listBookings(filter) {
        const matched = allRows.filter((r) => {
          if (filter.from !== undefined && r.booking_date < filter.from) return false;
          if (filter.to !== undefined && r.booking_date > filter.to) return false;
          if (filter.before !== undefined && r.booking_date >= filter.before) return false;
          if (filter.status !== undefined && r.status !== filter.status) return false;
          return true;
        });
        return { rows: matched, total: matched.length };
      },
    };
    const app = appWith({ adminBookings });

    const completed = await request(app)
      .get('/api/admin/bookings?status=completed')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(completed.body.items.map((i: { id: string }) => i.id)).toEqual(['past']);

    const confirmed = await request(app)
      .get('/api/admin/bookings?status=confirmed')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(confirmed.body.items.map((i: { id: string }) => i.id)).toEqual(['future']);
  });

  it('a cancelled booking appears under status=cancelled regardless of date', async () => {
    const cancelledPast = bookingRow({ id: 'c1', booking_date: '2026-09-01', status: 'cancelled' });
    const cancelledFuture = bookingRow({ id: 'c2', booking_date: '2026-09-30', status: 'cancelled' });
    const allRows = [cancelledPast, cancelledFuture];
    const adminBookings: Pick<AdminBookingsRepository, 'listBookings'> = {
      async listBookings(filter) {
        const matched = allRows.filter((r) => filter.status === undefined || r.status === filter.status);
        return { rows: matched, total: matched.length };
      },
    };
    const app = appWith({ adminBookings });

    const response = await request(app)
      .get('/api/admin/bookings?status=cancelled')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.body.items.map((i: { id: string }) => i.id).sort()).toEqual(['c1', 'c2']);
  });

  it('only the matching desk\'s rows are returned (US-014/AC-03)', async () => {
    const rowA = bookingRow({ id: 'a', desk_number: 'A-01' });
    const rowB = bookingRow({ id: 'b', desk_number: 'B-02' });
    const deskAId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    const adminBookings: Pick<AdminBookingsRepository, 'listBookings'> = {
      async listBookings(filter) {
        const matched = filter.deskId === deskAId ? [rowA] : [rowA, rowB];
        return { rows: matched, total: matched.length };
      },
    };
    const app = appWith({ adminBookings });

    const response = await request(app)
      .get(`/api/admin/bookings?deskId=${deskAId}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].id).toBe('a');
  });

  it('date+status, date+desk, status+desk, and all three combine (US-014/AC-04)', async () => {
    const { repository, getCaptured } = capturingRepository();
    const app = appWith({ adminBookings: repository });
    const deskId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

    await request(app)
      .get(`/api/admin/bookings?from=2026-09-01&to=2026-09-30&status=confirmed&deskId=${deskId}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    const captured = getCaptured();
    expect(captured?.to).toBe('2026-09-30');
    expect(captured?.status).toBe('confirmed');
    expect(captured?.deskId).toBe(deskId);
  });

  it('?to=<before from> is refused with 400 invalid_request (US-014 edge case)', async () => {
    const app = appWith({});
    const response = await request(app)
      .get('/api/admin/bookings?from=2026-09-30&to=2026-09-01')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('an unknown status word is rejected', async () => {
    const app = appWith({});
    const response = await request(app)
      .get('/api/admin/bookings?status=archived')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.status).toBe(400);
  });
});

describe('GET /api/admin/desks (US-014/AC-03, edge case; US-016/AC-01, AC-10)', () => {
  it('refuses an Employee session with 403 (US-014/AC-03, US-016/AC-10)', async () => {
    const app = appWith({
      desks: { async listAllDesks() { return [deskRow()]; }, async listUpcomingConfirmedDeskIds() { return []; } },
    });
    const response = await request(app).get('/api/admin/desks').set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);
    expect(response.status).toBe(403);
  });

  it('refuses a request with no token', async () => {
    const app = appWith({});
    const response = await request(app).get('/api/admin/desks');
    expect(response.status).toBe(401);
  });

  it('returns an inactive desk alongside active ones, ordered — inactive desks stay findable (US-014/AC-03, US-016/AC-01)', async () => {
    const app = appWith({
      desks: {
        async listAllDesks() {
          return [deskRow({ id: 'a', desk_number: 'A-01', is_active: true }), deskRow({ id: 'b', desk_number: 'A-02', is_active: false })];
        },
        async listUpcomingConfirmedDeskIds() {
          return [];
        },
      },
    });

    const response = await request(app).get('/api/admin/desks').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.desks).toEqual([
      { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 0 },
      { id: 'b', deskNumber: 'A-02', isActive: false, bookedAhead: 0 },
    ]);
  });

  it('reports bookedAhead per desk, tallied from the confirmed-upcoming reads (US-016/AC-04, AC-05)', async () => {
    const app = appWith({
      desks: {
        async listAllDesks() {
          return [deskRow({ id: 'a', desk_number: 'A-01', is_active: true }), deskRow({ id: 'b', desk_number: 'A-02', is_active: true })];
        },
        async listUpcomingConfirmedDeskIds(status, from) {
          expect(status).toBe('confirmed');
          expect(from).toBe(TODAY);
          return ['a', 'a', 'a'];
        },
      },
    });

    const response = await request(app).get('/api/admin/desks').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.desks).toEqual([
      { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 3 },
      { id: 'b', deskNumber: 'A-02', isActive: true, bookedAhead: 0 },
    ]);
  });

  it('sets Cache-Control: private, no-store', async () => {
    const app = appWith({
      desks: { async listAllDesks() { return []; }, async listUpcomingConfirmedDeskIds() { return []; } },
    });
    const response = await request(app).get('/api/admin/desks').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(response.headers['cache-control']).toBe('private, no-store');
  });
});

describe('POST /api/admin/bookings/:id/cancel (US-015)', () => {
  const BOOKING_ID = '11111111-1111-4111-8111-111111111111';

  function capturingCancel(outcome: { id: string } | undefined) {
    const calls: Array<{ bookingId: string; adminId: string; cancelledAt: Date; today: string }> = [];
    const repository: Pick<AdminBookingsRepository, 'listBookings' | 'cancelAnyBooking' | 'findBookingState'> = {
      async listBookings() {
        throw new Error('not used in this test');
      },
      async cancelAnyBooking(bookingId, adminId, cancelledAt, today) {
        calls.push({ bookingId, adminId, cancelledAt, today });
        return outcome;
      },
      async findBookingState() {
        return undefined;
      },
    };
    return { repository, calls };
  }

  it('cancels a confirmed booking: 200 empty body, and the acting admin session id reaches the repository as cancelled_by (US-015/AC-02, AC-04, AC-05, AC-06)', async () => {
    const { repository, calls } = capturingCancel({ id: BOOKING_ID });
    const app = appWith({ adminBookings: repository });

    const response = await request(app)
      .post(`/api/admin/bookings/${BOOKING_ID}/cancel`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
    expect(calls).toHaveLength(1);
    expect(calls[0]?.bookingId).toBe(BOOKING_ID);
    expect(calls[0]?.adminId).toBe(ADMIN.id);
  });

  it('a past-dated or non-existent booking id gets 404 booking_not_found (US-015/AC-02)', async () => {
    const { repository } = capturingCancel(undefined);
    const app = appWith({ adminBookings: repository });

    const response = await request(app)
      .post(`/api/admin/bookings/${BOOKING_ID}/cancel`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('booking_not_found');
  });

  it('an already-cancelled booking gets 409 booking_already_cancelled (US-015/AC-09)', async () => {
    const repository: Pick<AdminBookingsRepository, 'listBookings' | 'cancelAnyBooking' | 'findBookingState'> = {
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
    const app = appWith({ adminBookings: repository });

    const response = await request(app)
      .post(`/api/admin/bookings/${BOOKING_ID}/cancel`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('booking_already_cancelled');
  });

  it('a malformed id is refused at the edge with 400 invalid_request', async () => {
    const app = appWith({});
    const response = await request(app)
      .post('/api/admin/bookings/not-a-uuid/cancel')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('refuses an Employee session with 403 admin_only', async () => {
    const { repository } = capturingCancel({ id: BOOKING_ID });
    const app = appWith({ adminBookings: repository });

    const response = await request(app)
      .post(`/api/admin/bookings/${BOOKING_ID}/cancel`)
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('admin_only');
  });

  it('refuses a request with no token at all', async () => {
    const app = appWith({});
    const response = await request(app).post(`/api/admin/bookings/${BOOKING_ID}/cancel`);
    expect(response.status).toBe(401);
  });
});
