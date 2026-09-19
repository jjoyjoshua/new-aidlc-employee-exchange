import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateField } from './DateField.js';

const TODAY = '2026-09-16';

describe('DateField (US-014/AC-01) — a custom HTML calendar, not the native <input type="date"> popup', () => {
  it('shows an em dash when no date is set, and opens a calendar grid on click', () => {
    render(<DateField label="Date from" value={undefined} onChange={() => {}} today={TODAY} />);

    expect(screen.getByLabelText('Date from')).toHaveTextContent('—');

    fireEvent.click(screen.getByLabelText('Date from'));
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('calls onChange with the clicked date, and closes', () => {
    const onChange = vi.fn();
    render(<DateField label="Date from" value={undefined} onChange={onChange} today={TODAY} />);

    fireEvent.click(screen.getByLabelText('Date from'));
    fireEvent.click(screen.getByRole('gridcell', { name: '16' }));

    expect(onChange).toHaveBeenCalledWith(TODAY);
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('reflects the current value as a formatted label', () => {
    render(<DateField label="Date from" value={TODAY} onChange={() => {}} today={TODAY} />);
    expect(screen.getByLabelText('Date from')).toHaveTextContent('Wed 16 Sep');
  });

  it('Clear calls onChange with undefined', () => {
    const onChange = vi.fn();
    render(<DateField label="Date from" value={TODAY} onChange={onChange} today={TODAY} />);

    fireEvent.click(screen.getByLabelText('Date from'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('the last week is filled with dimmed, non-interactive days from the next month rather than sitting blank', () => {
    render(<DateField label="Date from" value={undefined} onChange={() => {}} today={TODAY} />);

    fireEvent.click(screen.getByLabelText('Date from'));

    // September 2026 ends on a Wednesday; Oct 1-4 fill the rest of that last row.
    const rows = screen.getAllByRole('row');
    const lastRow = rows[rows.length - 1]!;
    expect(lastRow.textContent).toContain('1');
    expect(lastRow.querySelectorAll('[role="gridcell"]').length).toBeLessThan(7);
  });

  it('a day outside min/max is struck through and not selectable', () => {
    const onChange = vi.fn();
    render(<DateField label="Date to" value={undefined} onChange={onChange} today={TODAY} min="2026-09-20" />);

    fireEvent.click(screen.getByLabelText('Date to'));
    fireEvent.click(screen.getByRole('gridcell', { name: '16' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
