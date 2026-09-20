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

describe('RadioGroup — ariaDisabled (US-023, ADR-010)', () => {
  function ControlledAriaDisabledRadioGroup({ initial = 'employee' }: { initial?: string }) {
    const [value, setValue] = useState(initial);
    return (
      <RadioGroup
        legend="Role"
        name="role"
        options={OPTIONS}
        value={value}
        onChange={setValue}
        ariaDisabled
        ariaDisabledReason="Not available yet — coming in a later release."
      />
    );
  }

  it('every radio stays FOCUSABLE — never the native disabled attribute (ADR-010)', () => {
    render(<ControlledAriaDisabledRadioGroup />);

    const employee = screen.getByRole('radio', { name: /Employee/ });
    const admin = screen.getByRole('radio', { name: /Admin/ });
    expect(employee).not.toBeDisabled();
    expect(admin).not.toBeDisabled();
    expect(employee).toHaveAttribute('aria-disabled', 'true');
    expect(admin).toHaveAttribute('aria-disabled', 'true');
  });

  it('is still one tab stop, reachable exactly as the enabled group is (ADR-010)', async () => {
    render(
      <>
        <button>Before</button>
        <ControlledAriaDisabledRadioGroup />
        <button>After</button>
      </>,
    );

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: /Employee/ })).toHaveFocus();
  });

  it('a click on the unselected option is swallowed — selection does not move (US-023, this form cannot save a role change)', async () => {
    render(<ControlledAriaDisabledRadioGroup />);

    await userEvent.click(screen.getByRole('radio', { name: /Admin/ }));

    expect(screen.getByRole('radio', { name: /Employee/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Admin/ })).not.toBeChecked();
  });

  it('carries the reason as both a title and a visually-hidden span (the AccountRowMenu pair)', () => {
    render(<ControlledAriaDisabledRadioGroup />);

    expect(screen.getAllByText('Not available yet — coming in a later release.')).toHaveLength(2);
  });

  it('the create-mode caller is unaffected — plain disabled still renders the native attribute', () => {
    const [value] = ['employee'];
    render(<RadioGroup legend="Role" name="role" options={OPTIONS} value={value} onChange={() => {}} disabled />);

    expect(screen.getByRole('radio', { name: /Employee/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Employee/ })).not.toHaveAttribute('aria-disabled');
  });
});
