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
