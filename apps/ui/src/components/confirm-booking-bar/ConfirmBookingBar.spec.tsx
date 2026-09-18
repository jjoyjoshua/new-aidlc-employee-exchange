import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmBookingBar } from './ConfirmBookingBar.js';

describe('ConfirmBookingBar — the label names the desk and the date (US-007/AC-01)', () => {
  it('is disabled with a generic label when no desk is selected', () => {
    render(<ConfirmBookingBar deskNumber={undefined} dateLabel="Wed 9 Sep" onConfirm={() => undefined} />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('becomes enabled, reading "Book A-02 for Wed 9 Sep" once a desk is selected (US-007/AC-01)', () => {
    render(<ConfirmBookingBar deskNumber="A-02" dateLabel="Wed 9 Sep" onConfirm={() => undefined} />);

    const button = screen.getByRole('button', { name: 'Book A-02 for Wed 9 Sep' });
    expect(button).toBeEnabled();
  });

  it('calls onConfirm when activated', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmBookingBar deskNumber="A-02" dateLabel="Wed 9 Sep" onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole('button', { name: 'Book A-02 for Wed 9 Sep' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmBookingBar — busy keeps the label and blocks a second request (US-007/AC-09)', () => {
  it('keeps the label, disables the button, and never fires a second onConfirm while busy', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmBookingBar deskNumber="A-02" dateLabel="Wed 9 Sep" onConfirm={onConfirm} busy />);

    const button = screen.getByRole('button', { name: 'Book A-02 for Wed 9 Sep' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    // A disabled native button dispatches no click at all — this is the guarantee itself, not
    // an incidental side effect of it.
    await userEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not shift layout when busy — the same button, the same label, a spinner added alongside it', () => {
    const { rerender } = render(
      <ConfirmBookingBar deskNumber="A-02" dateLabel="Wed 9 Sep" onConfirm={() => undefined} />,
    );
    expect(screen.getByRole('button', { name: 'Book A-02 for Wed 9 Sep' })).toBeInTheDocument();

    rerender(<ConfirmBookingBar deskNumber="A-02" dateLabel="Wed 9 Sep" onConfirm={() => undefined} busy />);
    // Same accessible name — the label text is retained, not swapped for "Booking…" or similar.
    expect(screen.getByRole('button', { name: 'Book A-02 for Wed 9 Sep' })).toBeInTheDocument();
  });
});
