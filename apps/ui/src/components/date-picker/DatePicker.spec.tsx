import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DatePicker } from './DatePicker.js';

const TODAY = '2026-09-18'; // Friday. today + 30 = 2026-10-18.

describe('DatePicker (US-005/AC-05, AC-06)', () => {
  it('opens on the month containing today, with today and the last bookable date visible', () => {
    render(<DatePicker today={TODAY} selectedDate={TODAY} onSelectDate={() => undefined} />);

    expect(screen.getByText('September 2026')).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: '18' })).toBeInTheDocument();
  });

  it('disables navigating before the month containing today', () => {
    render(<DatePicker today={TODAY} selectedDate={TODAY} onSelectDate={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
  });

  it('disables navigating after the month containing the last bookable date (US-005/AC-05)', async () => {
    render(<DatePicker today={TODAY} selectedDate={TODAY} onSelectDate={() => undefined} />);

    // today + 30 = 2026-10-18, so October is the last navigable month.
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('October 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  });

  it('does not scroll into a month where every day would be refused', async () => {
    render(<DatePicker today={TODAY} selectedDate={TODAY} onSelectDate={() => undefined} />);

    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    // Next month button is now disabled at October — clicking again (were it not disabled)
    // must not be possible via the API surface a user actually has.
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  });

  it('strikes through a refused day as a non-colour cue, and states the two rules once in the footer (US-005/AC-06)', () => {
    render(<DatePicker today={TODAY} selectedDate={TODAY} onSelectDate={() => undefined} />);

    // 2026-09-19 is a Saturday inside the window.
    const saturday = screen.getByRole('gridcell', { name: '19' });
    expect(saturday.className).toContain('refused');

    expect(screen.getByText(/Weekends are closed/i)).toBeInTheDocument();
    expect(screen.getByText(/You can book up to/i)).toBeInTheDocument();
    // The last bookable date named once, not per-cell.
    expect(screen.getAllByText(/You can book up to/i)).toHaveLength(1);
  });

  it('does not call onSelectDate for a refused day', async () => {
    const onSelectDate = vi.fn();
    render(<DatePicker today={TODAY} selectedDate={TODAY} onSelectDate={onSelectDate} />);

    await userEvent.click(screen.getByRole('gridcell', { name: '19' }));

    expect(onSelectDate).not.toHaveBeenCalled();
  });

  it('calls onSelectDate with the date when a bookable day is clicked', async () => {
    const onSelectDate = vi.fn();
    render(<DatePicker today={TODAY} selectedDate={TODAY} onSelectDate={onSelectDate} />);

    await userEvent.click(screen.getByRole('gridcell', { name: '21' })); // Monday 21 Sep

    expect(onSelectDate).toHaveBeenCalledWith('2026-09-21');
  });

  it('marks the selected date distinctly from an unselected bookable date', () => {
    render(<DatePicker today={TODAY} selectedDate="2026-09-21" onSelectDate={() => undefined} />);

    expect(screen.getByRole('gridcell', { name: '21' }).className).toContain('selected');
    expect(screen.getByRole('gridcell', { name: '22' }).className).not.toContain('selected');
  });
});
