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

describe('EmptyState — body and actions are optional (US-009/FR-08)', () => {
  it('renders with no body paragraph at all when body is omitted', () => {
    const { container } = render(<EmptyState title="Every desk is taken on Wed 9 Sep." />);

    expect(screen.getByText('Every desk is taken on Wed 9 Sep.')).toBeInTheDocument();
    expect(container.querySelector('.empty-state__body')).not.toBeInTheDocument();
  });

  it('renders actions after the body when provided', () => {
    render(
      <EmptyState title="Every desk is taken on Wed 9 Sep." body="The next two working days with desks free:" actions={<button type="button">Thu 10 Sep</button>} />,
    );

    expect(screen.getByRole('button', { name: 'Thu 10 Sep' })).toBeInTheDocument();
  });
});
