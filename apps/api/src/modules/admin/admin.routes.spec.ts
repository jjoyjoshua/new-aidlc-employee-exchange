/**
 * `GET /api/admin/bookings` against the real `createApp`, through supertest — matching
 * `bookings.routes.spec.ts`'s and `auth.routes.spec.ts`'s own reasoning: AC-10 in particular is
 * only proven by a request reaching the real `/api/admin` mount with a real Employee session, not
 * by a stub repository that a route test injects around a guard it never exercises.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../composition.js';
import { setConfigForTesting, type Config } from '../../config/index.js';
import type { SessionVerifier } from '../../http/middleware/require-session.js';
import type { AdminBookingRow, AdminBookingsRepository } from '../bookings/admin-bookings.repository.js';

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

const noBookings: AdminBookingsRepository = {
  async listBookingsFromDate() {
    return { rows: [], total: 0 };
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

function appWith(options: { rows?: Row[]; adminBookings?: AdminBookingsRepository }) {
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
    adminBookings: options.adminBookings ?? noBookings,
  });
}

describe('GET /api/admin/bookings — admin-only (US-013/AC-10)', () => {
  it('refuses an Employee session with 403 and no booking data (US-013/AC-10)', async () => {
    const app = appWith({
      adminBookings: { async listBookingsFromDate() { return { rows: [bookingRow()], total: 1 }; } },
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
      adminBookings: { async listBookingsFromDate() { return { rows: [bookingRow()], total: 1 }; } },
    });

    const response = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(200);
  });
});

describe('GET /api/admin/bookings — the default view (US-013/AC-02, AC-03, AC-06)', () => {
  it('returns bookings from today onward at every status, with all four fields, statuses derived (US-013/AC-02, US-013/AC-03, US-013/AC-06)', async () => {
    const app = appWith({
      adminBookings: {
        async listBookingsFromDate() {
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
      adminBookings: { async listBookingsFromDate() { return { rows: [], total: 0 }; } },
    });

    const response = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.headers['cache-control']).toBe('private, no-store');
  });
});

describe('GET /api/admin/bookings — paging boundary (US-013/AC-04)', () => {
  it('exactly 50 matching rows shows no next page', async () => {
    const app = appWith({
      adminBookings: {
        async listBookingsFromDate(_from, _offset, limit) {
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
    const adminBookings: AdminBookingsRepository = {
      async listBookingsFromDate(_from, offset, limit) {
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
      adminBookings: { async listBookingsFromDate() { return { rows: [], total: 0 }; } },
    });

    const response = await request(app)
      .get('/api/admin/bookings?page=abc')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('an unknown query field is rejected', async () => {
    const app = appWith({
      adminBookings: { async listBookingsFromDate() { return { rows: [], total: 0 }; } },
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
      adminBookings: { async listBookingsFromDate() { return { rows: [], total: 0 }; } },
    });

    const response = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(response.body).toMatchObject({ total: 0, items: [], nextPage: null });
  });
});

describe('GET /api/admin/bookings — a repository failure is never swallowed into an empty page', () => {
  it('propagates as a 500, distinguishable from a real empty system', async () => {
    const app = appWith({
      adminBookings: {
        async listBookingsFromDate() {
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
