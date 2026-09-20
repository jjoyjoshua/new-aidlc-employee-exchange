import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RadioGroup } from './RadioGroup.js';

const OPTIONS = [
  { value: 'employee', label: 'Employee — books a desk for themselves' },
  { value: 'admin', label: 'Admin — manages bookings, desks and people' },
];

function ControlledRadioGroup({ initial = 'employee' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <RadioGroup legend="Role" name="role" options={OPTIONS} value={value} onChange={setValue} />;
}

describe('RadioGroup (US-021/AC-02)', () => {
  it('renders one radio per option, each labelled by its full description line', () => {
    render(<ControlledRadioGroup />);

    expect(screen.getByRole('radio', { name: 'Employee — books a desk for themselves' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Admin — manages bookings, desks and people' })).toBeInTheDocument();
  });

  it('exactly one option is checked, never both and never none (US-021/AC-02)', () => {
    render(<ControlledRadioGroup />);

    expect(screen.getByRole('radio', { name: /Employee/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Admin/ })).not.toBeChecked();
  });

  it('is one tab stop, native radio-group behaviour — Tab enters and leaves the group in one hop each way', async () => {
    render(
      <>
        <button>Before</button>
        <ControlledRadioGroup />
        <button>After</button>
      </>,
    );

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByRole('radio', { name: /Employee/ })).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it('arrow keys move selection between options — the platform\'s own native radio-group behaviour', async () => {
    render(<ControlledRadioGroup />);

    screen.getByRole('radio', { name: /Employee/ }).focus();
    await userEvent.keyboard('{ArrowDown}');

    expect(screen.getByRole('radio', { name: /Admin/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Admin/ })).toHaveFocus();
  });

  it('clicking an option calls onChange with its value', async () => {
    render(<ControlledRadioGroup />);

    await userEvent.click(screen.getByRole('radio', { name: /Admin/ }));

    expect(screen.getByRole('radio', { name: /Admin/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Employee/ })).not.toBeChecked();
  });
});
