import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MyBookings } from './MyBookings.js';

/**
 * US-004/AC-07 — the confirmation SCR-010 ST-05 carries onto its destination screen. `MyBookings`
 * is still a stub — its full content belongs to a later story — and this is the one piece of
 * behaviour US-004 adds to it.
 */
describe('MyBookings — the password-saved toast (US-004/AC-07)', () => {
  it('renders the confirmation when it arrives via navigation state', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/bookings', state: { toast: 'password-saved' } }]}>
        <Routes>
          <Route path="/bookings" element={<MyBookings />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/Password saved/i)).toBeInTheDocument();
  });

  it('renders no toast on an ordinary visit', () => {
    render(
      <MemoryRouter initialEntries={['/bookings']}>
        <Routes>
          <Route path="/bookings" element={<MyBookings />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
