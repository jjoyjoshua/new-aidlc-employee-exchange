import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Toggle } from './Toggle.js';

describe('Toggle (US-031 — SCR-004, NFR-008)', () => {
  it('is a switch, exposing its checked state to assistive technology', () => {
    render(<Toggle checked={true} label="On" onChange={() => {}} />);

    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveAttribute('aria-checked', 'true');
  });

  it('carries its state as a visible word, never colour alone (NFR-008, US-033/AC-05)', () => {
    render(<Toggle checked={false} label="Off" onChange={() => {}} />);

    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('calls onChange with the flipped value on click', async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} label="Off" onChange={onChange} />);

    await userEvent.click(screen.getByRole('switch'));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with the flipped value on Space, per SCR-004’s keyboard model', async () => {
    const onChange = vi.fn();
    render(<Toggle checked={true} label="On" onChange={onChange} />);

    screen.getByRole('switch').focus();
    await userEvent.keyboard(' ');

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('renders the switch as aria-disabled, never the native disabled attribute (SCR-004 ST-05 — stays focusable)', () => {
    render(<Toggle checked={false} label="Off" disabled onChange={() => {}} />);

    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveAttribute('aria-disabled', 'true');
    expect(switchEl).not.toBeDisabled();
  });

  it('does not call onChange when disabled', async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} label="Off" disabled onChange={onChange} />);

    await userEvent.click(screen.getByRole('switch'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not call onChange while busy (SCR-004 ST-03 — nothing in our interface can advance this state)', async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} label="Waiting…" busy onChange={onChange} />);

    await userEvent.click(screen.getByRole('switch'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports the last CONFIRMED checked value while busy, never an assumed one (US-031/AC-07)', () => {
    render(<Toggle checked={false} label="Waiting…" busy onChange={() => {}} />);

    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });
});
