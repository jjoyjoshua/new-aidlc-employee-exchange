import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

describe('ZoneGroup — threads selection through to DeskRow (US-007/AC-01, AC-02)', () => {
  it('marks the desk matching selectedDeskId as Selected and no other', () => {
    render(<ZoneGroup letter="A" desks={[desk('A-01'), desk('A-02')]} selectedDeskId="A-02" />);

    expect(screen.getByRole('radio', { name: /A-02/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /A-01/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onSelectDesk with the desk id when an available row is activated', async () => {
    const onSelectDesk = vi.fn();
    render(<ZoneGroup letter="A" desks={[desk('A-01')]} onSelectDesk={onSelectDesk} />);

    await userEvent.click(screen.getByRole('radio', { name: /A-01/ }));

    expect(onSelectDesk).toHaveBeenCalledWith('A-01');
  });
});

describe('ZoneGroup — threads usualDeskId through to DeskRow (US-008/AC-01, FR-07)', () => {
  it('marks only the desk matching usualDeskId with the usual hint', () => {
    render(<ZoneGroup letter="A" desks={[desk('A-01'), desk('A-02')]} usualDeskId="A-02" />);

    expect(screen.getByRole('radio', { name: 'A-02, Available, your usual' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'A-01, Available' })).toBeInTheDocument();
  });

  it('marks no row as usual when usualDeskId is undefined', () => {
    render(<ZoneGroup letter="A" desks={[desk('A-01')]} />);

    expect(screen.queryByText('your usual')).not.toBeInTheDocument();
  });
});

describe('ZoneGroup — threads tabStopDeskId through to DeskRow (#71)', () => {
  it('gives tabIndex 0 to the desk matching tabStopDeskId and -1 to every other', () => {
    render(<ZoneGroup letter="A" desks={[desk('A-01'), desk('A-02')]} tabStopDeskId="A-02" />);

    expect(screen.getByRole('radio', { name: /A-01/ })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('radio', { name: /A-02/ })).toHaveAttribute('tabindex', '0');
  });
});
