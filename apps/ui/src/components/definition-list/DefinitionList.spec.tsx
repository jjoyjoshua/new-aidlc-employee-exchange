import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DefinitionList } from './DefinitionList.js';

describe('DefinitionList (US-031 — SCR-004 "Your details")', () => {
  it('renders a label and value for each item', () => {
    render(
      <DefinitionList
        items={[
          { label: 'Name', value: 'Priya Raman' },
          { label: 'Email', value: 'priya@company.com' },
          { label: 'Role', value: 'Employee' },
        ]}
      />,
    );

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Priya Raman')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('priya@company.com')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Employee')).toBeInTheDocument();
  });

  it('renders as a semantic definition list', () => {
    const { container } = render(<DefinitionList items={[{ label: 'Name', value: 'Priya Raman' }]} />);

    expect(container.querySelector('dl')).toBeInTheDocument();
    expect(container.querySelector('dt')).toBeInTheDocument();
    expect(container.querySelector('dd')).toBeInTheDocument();
  });
});
