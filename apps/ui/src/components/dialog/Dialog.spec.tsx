import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog.js';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('Dialog — the shared shell (US-017 design note §5.2)', () => {
  it('renders the title, children and footer it is given', () => {
    render(
      <Dialog title="Add desk" footer={<button type="button">Add desk</button>} onDismiss={() => undefined}>
        <p>the body</p>
      </Dialog>,
    );

    expect(screen.getByRole('heading', { name: 'Add desk' })).toBeInTheDocument();
    expect(screen.getByText('the body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add desk' })).toBeInTheDocument();
  });

  it('defaults to role="dialog" — the safer default for a new caller', () => {
    render(
      <Dialog title="Add desk" footer={null} onDismiss={() => undefined}>
        body
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders role="alertdialog" when asked, for a confirmation', () => {
    render(
      <Dialog title="Cancel?" role="alertdialog" footer={null} onDismiss={() => undefined}>
        body
      </Dialog>,
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('the accessible name is the title, via aria-labelledby', () => {
    render(
      <Dialog title="Add desk" footer={null} onDismiss={() => undefined}>
        body
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Add desk' })).toBeInTheDocument();
  });

  it('calls onDismiss on Escape', async () => {
    const onDismiss = vi.fn();
    render(
      <Dialog title="Add desk" footer={null} onDismiss={onDismiss}>
        body
      </Dialog>,
    );

    await userEvent.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('suppresses Escape while busy', async () => {
    const onDismiss = vi.fn();
    render(
      <Dialog title="Add desk" footer={null} onDismiss={onDismiss} busy>
        body
      </Dialog>,
    );

    await userEvent.keyboard('{Escape}');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('renders a close icon that calls onDismiss, and is disabled while busy', async () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <Dialog title="Add desk" footer={null} onDismiss={onDismiss}>
        body
      </Dialog>,
    );

    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    rerender(
      <Dialog title="Add desk" footer={null} onDismiss={onDismiss} busy>
        body
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeDisabled();
  });

  it('focuses the dialog itself on open when no initialFocusRef is given', () => {
    render(
      <Dialog title="Add desk" footer={null} onDismiss={() => undefined}>
        body
      </Dialog>,
    );
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('focuses initialFocusRef on open when given', () => {
    function Harness() {
      const inputRef = createRef<HTMLInputElement>();
      return (
        <Dialog title="Add desk" footer={null} onDismiss={() => undefined} initialFocusRef={inputRef}>
          <input ref={inputRef} aria-label="Desk number" />
        </Dialog>
      );
    }
    render(<Harness />);
    expect(document.activeElement).toBe(screen.getByLabelText('Desk number'));
  });

  it('traps Tab focus within the dialog (US-033/AC-07)', async () => {
    render(
      <Dialog
        title="Add desk"
        footer={
          <>
            <button type="button">Cancel</button>
            <button type="button">Add desk</button>
          </>
        }
        onDismiss={() => undefined}
      >
        body
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog');
    const focusables = Array.from(dialog.querySelectorAll('button')) as HTMLElement[];
    expect(focusables.length).toBeGreaterThan(0);

    focusables[focusables.length - 1]?.focus();
    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);

    focusables[0]?.focus();
    await userEvent.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('is a mobile-first bottom sheet by default, with the centred 480px card only from 768px up (US-017/AC-09)', () => {
    const css = readFileSync(join(HERE, 'dialog.css'), 'utf8');
    // jsdom performs no layout, so the stylesheet itself is the honest proxy for the breakpoint
    // (the same device the desk inventory screen used for its own two width boundaries): the
    // sheet must be the DEFAULT rule, and the centred card an override inside a min-width query,
    // never the reverse.
    const defaultRules = css.split('@media')[0] ?? '';
    expect(defaultRules).toMatch(/align-items:\s*flex-end/);
    expect(defaultRules).toMatch(/width:\s*100%/);

    const desktopOverride = css.match(/@media \(min-width: 768px\) \{[\s\S]*\}/)?.[0] ?? '';
    expect(desktopOverride).toMatch(/max-width:\s*480px/);
    expect(desktopOverride).toMatch(/align-items:\s*center/);
  });

  it('renders a caller-supplied icon in the header, before the title, aria-hidden (US-019/AC-04)', () => {
    render(
      <Dialog title="Blocked" icon={<svg data-testid="warning-icon" />} footer={null} onDismiss={() => undefined}>
        body
      </Dialog>,
    );

    const icon = screen.getByTestId('warning-icon');
    expect(icon).toBeInTheDocument();
    expect(icon.closest('[aria-hidden="true"]')).toBeTruthy();
    const header = screen.getByRole('heading', { name: 'Blocked' }).closest('.dialog__header');
    expect(header?.contains(icon)).toBe(true);
  });

  it('omitting icon renders exactly as today — no icon wrapper in the header (US-019/AC-04)', () => {
    render(
      <Dialog title="Add desk" footer={null} onDismiss={() => undefined}>
        body
      </Dialog>,
    );

    const header = screen.getByRole('heading', { name: 'Add desk' }).closest('.dialog__header');
    expect(header?.querySelector('.dialog__icon')).toBeNull();
  });

  it('dismissible defaults to true — every existing caller keeps its current close-icon and Escape behaviour (US-027 regression proof)', async () => {
    const onDismiss = vi.fn();
    render(
      <Dialog title="Add desk" footer={null} onDismiss={onDismiss}>
        body
      </Dialog>,
    );

    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismissible={false} omits the close icon entirely — not merely disabling it (US-027/AC-04)', () => {
    render(
      <Dialog title="New password" footer={null} onDismiss={() => undefined} dismissible={false}>
        body
      </Dialog>,
    );

    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it('dismissible={false} suppresses Escape even when NOT busy — the exact combination ST-11 ships (US-027/AC-04, design note §7.3)', async () => {
    const onDismiss = vi.fn();
    render(
      <Dialog title="New password" footer={null} onDismiss={onDismiss} dismissible={false} busy={false}>
        body
      </Dialog>,
    );

    await userEvent.keyboard('{Escape}');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('a backdrop/outside click never dismisses — INHERITED behaviour, not new: .dialog__overlay has no click handler at all (US-027/AC-04, design note §7.1)', async () => {
    const onDismiss = vi.fn();
    render(
      <Dialog title="Add desk" footer={null} onDismiss={onDismiss}>
        body
      </Dialog>,
    );

    const overlay = document.querySelector('.dialog__overlay') as HTMLElement;
    await userEvent.click(overlay);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('restores focus to the element that had it before the dialog opened, on unmount (US-033/AC-07)', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Add desk';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      <Dialog title="Add desk" footer={null} onDismiss={() => undefined}>
        body
      </Dialog>,
    );
    expect(document.activeElement).not.toBe(trigger);

    unmount();

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
