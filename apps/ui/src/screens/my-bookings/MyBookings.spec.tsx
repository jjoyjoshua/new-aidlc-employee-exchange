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

describe('MyBookings — the booking confirmation toast (US-007/AC-03, AC-04)', () => {
  it('names the desk and the date (US-007/AC-03) and the confirmation email verbatim (US-007/AC-04)', () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/bookings',
            state: {
              bookingConfirmation: {
                deskNumber: 'A-02',
                dateLabel: 'Wed 9 Sep',
                confirmationEmail: 'priya@company.com',
              },
            },
          },
        ]}
      >
        <Routes>
          <Route path="/bookings" element={<MyBookings />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByText('A-02 booked for Wed 9 Sep. Confirmation emailed to priya@company.com.'),
    ).toBeInTheDocument();
  });

  it('renders no booking-confirmation toast on an ordinary visit', () => {
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
