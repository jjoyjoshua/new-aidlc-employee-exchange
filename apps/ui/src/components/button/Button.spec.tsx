import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './Button.js';

describe('Button (US-001/AC-06)', () => {
  it('defaults to type=button so it never submits a form by accident (US-001/AC-06)', () => {
    render(<Button>Sign in</Button>);

    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveAttribute('type', 'button');
  });

  it('can be a submit control when a form asks for one (US-001/AC-06)', () => {
    render(<Button type="submit">Sign in</Button>);

    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveAttribute('type', 'submit');
  });

  it('takes the lg modifier for the bottom-anchored confirm (US-001/AC-05)', () => {
    // The Figma component's surface is control/md; control/lg is reached by overriding the
    // vertical padding, not by inventing a second height.
    render(<Button size="lg">Sign in</Button>);

    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveClass('button--lg');
  });

  it('keeps its label when it is disabled, so there is no layout shift (US-001/AC-06)', () => {
    // The disabled treatment changes colour, never geometry. That is what keeps ST-08's
    // "no layout shift" true when a button becomes busy.
    render(<Button disabled>Sign in</Button>);

    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Sign in');
  });
});

describe('Button busy state (US-001/AC-06)', () => {
  it('keeps its label and adds a spinner, so nothing below it moves (US-001/AC-06)', () => {
    // SCR-001 ST-03: the button is shown busy with its label RETAINED. A button that swaps its
    // label for a spinner moves everything below it.
    const { container } = render(<Button busy>Sign in</Button>);

    expect(screen.getByRole('button', { name: /Sign in/ })).toHaveTextContent('Sign in');
    expect(container.querySelector('.spinner')).toBeInTheDocument();
  });

  it('cannot be activated again while busy (US-001/AC-06)', () => {
    // "Only one sign-in request exists." Disabled rather than an onClick guard, so the browser
    // stops Enter and Space too.
    render(<Button busy>Sign in</Button>);

    expect(screen.getByRole('button', { name: /Sign in/ })).toBeDisabled();
  });

  it('announces that it is working (US-001/AC-06)', () => {
    render(<Button busy>Sign in</Button>);

    expect(screen.getByRole('button', { name: /Sign in/ })).toHaveAttribute('aria-busy', 'true');
  });

  it('carries no aria-busy when it is idle (US-001/AC-06)', () => {
    render(<Button>Sign in</Button>);

    expect(screen.getByRole('button', { name: 'Sign in' })).not.toHaveAttribute('aria-busy');
  });
});
