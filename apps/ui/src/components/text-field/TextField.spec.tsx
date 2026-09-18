import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TextField } from './TextField.js';

/**
 * The Figma component description (node 129:30) fixes rules this implementation must not drift
 * from. They are asserted here rather than left as comments, because a rule nobody tests is a
 * rule the next refactor removes.
 */
describe('TextField (US-001/AC-05)', () => {
  it('associates its label with its input so clicking the label focuses it (US-001/AC-05)', async () => {
    render(<TextField label="Email" />);

    await userEvent.click(screen.getByText('Email'));

    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('is not marked invalid when there is no error (US-001/AC-05)', () => {
    render(<TextField label="Email" />);

    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
  });

  it('marks the input invalid and points at the message when there is an error (US-001/AC-05)', () => {
    render(<TextField label="Email" error="Enter a valid email address" />);

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    // aria-invalid alone announces "invalid" with no explanation. The description is what
    // carries the reason to a screen reader.
    expect(input).toHaveAccessibleDescription('Enter a valid email address');
  });

  it('carries an icon as well as the words, so colour is never the only signal (NFR-008)', () => {
    const { container } = render(<TextField label="Email" error="Enter a valid email address" />);

    // NFR-008: a user who sees no colour difference must lose nothing. The icon and the text
    // are the two non-colour signals; the border is the third and weakest.
    expect(container.querySelector('.field__message-icon')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('takes the invalid modifier so the ring can switch to the error colour (US-001/AC-05)', () => {
    // An invalid field's focus ring takes --c-danger-border rather than the brand green
    // (decided 2026-09-10): a red border inside a green ring is two outlines in two hues and
    // reads as a rendering fault.
    const { container } = render(<TextField label="Email" error="Required" />);

    expect(container.querySelector('.field')).toHaveClass('field--invalid');
  });

  it('takes the readonly modifier for the in-flight treatment (US-001/AC-06)', () => {
    const { container } = render(<TextField label="Email" readOnly value="" onChange={() => {}} />);

    expect(container.querySelector('.field')).toHaveClass('field--readonly');
  });

  it('takes the invalid modifier with no message when a caller carries its own explanation elsewhere (US-004/AC-04)', () => {
    // SCR-010 ST-02: the new-password field's edge and ring take the error colour, but the
    // policy checklist beside it is the field's message — a second sentence here would either
    // duplicate the checklist or invent a rule nobody wrote.
    const { container } = render(<TextField label="New password" invalid />);

    const field = container.querySelector('.field');
    expect(field).toHaveClass('field--invalid');
    expect(container.querySelector('.field__message')).not.toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true');
  });
});
