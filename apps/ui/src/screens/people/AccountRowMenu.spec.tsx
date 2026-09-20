import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@desk-booking/contracts';
import { AccountRowMenu } from './AccountRowMenu.js';
import { disabledMenuItemReason } from './copy.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const EMPLOYEE: AdminUser = {
  id: 'a',
  fullName: 'Dana Silva',
  email: 'dana@company.com',
  role: 'employee',
  isActive: true,
};
const DEACTIVATED_ADMIN: AdminUser = {
  id: 'b',
  fullName: 'Marcus Vale',
  email: 'marcus@company.com',
  role: 'admin',
  isActive: false,
};

function Harness({
  account,
  onDismiss = vi.fn(),
  onEdit = vi.fn(),
  onChangeRole = vi.fn(),
  onDeactivate = vi.fn(),
}: {
  account: AdminUser;
  onDismiss?: () => void;
  onEdit?: (account: AdminUser) => void;
  onChangeRole?: (account: AdminUser) => void;
  onDeactivate?: (account: AdminUser) => void;
}) {
  const triggerRef = createRef<HTMLButtonElement>();
  return (
    <div>
      <button type="button" ref={triggerRef}>
        {`Actions for ${account.fullName}`}
      </button>
      <AccountRowMenu
        account={account}
        triggerRef={triggerRef}
        onDismiss={onDismiss}
        onEdit={onEdit}
        onChangeRole={onChangeRole}
        onDeactivate={onDeactivate}
      />
    </div>
  );
}

describe('AccountRowMenu — fixed order and labels (US-020/AC-10)', () => {
  it('renders exactly four items, in fixed order: Edit, role, Reset password, Deactivate (US-020/AC-10)', () => {
    render(<Harness account={EMPLOYEE} />);
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(4);
    // Each item's visible label, excluding its visually-hidden reason span (asserted separately
    // below) — the accessible name still includes both, which is correct (`title` + a
    // visually-hidden span, `AdminBookingRow.tsx`'s own established pair).
    const visibleLabel = (item: HTMLElement) =>
      [...item.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)?.textContent?.trim();
    expect(items.map(visibleLabel)).toEqual(['Edit', 'Make an admin', 'Reset password', 'Deactivate']);
  });

  it('the role item reads "Make an employee" for a current admin (US-020/AC-10)', () => {
    render(<Harness account={DEACTIVATED_ADMIN} />);
    expect(screen.getByRole('menuitem', { name: /Make an employee/ })).toBeInTheDocument();
  });

  it('the last item reads Activate for a deactivated account, and the role item stays present (US-020/AC-10)', () => {
    render(<Harness account={DEACTIVATED_ADMIN} />);
    const items = screen.getAllByRole('menuitem');
    expect(items[3]?.textContent).toContain('Activate');
    expect(items[3]?.textContent).not.toContain('Deactivate');
    expect(screen.getByRole('menuitem', { name: /Make an employee/ })).toBeInTheDocument();
  });

  it('places a divider before the last (destructive) item (US-020/AC-10)', () => {
    render(<Harness account={EMPLOYEE} />);
    const menu = screen.getByRole('menu');
    const children = [...menu.children];
    const dividerIndex = children.findIndex((el) => el.tagName === 'HR');
    const lastItemIndex = children.findIndex((el) => el === screen.getAllByRole('menuitem')[3]);
    expect(dividerIndex).toBeGreaterThan(-1);
    expect(dividerIndex).toBeLessThan(lastItemIndex);
    // `AccountRowMenu` portals to `document.body` (people.css's table-clipping fix requires it —
    // see that file's module docblock), so the divider is queried from `menu.children` above
    // rather than the render's own `container`, which a portalled node is no longer inside.
    expect(children[dividerIndex]?.getAttribute('aria-hidden')).toBe('true');
  });

  // The destination story that eventually deletes each item's disabled state is named in
  // `spec.md`'s Out of scope section and `decisions.md` D-03, not here — a bare `US-###` in this
  // file's source (title or comment) obliges that story's own manifest entry to list this file
  // (`aidlc-check`'s stale-manifest rule), which would be premature for a story that doesn't
  // exist yet. `Edit`, the role item and the deactivate branch are no longer in this list —
  // US-023, US-024 and US-025 are the destinations that landed. Reset password, and the still
  // unbuilt activate branch (exercised on a deactivated account below), remain.
  it('Reset password is present, aria-disabled, FOCUSABLE (never the disabled attribute), and carries its reason (US-020/AC-10)', () => {
    render(<Harness account={EMPLOYEE} />);
    const item = screen.getByRole('menuitem', { name: /Reset password/ });

    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).not.toHaveAttribute('disabled');
    expect(item).not.toBeDisabled();
    expect(item.tabIndex).not.toBe(-1);
    expect(item).toHaveAttribute('title', disabledMenuItemReason);
    expect(within(item).getByText(disabledMenuItemReason)).toBeInTheDocument();
  });

  it('the Activate branch is present, aria-disabled, FOCUSABLE, and carries its reason, for a deactivated account (US-020/AC-10, still unbuilt)', () => {
    render(<Harness account={DEACTIVATED_ADMIN} />);
    const item = screen.getByRole('menuitem', { name: /Activate/ });

    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).not.toHaveAttribute('disabled');
    expect(item).not.toBeDisabled();
    expect(item.tabIndex).not.toBe(-1);
    expect(item).toHaveAttribute('title', disabledMenuItemReason);
    expect(within(item).getByText(disabledMenuItemReason)).toBeInTheDocument();
  });

  it('clicking a disabled item does nothing — the menu stays open and onDismiss is not called (US-020/AC-10)', async () => {
    const onDismiss = vi.fn();
    render(<Harness account={EMPLOYEE} onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole('menuitem', { name: /^Reset password/ }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('Edit is a real, live item — no aria-disabled, no title reason (US-023)', () => {
    render(<Harness account={EMPLOYEE} />);
    const edit = screen.getByRole('menuitem', { name: 'Edit' });

    expect(edit).not.toHaveAttribute('aria-disabled');
    expect(edit).not.toHaveAttribute('title');
    expect(edit).not.toBeDisabled();
  });

  it('clicking Edit calls onEdit with the account, dismisses the menu, and returns focus to the trigger (US-023)', async () => {
    const onDismiss = vi.fn();
    const onEdit = vi.fn();
    render(<Harness account={EMPLOYEE} onDismiss={onDismiss} onEdit={onEdit} />);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledWith(EMPLOYEE);
    expect(onDismiss).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Actions for Dana Silva' })).toHaveFocus();
  });

  it('the role item is a real, live item — no aria-disabled, no title reason (US-024)', () => {
    render(<Harness account={EMPLOYEE} />);
    const roleItem = screen.getByRole('menuitem', { name: 'Make an admin' });

    expect(roleItem).not.toHaveAttribute('aria-disabled');
    expect(roleItem).not.toHaveAttribute('title');
    expect(roleItem).not.toBeDisabled();
  });

  it('clicking the role item calls onChangeRole with the account, dismisses the menu, and returns focus to the trigger (US-024)', async () => {
    const onDismiss = vi.fn();
    const onChangeRole = vi.fn();
    render(<Harness account={EMPLOYEE} onDismiss={onDismiss} onChangeRole={onChangeRole} />);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Make an admin' }));

    expect(onChangeRole).toHaveBeenCalledWith(EMPLOYEE);
    expect(onDismiss).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Actions for Dana Silva' })).toHaveFocus();
  });

  it('the role item reads "Make an employee" and is live for a DEACTIVATED admin (US-024/AC-12)', async () => {
    const onChangeRole = vi.fn();
    render(<Harness account={DEACTIVATED_ADMIN} onChangeRole={onChangeRole} />);
    const roleItem = screen.getByRole('menuitem', { name: 'Make an employee' });
    expect(roleItem).not.toHaveAttribute('aria-disabled');

    await userEvent.click(roleItem);
    expect(onChangeRole).toHaveBeenCalledWith(DEACTIVATED_ADMIN);
  });

  it('Deactivate is a real, live item for an active account — no aria-disabled, no title reason (US-025)', () => {
    render(<Harness account={EMPLOYEE} />);
    const deactivate = screen.getByRole('menuitem', { name: 'Deactivate' });

    expect(deactivate).not.toHaveAttribute('aria-disabled');
    expect(deactivate).not.toHaveAttribute('title');
    expect(deactivate).not.toBeDisabled();
  });

  it('clicking Deactivate calls onDeactivate with the account, dismisses the menu, and returns focus to the trigger (US-025)', async () => {
    const onDismiss = vi.fn();
    const onDeactivate = vi.fn();
    render(<Harness account={EMPLOYEE} onDismiss={onDismiss} onDeactivate={onDeactivate} />);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Deactivate' }));

    expect(onDeactivate).toHaveBeenCalledWith(EMPLOYEE);
    expect(onDismiss).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Actions for Dana Silva' })).toHaveFocus();
  });

  it('Deactivate is NOT reachable for an already-deactivated account — that row renders the still-unbuilt Activate branch instead (US-025 boundary)', () => {
    render(<Harness account={DEACTIVATED_ADMIN} />);
    expect(screen.queryByRole('menuitem', { name: 'Deactivate' })).not.toBeInTheDocument();
  });
});

describe('AccountRowMenu — titled at every width (US-020/AC-11)', () => {
  it('renders a title element naming the account, labelling the menu (US-020/AC-11)', () => {
    render(<Harness account={EMPLOYEE} />);
    const menu = screen.getByRole('menu');
    const labelledBy = menu.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe('Dana Silva');
  });

  it('the popover is unscrimmed and anchored at >=768px, and a scrimmed full-width sheet below it (US-020/AC-11, design note §5.3, A11)', () => {
    const css = readFileSync(join(HERE, 'people.css'), 'utf8');
    // jsdom performs no layout, so the stylesheet is the honest proxy for the boundary — the same
    // device Dialog.spec.tsx and the desk inventory screen's own two-boundary tests use. `people.css` carries TWO
    // independent boundaries (1024px table/card, 768px menu scrim/anchor — design note A11), so
    // unlike `dialog.css` this file cannot be split on the first `@media` alone; the mobile-first
    // (default, unqueried) declaration is matched directly by selector instead.
    expect(css).toMatch(/\.people-menu__overlay\s*\{[^}]*position:\s*fixed[^}]*\}/);
    expect(css).toMatch(/\.people-menu__overlay\s*\{[^}]*background:\s*var\(--c-scrim\)[^}]*\}/);

    const menuBoundaryIndex = css.indexOf('@media (min-width: 768px)');
    expect(menuBoundaryIndex).toBeGreaterThan(-1);
    const desktopOverride = css.slice(menuBoundaryIndex);
    expect(desktopOverride).toMatch(/\.people-menu__overlay\s*\{[^}]*background:\s*transparent[^}]*\}/);
    expect(desktopOverride).toMatch(/\.people-menu__title\s*\{[^}]*position:\s*absolute[^}]*\}/);
  });

  it('carries a SEPARATE 1024px boundary for the table/card switch, not conflated with the 768px menu boundary (US-020/AC-11, design note A11)', () => {
    const css = readFileSync(join(HERE, 'people.css'), 'utf8');
    expect(css).toMatch(/@media \(min-width: 1024px\)/);
    expect(css).toMatch(/@media \(min-width: 768px\)/);
    // The two boundaries are genuinely different numbers, not the same query duplicated.
    expect(css.indexOf('@media (min-width: 1024px)')).not.toBe(css.indexOf('@media (min-width: 768px)'));
  });
});

describe('AccountRowMenu — focus, Escape and arrow keys (US-020/AC-12)', () => {
  it('focuses the first item when it opens', async () => {
    render(<Harness account={EMPLOYEE} />);
    await waitFor(() => expect(screen.getByRole('menuitem', { name: /^Edit/ })).toHaveFocus());
  });

  it('Escape dismisses and returns focus to the trigger (US-020/AC-12)', async () => {
    const onDismiss = vi.fn();
    render(<Harness account={EMPLOYEE} onDismiss={onDismiss} />);
    await waitFor(() => expect(screen.getByRole('menuitem', { name: /^Edit/ })).toHaveFocus());

    await userEvent.keyboard('{Escape}');

    expect(onDismiss).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Actions for Dana Silva' })).toHaveFocus();
  });

  it('a click outside the menu dismisses and returns focus to the trigger (US-020/AC-12)', async () => {
    const onDismiss = vi.fn();
    render(<Harness account={EMPLOYEE} onDismiss={onDismiss} />);
    await waitFor(() => expect(screen.getByRole('menuitem', { name: /^Edit/ })).toHaveFocus());

    await userEvent.click(document.body);

    expect(onDismiss).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Actions for Dana Silva' })).toHaveFocus();
  });

  it('ArrowDown moves focus to the next item, ArrowUp moves back (design note §5.4, A9)', async () => {
    render(<Harness account={EMPLOYEE} />);
    const items = await screen.findAllByRole('menuitem');
    await waitFor(() => expect(items[0]).toHaveFocus());

    await userEvent.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();

    await userEvent.keyboard('{ArrowDown}');
    expect(items[2]).toHaveFocus();

    await userEvent.keyboard('{ArrowUp}');
    expect(items[1]).toHaveFocus();
  });
});
