import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AllBookings } from './AllBookings.js';

/**
 * US-004/AC-07 — the admin path of SCR-010 ST-05. SCR-005 has no `HF /` frames yet (the design
 * note defers that to SCR-005's own build), but the toast component is the same object on both
 * destinations, so it is rendered here now.
 */
describe('AllBookings — the password-saved toast (US-004/AC-07)', () => {
  it('renders the confirmation when it arrives via navigation state', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/admin/bookings', state: { toast: 'password-saved' } }]}>
        <Routes>
          <Route path="/admin/bookings" element={<AllBookings />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/Password saved/i)).toBeInTheDocument();
  });

  it('renders no toast on an ordinary visit', () => {
    render(
      <MemoryRouter initialEntries={['/admin/bookings']}>
        <Routes>
          <Route path="/admin/bookings" element={<AllBookings />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
