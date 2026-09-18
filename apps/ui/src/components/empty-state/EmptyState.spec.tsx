import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState.js';
import { NO_DESKS_EXIST } from '../../screens/book-a-desk/copy.js';

describe('EmptyState (US-006/AC-09)', () => {
  it('renders the approved title and body verbatim', () => {
    render(<EmptyState title={NO_DESKS_EXIST.title} body={NO_DESKS_EXIST.body} />);

    expect(screen.getByText(NO_DESKS_EXIST.title)).toBeInTheDocument();
    expect(screen.getByText(NO_DESKS_EXIST.body)).toBeInTheDocument();
  });

  it('offers no alternative dates and no admin link — no button, no link, anywhere', () => {
    const { container } = render(<EmptyState title={NO_DESKS_EXIST.title} body={NO_DESKS_EXIST.body} />);

    expect(container.querySelector('button')).not.toBeInTheDocument();
    expect(container.querySelector('a')).not.toBeInTheDocument();
  });
});
