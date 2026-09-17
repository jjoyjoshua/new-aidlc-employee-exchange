import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert } from './Alert.js';
import { Button } from '../button/Button.js';

describe('Alert (US-001/AC-04, US-001/AC-07)', () => {
  it('announces itself when it appears (US-001/AC-04)', () => {
    // SCR-001 requires the error region to be announced once when it appears. A div that
    // merely becomes visible is silent to a screen reader.
    render(<Alert>That email and password don&apos;t match an active account.</Alert>);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('can be made silent for an alert that was always on the page (US-001/AC-07)', () => {
    render(<Alert live="off">Something that was always here</Alert>);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('carries an icon as well as the words, so colour is never the only signal (NFR-008)', () => {
    const { container } = render(<Alert>We can&apos;t reach the booking service right now.</Alert>);

    expect(container.querySelector('.alert__icon')).toBeInTheDocument();
  });

  it('defaults to the danger tone (US-001/AC-04)', () => {
    const { container } = render(<Alert>Refused</Alert>);

    expect(container.querySelector('.alert')).toHaveClass('alert--danger');
  });

  it('renders no title unless one is given (PRIN-3)', () => {
    // Show title defaults OFF, so every existing single-message alert is unchanged.
    const { container } = render(<Alert>Just a message</Alert>);

    expect(container.querySelector('.alert__title')).not.toBeInTheDocument();
  });

  it('leads with the fact when a title is given (PRIN-3)', () => {
    render(<Alert title="Desk A-01 is taken">Somebody booked it first.</Alert>);

    expect(screen.getByText('Desk A-01 is taken')).toBeInTheDocument();
  });

  it('holds a recovery action inside itself (US-001/AC-07)', () => {
    // ST-05's Try again sits INSIDE the alert, not beside the form. After a failure the eye is
    // on the alert, and on a phone the submit button may be below the fold.
    render(
      <Alert actions={<Button variant="secondary">Try again</Button>}>
        We can&apos;t reach the booking service right now.
      </Alert>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toContainElement(screen.getByRole('button', { name: 'Try again' }));
  });

  it('renders no actions container when there are none (US-001/AC-04)', () => {
    const { container } = render(<Alert>Refused</Alert>);

    expect(container.querySelector('.alert__actions')).not.toBeInTheDocument();
  });
});
