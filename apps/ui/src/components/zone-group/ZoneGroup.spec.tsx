import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ZoneGroup } from './ZoneGroup.js';
import type { DeskAvailability } from '@desk-booking/contracts';

const desk = (deskNumber: string, status: 'available' | 'taken' = 'available'): DeskAvailability => ({
  id: deskNumber,
  deskNumber,
  status,
});

describe('ZoneGroup (US-006/AC-05)', () => {
  it('renders the heading "Zone A"', () => {
    render(<ZoneGroup letter="A" desks={[desk('A-01')]} />);

    expect(screen.getByText('Zone A')).toBeInTheDocument();
  });

  it('renders every desk in the zone, in the order given', () => {
    render(<ZoneGroup letter="A" desks={[desk('A-01'), desk('A-02', 'taken')]} />);

    const numbers = screen.getAllByText(/^A-\d{2}$/).map((el) => el.textContent);
    expect(numbers).toEqual(['A-01', 'A-02']);
  });
});
