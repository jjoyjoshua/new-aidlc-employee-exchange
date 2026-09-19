import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './Select.js';

const OPTIONS = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

describe('Select (US-014/AC-02, AC-03 — the status and desk filter controls)', () => {
  it('renders the label and the placeholder as the closed trigger\'s text when nothing is selected', () => {
    render(<Select label="Status" options={OPTIONS} value="" onChange={() => {}} placeholder="All statuses" />);

    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toHaveTextContent('All statuses');
  });

  it('is closed until clicked, then opens a listbox with every option including the placeholder', () => {
    render(<Select label="Status" options={OPTIONS} value="" onChange={() => {}} placeholder="All statuses" />);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Status'));

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All statuses' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Confirmed' })).toBeInTheDocument();
  });

  it('calls onChange with the clicked option\'s value, and closes', () => {
    const onChange = vi.fn();
    render(<Select label="Status" options={OPTIONS} value="" onChange={onChange} placeholder="All statuses" />);

    fireEvent.click(screen.getByLabelText('Status'));
    fireEvent.click(screen.getByRole('option', { name: 'Confirmed' }));

    expect(onChange).toHaveBeenCalledWith('confirmed');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('reflects the current value as the trigger\'s text', () => {
    render(<Select label="Status" options={OPTIONS} value="completed" onChange={() => {}} placeholder="All statuses" />);
    expect(screen.getByLabelText('Status')).toHaveTextContent('Completed');
  });

  it('marks the current value as the selected option when open', () => {
    render(<Select label="Status" options={OPTIONS} value="completed" onChange={() => {}} placeholder="All statuses" />);
    fireEvent.click(screen.getByLabelText('Status'));
    expect(screen.getByRole('option', { name: 'Completed' })).toHaveAttribute('aria-selected', 'true');
  });

  it('disables the control when told to (US-014 §7.6 — a desk-list failure)', () => {
    render(<Select label="Desk" options={[]} value="" onChange={() => {}} placeholder="All desks" disabled />);
    expect(screen.getByLabelText('Desk')).toBeDisabled();
  });

  it('closes when clicking outside', () => {
    render(
      <div>
        <Select label="Status" options={OPTIONS} value="" onChange={() => {}} placeholder="All statuses" />
        <button>Outside</button>
      </div>,
    );

    fireEvent.click(screen.getByLabelText('Status'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('Outside'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
