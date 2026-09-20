import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AdminUser } from '@desk-booking/contracts';
import { AccountRow } from './AccountRow.js';

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

function renderTableRow(account: AdminUser, currentUserId = 'nobody') {
  return render(
    <table>
      <tbody>
        <AccountRow account={account} layout="table" currentUserId={currentUserId} />
      </tbody>
    </table>,
  );
}

function renderCardRow(account: AdminUser, currentUserId = 'nobody') {
  return render(
    <ul>
      <AccountRow account={account} layout="card" currentUserId={currentUserId} />
    </ul>,
  );
}

describe.each([
  ['table' as const, renderTableRow],
  ['card' as const, renderCardRow],
])('AccountRow — %s layout (US-020/AC-01)', (_layout, renderRow) => {
  it('renders the name, email, role and a status chip (US-020/AC-01)', () => {
    renderRow(EMPLOYEE);
    expect(screen.getByText('Dana Silva')).toBeInTheDocument();
    expect(screen.getByText('dana@company.com')).toBeInTheDocument();
    expect(screen.getByText('Employee')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders the Deactivated chip and Admin role for a deactivated admin (US-020/AC-01)', () => {
    renderRow(DEACTIVATED_ADMIN);
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Deactivated')).toBeInTheDocument();
  });

  it('marks the signed-in administrator\'s own row (you), and no other row (US-020/AC-03)', () => {
    const { container } = renderRow(EMPLOYEE, EMPLOYEE.id);
    expect(container.textContent).toContain('Dana Silva (you)');
  });

  it('does not mark a row that is not the signed-in administrator (US-020/AC-03)', () => {
    const { container } = renderRow(EMPLOYEE, 'someone-else');
    expect(container.textContent).not.toContain('(you)');
  });

  it('renders a per-row overflow trigger with its own accessible name (US-020/AC-10, design note A9)', () => {
    renderRow(EMPLOYEE);
    const trigger = screen.getByRole('button', { name: 'Actions for Dana Silva' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opening the trigger sets aria-expanded and reveals the menu (US-020/AC-10)', async () => {
    renderRow(EMPLOYEE);
    const trigger = screen.getByRole('button', { name: 'Actions for Dana Silva' });

    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
