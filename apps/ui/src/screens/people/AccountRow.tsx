/**
 * AccountRow — SCR-008's `Person row`, screen-private to `screens/people/` (design note §9).
 * `layout="table"` renders a `<tr>`; `layout="card"` renders ONE `<li>` reflowed by CSS alone
 * between the 1024px table/card boundary and the 768px sheet/popover boundary the row's own menu
 * carries — the same zero-`matchMedia`, dual-tree device `DeskInventoryRow`/`AdminBookingRow`
 * both use.
 *
 * The overflow trigger owns the row menu's open/close state: `AccountRowMenu` is anchored to
 * `.people-row__menu-anchor` (`position: relative`), which is why the menu instance lives here,
 * one per row, rather than hoisted to `People.tsx` — an anchored popover needs to sit beside the
 * trigger that opened it (design note §5.3).
 */
import { useRef, useState } from 'react';
import type { AdminUser } from '@desk-booking/contracts';
import { StatusChip } from '../../components/status-chip/StatusChip.js';
import { AccountRowMenu } from './AccountRowMenu.js';
import { ROLE_LABEL, rowMenuTriggerLabel, YOU_MARKER } from './copy.js';
import moreIconMarkup from '../../assets/icon-more.svg?raw';
import './people.css';

/** Real `<th>`s, so a screen reader announces the column per cell — the same reasoning
 *  `DeskInventoryTableHead`/`AdminBookingsTableHead` each state. Exported so `People.tsx` and
 *  this file's own spec share one definition of the column order. */
export function AccountsTableHead() {
  return (
    <thead>
      <tr>
        <th scope="col">Name</th>
        <th scope="col">Email</th>
        <th scope="col">Role</th>
        <th scope="col">Status</th>
        <th scope="col">
          <span className="people__visually-hidden">Actions</span>
        </th>
      </tr>
    </thead>
  );
}

export type AccountRowLayout = 'table' | 'card';

export interface AccountRowProps {
  account: AdminUser;
  layout: AccountRowLayout;
  /** US-020/AC-03. Compared against `account.id` to render the "(you)" marker — derived in the
   *  browser from `useAuth()`, never a wire field (design note §7.3). */
  currentUserId: string;
  /** US-023. Threaded down to the row's own `AccountRowMenu` — the row menu's **Edit** item. */
  onEdit: (account: AdminUser) => void;
  /** US-024. Threaded down to the row's own `AccountRowMenu` — the role item. */
  onChangeRole: (account: AdminUser) => void;
  /** US-025. Threaded down to the row's own `AccountRowMenu` — the deactivate branch. */
  onDeactivate: (account: AdminUser) => void;
  /** US-026. Threaded down to the row's own `AccountRowMenu` — the activate branch. */
  onActivate: (account: AdminUser) => void;
  /** US-027. Threaded down to the row's own `AccountRowMenu` — the reset-password item. */
  onResetPassword: (account: AdminUser) => void;
}

function OverflowIcon() {
  // Figma's own "Icon / more" (node 192:42) — the trigger's accessible name comes from
  // `aria-label`, not from this mark, so the icon itself stays `?raw` + `dangerouslySetInnerHTML`
  // decorative markup, the same pipeline `StatusChip.tsx`'s `BlockIcon` uses.
  return (
    <span
      className="people-row__trigger-icon"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: moreIconMarkup }}
    />
  );
}

function OverflowTrigger({
  account,
  onEdit,
  onChangeRole,
  onDeactivate,
  onActivate,
  onResetPassword,
}: {
  account: AdminUser;
  onEdit: (account: AdminUser) => void;
  onChangeRole: (account: AdminUser) => void;
  onDeactivate: (account: AdminUser) => void;
  onActivate: (account: AdminUser) => void;
  onResetPassword: (account: AdminUser) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <span className="people-row__menu-anchor">
      <button
        ref={triggerRef}
        type="button"
        className="people-row__trigger"
        aria-label={rowMenuTriggerLabel(account.fullName)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(true)}
      >
        <OverflowIcon />
      </button>
      {menuOpen ? (
        <AccountRowMenu
          account={account}
          triggerRef={triggerRef}
          onDismiss={() => setMenuOpen(false)}
          onEdit={onEdit}
          onChangeRole={onChangeRole}
          onDeactivate={onDeactivate}
          onActivate={onActivate}
          onResetPassword={onResetPassword}
        />
      ) : null}
    </span>
  );
}

/** The name cell's content — the "(you)" marker is an ACCESSIBLE-NAME SUFFIX, one string, not a
 *  second DOM node, so a screen reader announces "Dana Silva (you)" as a single name (US-020/AC-03,
 *  design note §7.3). */
function displayName(account: AdminUser, currentUserId: string): string {
  return account.id === currentUserId ? `${account.fullName} ${YOU_MARKER}` : account.fullName;
}

export function AccountRow({
  account,
  layout,
  currentUserId,
  onEdit,
  onChangeRole,
  onDeactivate,
  onActivate,
  onResetPassword,
}: AccountRowProps) {
  const status = account.isActive ? 'active' : 'inactive';
  const name = displayName(account, currentUserId);

  if (layout === 'table') {
    return (
      <tr className="people-table__row" data-account-row={account.id}>
        <td>{name}</td>
        <td>{account.email}</td>
        <td>{ROLE_LABEL[account.role]}</td>
        <td>
          <StatusChip kind="account" status={status} />
        </td>
        <td className="people-table__actions">
          <OverflowTrigger
            account={account}
            onEdit={onEdit}
            onChangeRole={onChangeRole}
            onDeactivate={onDeactivate}
            onActivate={onActivate}
            onResetPassword={onResetPassword}
          />
        </td>
      </tr>
    );
  }

  return (
    <li className="people-card" data-account-row={account.id}>
      <div className="people-card__meta">
        <p className="people-card__name">{name}</p>
        <p className="people-card__email">{account.email}</p>
        <div className="people-card__row">
          <span>{ROLE_LABEL[account.role]}</span>
          <StatusChip kind="account" status={status} />
        </div>
      </div>
      <div className="people-card__actions">
        <OverflowTrigger
          account={account}
          onEdit={onEdit}
          onChangeRole={onChangeRole}
          onDeactivate={onDeactivate}
          onActivate={onActivate}
          onResetPassword={onResetPassword}
        />
      </div>
    </li>
  );
}
