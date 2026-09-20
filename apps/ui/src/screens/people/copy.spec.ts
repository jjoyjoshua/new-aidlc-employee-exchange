import { describe, expect, it } from 'vitest';
import type { AdminSummary } from '@desk-booking/contracts';
import {
  accountCreatedToast,
  disabledMenuItemReason,
  emailTakenMessage,
  matchLine,
  noMatchMessage,
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
