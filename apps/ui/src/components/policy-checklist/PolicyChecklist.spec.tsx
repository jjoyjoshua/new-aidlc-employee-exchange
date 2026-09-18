import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PolicyChecklist, type PolicyRule } from './PolicyChecklist.js';

const RULES: PolicyRule[] = [
  { id: 'length', label: '8 characters or more', status: 'met' },
  { id: 'upper', label: 'An upper-case letter', status: 'pending' },
  { id: 'lower', label: 'A lower-case letter', status: 'blocking' },
];

describe('PolicyChecklist (US-004/AC-04, NFR-008)', () => {
  it('renders every rule as visible text', () => {
    render(<PolicyChecklist rules={RULES} />);

    expect(screen.getByText('8 characters or more')).toBeInTheDocument();
    expect(screen.getByText('An upper-case letter')).toBeInTheDocument();
    expect(screen.getByText('A lower-case letter')).toBeInTheDocument();
  });

  it('gives a met rule and an unmet rule distinct icon classes — never colour alone (NFR-008)', () => {
    const { container } = render(<PolicyChecklist rules={RULES} />);

    expect(container.querySelector('[data-rule="length"] .policy-checklist__icon--met')).toBeInTheDocument();
    expect(container.querySelector('[data-rule="upper"] .policy-checklist__icon--pending')).toBeInTheDocument();
    expect(container.querySelector('[data-rule="lower"] .policy-checklist__icon--blocking')).toBeInTheDocument();
  });

  it('gives pending and blocking distinct looks — a refused submit must not look identical to before it', () => {
    const { container } = render(<PolicyChecklist rules={RULES} />);

    const pendingIcon = container.querySelector('[data-rule="upper"] .policy-checklist__icon');
    const blockingIcon = container.querySelector('[data-rule="lower"] .policy-checklist__icon');

    expect(pendingIcon?.className).not.toBe(blockingIcon?.className);
  });

  it('is a live region, so a rule becoming met is announced without re-reading the whole list', () => {
    const { container } = render(<PolicyChecklist rules={RULES} />);

    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });

  it('carries a visually-hidden status word per rule, so the announcement says met or not (US-004/AC-04)', () => {
    render(<PolicyChecklist rules={RULES} />);

    const metRow = screen.getByText('8 characters or more').closest('[data-rule]');
    expect(metRow).toHaveTextContent(/met/i);
  });

  it('accepts a group label for the field it describes', () => {
    render(<PolicyChecklist rules={RULES} label="Your password must contain" />);

    expect(screen.getByRole('group', { name: 'Your password must contain' })).toBeInTheDocument();
  });
});
