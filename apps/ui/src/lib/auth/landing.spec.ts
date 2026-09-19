import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '@desk-booking/contracts';
import { landingPathFor } from './landing.js';

const employee: AuthenticatedUser = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  email: 'priya@company.com',
  fullName: 'Priya Sharma',
  role: 'employee',
  mustChangePassword: false,
};

const admin: AuthenticatedUser = { ...employee, id: '9c858901-8a57-4791-81fe-4c455b099bc9', role: 'admin' };

describe('landingPathFor (US-004/AC-01, AC-03, AC-07)', () => {
  it('sends an employee with the mark set to /set-password, not /bookings (US-004/AC-01)', () => {
    expect(landingPathFor({ ...employee, mustChangePassword: true })).toBe('/set-password');
  });

  it('sends an admin with the mark set to /set-password, not /admin/bookings (US-004/AC-01)', () => {
    expect(landingPathFor({ ...admin, mustChangePassword: true })).toBe('/set-password');
  });

  it('sends an employee with the mark clear to /bookings (US-004/AC-07)', () => {
    expect(landingPathFor(employee)).toBe('/bookings');
  });

  it('sends an admin with the mark clear to /admin/bookings (US-004/AC-07)', () => {
    expect(landingPathFor(admin)).toBe('/admin/bookings');
  });

  it('lands a signing-in admin on All bookings, not a dashboard (US-013/AC-01)', () => {
    expect(landingPathFor(admin)).toBe('/admin/bookings');
  });
});
