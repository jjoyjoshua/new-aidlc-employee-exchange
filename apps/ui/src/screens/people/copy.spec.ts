import { describe, expect, it } from 'vitest';
import type { AdminSummary } from '@desk-booking/contracts';
import {
  accountCreatedToast,
  accountUpdatedToast,
  disabledMenuItemReason,
  editPersonTitle,
  emailTakenMessage,
  LAST_ACTIVE_ADMIN_REFUSAL_BODY,
  lastActiveAdminRefusalTitle,
  matchLine,
  noMatchMessage,
  roleChangeConfirmBody,
  roleChangeConfirmTitle,
  roleChangedToast,
  roleChangeFailedAlert,
  roleActionLabel,
  rowMenuTriggerLabel,
  summaryLine,
} from './copy.js';

const SUMMARY: AdminSummary = { total: 38, employees: 36, admins: 2, deactivated: 1 };

describe('summaryLine (US-020/AC-02)', () => {
  it('states the whole-list composition, admins named explicitly (US-020/AC-02)', () => {
    expect(summaryLine(SUMMARY)).toBe('38 people · 36 employees, 2 admins · 1 deactivated');
  });

  it('is derived from summary alone, never from a users array length (US-020/AC-06)', () => {
    // The function's own signature takes only `AdminSummary` — there is no `users` parameter to
    // pass by mistake. A fixed summary produces the same line regardless of what else is true.
    expect(summaryLine({ total: 1, employees: 1, admins: 0, deactivated: 0 })).toBe(
      '1 person · 1 employee, 0 admins · 0 deactivated',
    );
  });
});

describe('matchLine (US-020/AC-05)', () => {
  it('reads "Showing {matching} of {total}", the total coming from summary.total (US-020/AC-05)', () => {
    expect(matchLine(3, SUMMARY.total)).toBe('Showing 3 of 38');
  });
});

describe('noMatchMessage (US-020/AC-07)', () => {
  it('names the retained term (US-020/AC-07)', () => {
    expect(noMatchMessage('danna')).toBe('Nobody matches "danna".');
  });
});

describe('disabledMenuItemReason (US-020/AC-10, ADR-010)', () => {
  it('names no story id and promises no release date (US-020/AC-10)', () => {
    expect(disabledMenuItemReason).toBe('Not available yet — coming in a later release.');
    expect(disabledMenuItemReason).not.toMatch(/US-0\d\d/);
  });
});

describe('roleActionLabel (US-020/AC-10)', () => {
  it('reads "Make an admin" for a current employee (US-020/AC-10)', () => {
    expect(roleActionLabel('employee')).toBe('Make an admin');
  });

  it('reads "Make an employee" for a current admin (US-020/AC-10)', () => {
    expect(roleActionLabel('admin')).toBe('Make an employee');
  });
});

describe('rowMenuTriggerLabel (US-020/AC-10, design note A9/§5.4)', () => {
  it('names the row so forty triggers do not all read "Actions" (US-020/AC-10)', () => {
    expect(rowMenuTriggerLabel('Dana Silva')).toBe('Actions for Dana Silva');
  });
});

describe('emailTakenMessage (US-021/AC-06, ADR-009 §2 second application)', () => {
  it('names the holder for an active account, with no reactivation sentence', () => {
    expect(emailTakenMessage('Dana Silva', true)).toBe('already belongs to Dana Silva.');
  });

  it('adds the reactivation sentence for a deactivated holder (US-021/AC-06)', () => {
    expect(emailTakenMessage('Dana Silva', false)).toBe(
      'already belongs to Dana Silva. That account is deactivated — reactivate it on the people list instead of creating a new one.',
    );
  });
});

describe('accountCreatedToast (US-021/AC-09)', () => {
  it('names the person and repeats the delivery instruction (US-021/AC-09)', () => {
    expect(accountCreatedToast('Dana Silva')).toBe(
      "Dana Silva added. Give them the password you set — it hasn't been emailed, and they'll change it when they sign in.",
    );
  });
});

describe('editPersonTitle (US-023/AC-01, SCR-009:126, :191)', () => {
  it('reads "Edit person — {fullName}" for another account', () => {
    expect(editPersonTitle('Dana Silva', false)).toBe('Edit person — Dana Silva');
  });

  it('appends the (you) marker when editing the signed-in administrator\'s own account', () => {
    expect(editPersonTitle('Marcus Vale', true)).toBe('Edit person — Marcus Vale (you)');
  });
});

describe('accountUpdatedToast (US-023/AC-01, SCR-009:157)', () => {
  it('names the person with no delivery burden — a correction is not a credential', () => {
    expect(accountUpdatedToast('Dana Silva')).toBe('Dana Silva updated.');
  });
});

describe('roleChangeConfirmTitle (US-024/AC-02, ST-08)', () => {
  it('asks the promotion question', () => {
    expect(roleChangeConfirmTitle('Priya Raman', 'admin')).toBe('Make Priya Raman an admin?');
  });

  it('asks the demotion question', () => {
    expect(roleChangeConfirmTitle('Priya Raman', 'employee')).toBe('Make Priya Raman an employee?');
  });
});

describe('roleChangeConfirmBody (US-024/AC-02, ST-08)', () => {
  it('states what a promotion gains', () => {
    expect(roleChangeConfirmBody('admin')).toBe("They'll be able to see and cancel everyone's bookings, and manage desks and people.");
  });

  it('states what a demotion loses, and that they can book a desk for themselves (edge case)', () => {
    expect(roleChangeConfirmBody('employee')).toBe(
      "They'll lose access to bookings, desks and people — and they'll be able to book a desk for themselves.",
    );
  });
});

describe('lastActiveAdminRefusalTitle / LAST_ACTIVE_ADMIN_REFUSAL_BODY (US-024/AC-04, AC-05, ST-09, SCR-009 ST-05, AC-08)', () => {
  it('names the account as the only active admin', () => {
    expect(lastActiveAdminRefusalTitle('Marcus Vale')).toBe('Marcus Vale is the only active admin.');
  });

  it('names the consequence and the fix — one sentence-builder shared by both doors (D-03)', () => {
    expect(LAST_ACTIVE_ADMIN_REFUSAL_BODY).toBe(
      'Making this account an employee would leave nobody able to manage the system. Make someone else an admin first.',
    );
  });
});

describe('roleChangeFailedAlert (US-024/AC-10, ST-13)', () => {
  it('names the person and states nothing changed', () => {
    expect(roleChangeFailedAlert('Dana Silva')).toBe("We couldn't change Dana Silva's role just now. Nothing has changed. Try again.");
  });
});

describe('roleChangedToast (US-024/AC-11, ST-14)', () => {
  it('states a promotion', () => {
    expect(roleChangedToast('Priya Raman', 'admin')).toBe('Priya Raman is now an admin.');
  });

  it('states a demotion', () => {
    expect(roleChangedToast('Priya Raman', 'employee')).toBe('Priya Raman is now an employee.');
  });
});
