import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoteRow } from './NoteRow.js';

describe('NoteRow (US-031 — SCR-004, the shared email/ST-05/ST-06 component)', () => {
  it('renders its text', () => {
    render(<NoteRow icon="mail">Booking emails are always sent.</NoteRow>);

    expect(screen.getByText('Booking emails are always sent.')).toBeInTheDocument();
  });

  it('carries an icon as well as the words for each variant, so colour is never the only signal (NFR-008)', () => {
    const { container: mail } = render(<NoteRow icon="mail">Email note</NoteRow>);
    const { container: block } = render(<NoteRow icon="block">Blocked note</NoteRow>);
    const { container: info } = render(<NoteRow icon="info-circle">Unsupported note</NoteRow>);

    expect(mail.querySelector('.note-row__icon svg')).toBeInTheDocument();
    expect(block.querySelector('.note-row__icon svg')).toBeInTheDocument();
    expect(info.querySelector('.note-row__icon svg')).toBeInTheDocument();
  });

  it('renders every icon variant on the same background class — never a tinted one (confirmed against the real Figma frames)', () => {
    const { container: mail } = render(<NoteRow icon="mail">a</NoteRow>);
    const { container: block } = render(<NoteRow icon="block">b</NoteRow>);

    expect(mail.querySelector('.note-row')?.className).toBe(block.querySelector('.note-row')?.className);
  });
});
