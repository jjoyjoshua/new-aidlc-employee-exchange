import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeskRow } from './DeskRow.js';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('DeskRow (US-006/AC-02)', () => {
  it('renders the desk number and its status', () => {
    render(<DeskRow deskNumber="A-01" status="available" />);

    expect(screen.getByText('A-01')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('renders a taken desk without any selection affordance, even when onSelect is supplied (US-006 design note §4.4; US-007/AC-02 — only an AVAILABLE desk can ever become selected)', () => {
    const onSelect = vi.fn();
    const { container } = render(<DeskRow deskNumber="A-02" status="taken" onSelect={onSelect} />);

    expect(screen.getByText('Taken')).toBeInTheDocument();
    expect(container.querySelector('[role="radio"]')).not.toBeInTheDocument();
    expect(container.querySelector('button')).not.toBeInTheDocument();
  });
});

describe('DeskRow — selection (US-007/AC-01)', () => {
  it('renders an AVAILABLE row as a radio, unchecked by default, with the Available chip', () => {
    render(<DeskRow deskNumber="A-01" status="available" />);

    const radio = screen.getByRole('radio', { name: /A-01/ });
    expect(radio).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('renders Selected — icon and word — and aria-checked: true when selected is true (US-007/AC-01, NFR-01)', () => {
    render(<DeskRow deskNumber="A-01" status="available" selected />);

    const radio = screen.getByRole('radio', { name: /A-01/ });
    expect(radio).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.queryByText('Available')).not.toBeInTheDocument();
  });

  it('calls onSelect when an available row is activated', async () => {
    const onSelect = vi.fn();
    render(<DeskRow deskNumber="A-01" status="available" onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('radio', { name: /A-01/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('DeskRow — usual desk hint (US-008/AC-01, AC-06)', () => {
  it('renders visible text "your usual" on an available row when usual is true (SCR-003 hi-fi frame, node 38:173)', () => {
    render(<DeskRow deskNumber="A-01" status="available" usual />);

    expect(screen.getByText('your usual')).toBeInTheDocument();
  });

  it('composes the accessible name as desk number, availability word, then the usual hint — full match, not substring (US-008/AC-06)', () => {
    render(<DeskRow deskNumber="A-01" status="available" usual />);

    expect(screen.getByRole('radio', { name: 'A-01, Available, your usual' })).toBeInTheDocument();
  });

  it('composes the accessible name with Selected once the usual row is selected (US-008/AC-06)', () => {
    render(<DeskRow deskNumber="A-01" status="available" selected usual />);

    expect(screen.getByRole('radio', { name: 'A-01, Selected, your usual' })).toBeInTheDocument();
  });

  it('omits the hint from the accessible name when usual is not set, but still names the availability word (US-006 gap fixed as a side effect of composing the name)', () => {
    render(<DeskRow deskNumber="A-01" status="available" />);

    expect(screen.getByRole('radio', { name: 'A-01, Available' })).toBeInTheDocument();
  });

  it('never renders the hint on a taken row, even if usual is true', () => {
    render(<DeskRow deskNumber="A-02" status="taken" usual />);

    expect(screen.queryByText('your usual')).not.toBeInTheDocument();
  });
});

describe('DeskRow and SkeletonRow share the same row height (US-006/AC-07)', () => {
  it('both read height from the --desk-row-height custom property, so nothing shifts when data arrives', () => {
    // jsdom does not resolve custom properties from an external stylesheet, so the source is
    // read directly — the shared token name is what actually prevents a layout shift.
    const deskRowCss = readFileSync(join(HERE, 'desk-row.css'), 'utf8');
    const skeletonRowCss = readFileSync(join(HERE, '../skeleton-row/skeleton-row.css'), 'utf8');

    expect(deskRowCss).toContain('var(--desk-row-height');
    expect(skeletonRowCss).toContain('var(--desk-row-height');
  });
});
