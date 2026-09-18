import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExistingBookingState } from './ExistingBookingState.js';

describe('ExistingBookingState — replaces the desk list, no confirm action present (US-007/AC-06)', () => {
  it('names the desk and date already held, with no desk-selection affordance in it', () => {
    render(
      <ExistingBookingState
        bookingId="booking-1"
        deskNumber="A-02"
        dateLabel="Wed 9 Sep"
        cancelBooking={async () => ({ kind: 'ok' })}
        onCancelled={() => undefined}
      />,
    );

    expect(screen.getByText(/A-02/)).toBeInTheDocument();
    expect(screen.getByText(/Wed 9 Sep/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});

describe('ExistingBookingState — cancelling (US-007/AC-07)', () => {
  it('opens the confirm dialog, then calls cancelBooking with the booking id and fires onCancelled on success', async () => {
    const cancelBooking = vi.fn().mockResolvedValue({ kind: 'ok' });
    const onCancelled = vi.fn();
    render(
      <ExistingBookingState
        bookingId="booking-1"
        deskNumber="A-02"
        dateLabel="Wed 9 Sep"
        cancelBooking={cancelBooking}
        onCancelled={onCancelled}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /cancel this booking/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));

    expect(cancelBooking).toHaveBeenCalledWith('booking-1');
    await vi.waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
  });

  it('also fires onCancelled — no failure shown — when cancelBooking reports a 404-as-ok (already gone, design note §3.4/F-6)', async () => {
    // `cancelBooking` here already collapsed the 404 to `ok` (proven separately in
    // `cancel-booking.spec.ts`) — this test proves the COMPONENT treats that `ok` as success.
    const cancelBooking = vi.fn().mockResolvedValue({ kind: 'ok' });
    const onCancelled = vi.fn();
    render(
      <ExistingBookingState
        bookingId="booking-1"
        deskNumber="A-02"
        dateLabel="Wed 9 Sep"
        cancelBooking={cancelBooking}
        onCancelled={onCancelled}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /cancel this booking/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));

    await vi.waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Escape dismisses the dialog without cancelling', async () => {
    const cancelBooking = vi.fn();
    render(
      <ExistingBookingState
        bookingId="booking-1"
        deskNumber="A-02"
        dateLabel="Wed 9 Sep"
        cancelBooking={cancelBooking}
        onCancelled={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /cancel this booking/i }));
    await userEvent.keyboard('{Escape}');

    expect(cancelBooking).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
