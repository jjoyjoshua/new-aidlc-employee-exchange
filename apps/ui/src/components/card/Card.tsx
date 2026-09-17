/**
 * Card — Figma `Sign in card` (node 133:124).
 *
 * A container: surface, border, radius, elevation and internal rhythm. It deliberately does not
 * set its own width; see `card.css`.
 *
 * `as` exists because on SCR-001 the card **is** the form — the fields, the submit button and
 * the help text are its children, and wrapping a `<form>` in a `<div class="card">` would put a
 * second box in the tree for no reason. The three permitted elements are the ones a container
 * can honestly be; anything else wants its own component.
 */
import type { ElementType, FormHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import './card.css';

type CardElementProps = HTMLAttributes<HTMLElement> & FormHTMLAttributes<HTMLFormElement>;

export interface CardProps extends Omit<CardElementProps, 'className'> {
  as?: 'div' | 'section' | 'form';
  children: ReactNode;
}

export function Card({ as = 'div', children, ...rest }: CardProps) {
  // `as` is constrained to three intrinsic elements above, so this widening is safe: the union
  // of their prop types is what `CardElementProps` already describes. Typing it precisely would
  // need a generic component for no gain a caller can observe.
  const Element = as as ElementType;

  return (
    <Element className="card" {...rest}>
      {children}
    </Element>
  );
}
