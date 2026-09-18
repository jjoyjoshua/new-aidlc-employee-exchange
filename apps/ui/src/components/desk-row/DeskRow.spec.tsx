import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeskRow } from './DeskRow.js';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('DeskRow (US-006/AC-02)', () => {
  it('renders the desk number and its status', () => {
    render(<DeskRow deskNumber="A-01" status="available" />);

    expect(screen.getByText('A-01')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('renders a taken desk without any selection affordance (US-006 design note §4.4 — presentational only)', () => {
    const { container } = render(<DeskRow deskNumber="A-02" status="taken" />);

    expect(screen.getByText('Taken')).toBeInTheDocument();
    expect(container.querySelector('[role="radio"]')).not.toBeInTheDocument();
    expect(container.querySelector('button')).not.toBeInTheDocument();
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
