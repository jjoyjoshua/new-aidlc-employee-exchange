import { describe, expect, it } from 'vitest';
import type { AdminSummary } from '@desk-booking/contracts';
import {
  accountCreatedToast,
  accountUpdatedToast,
  activateFailedAlert,
  reactivatedToast,
  deactivateAndCancelLabel,
  deactivateBookingListItem,
  deactivateConfirmBodyWithBookings,
  deactivateConfirmTitle,
  DEACTIVATE_CONFIRM_BODY_NO_BOOKINGS,
  DEACTIVATE_LAST_ACTIVE_ADMIN_REFUSAL_BODY,
  deactivatedToast,
  deactivateFailedAlert,
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
  resetPasswordConfirmTitle,
  RESET_PASSWORD_CONFIRM_BODY,
  resetPasswordFailedAlert,
  resetPasswordResultTitle,
  resetPasswordResultBody,
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

describe('deactivateConfirmTitle (US-025/AC-05, AC-07, ST-05, ST-06)', () => {
  it('asks the question, naming the account', () => {
    expect(deactivateConfirmTitle('Dana Silva')).toBe('Deactivate Dana Silva?');
  });
});

describe('DEACTIVATE_CONFIRM_BODY_NO_BOOKINGS (US-025/AC-07, ST-05)', () => {
  it('states no sign-in and that past bookings are kept — no cancellation clause, no count', () => {
    expect(DEACTIVATE_CONFIRM_BODY_NO_BOOKINGS).toBe("They won't be able to sign in. Their past bookings are kept.");
  });
});

describe('deactivateBookingListItem (US-025/AC-05, ST-06)', () => {
  it('joins the desk and the date with "on"', () => {
    expect(deactivateBookingListItem('A-01', 'Tue 8 Sep')).toBe('A-01 on Tue 8 Sep');
  });
});

describe('deactivateConfirmBodyWithBookings (US-025/AC-05, ST-06)', () => {
  it('lists every booking individually, states the desk return and the email, using the FIRST name only', () => {
    const body = deactivateConfirmBodyWithBookings('Dana Silva', [
      'A-01 on Tue 8 Sep',
      'B-02 on Thu 10 Sep',
      'A-01 on Mon 14 Sep',
    ]);
    expect(body).toBe(
      "They won't be able to sign in, and their 3 upcoming bookings will be cancelled — A-01 on Tue 8 Sep, B-02 on Thu 10 Sep, A-01 on Mon 14 Sep. Those desks go back into the pool and Dana is emailed about each one. Past bookings are kept.",
    );
  });

  it('singularises "upcoming booking" for exactly one', () => {
    const body = deactivateConfirmBodyWithBookings('Dana Silva', ['A-01 on Tue 8 Sep']);
    expect(body).toContain('their upcoming booking will be cancelled — A-01 on Tue 8 Sep.');
  });
});

describe('deactivateAndCancelLabel (US-025/AC-06, ST-06)', () => {
  it('carries the count in the label — a habitual click cannot hide what it does', () => {
    expect(deactivateAndCancelLabel(3)).toBe('Deactivate and cancel 3 bookings');
  });

  it('singularises for exactly one', () => {
    expect(deactivateAndCancelLabel(1)).toBe('Deactivate and cancel 1 booking');
  });
});

describe('lastActiveAdminRefusalTitle / DEACTIVATE_LAST_ACTIVE_ADMIN_REFUSAL_BODY (US-025/AC-10, ST-07)', () => {
  it('the title is reused verbatim from the role-change refusal — the frames render the identical sentence for both doors', () => {
    expect(lastActiveAdminRefusalTitle('Marcus Vale')).toBe('Marcus Vale is the only active admin.');
  });

  it('the body names desks, bookings, people and that nobody could undo it — the fuller BR-001.11 consequence', () => {
    expect(DEACTIVATE_LAST_ACTIVE_ADMIN_REFUSAL_BODY).toBe(
      'Deactivating this account would leave nobody able to manage desks, bookings or people — including nobody able to undo it. Make someone else an admin first.',
    );
  });
});

describe('deactivateFailedAlert (US-025/AC-11, ST-13)', () => {
  it('names the person and states nothing changed', () => {
    expect(deactivateFailedAlert('Dana Silva')).toBe("We couldn't deactivate Dana Silva just now. Nothing has changed. Try again.");
  });
});

describe('deactivatedToast (US-025/AC-13, ST-14)', () => {
  it('states the effect, with no count (AC-06\'s count was the preview\'s, not this toast\'s)', () => {
    expect(deactivatedToast('Dana Silva')).toBe('Dana Silva can no longer sign in.');
  });
});

describe('activateFailedAlert (US-026/AC-07)', () => {
  it('names the person and states nothing changed, matching deactivateFailedAlert\'s own shape', () => {
    expect(activateFailedAlert('Dana Silva')).toBe("We couldn't activate Dana Silva just now. Nothing has changed. Try again.");
  });
});

describe('reactivatedToast (US-026/AC-06)', () => {
  it('states the effect — they can sign in again', () => {
    expect(reactivatedToast('Dana Silva')).toBe('Dana Silva can sign in again.');
  });
});

describe('resetPasswordConfirmTitle (US-027/AC-02, ST-10)', () => {
  it('names the account in the question (US-027/AC-02)', () => {
    expect(resetPasswordConfirmTitle('Dana Silva')).toBe("Reset Dana Silva's password?");
  });
});

describe('RESET_PASSWORD_CONFIRM_BODY (US-027/AC-02, ST-10)', () => {
  it('states all four clauses IN ORDER: generated+shown-once, not emailed, stops working immediately, forced choice at next sign-in (US-027/AC-02)', () => {
    const body = RESET_PASSWORD_CONFIRM_BODY;
    const shownOnceIndex = body.indexOf('show it to you once');
    const notEmailedIndex = body.indexOf("isn't emailed");
    const stopsWorkingIndex = body.indexOf('stops working straight away');
    const forcedChoiceIndex = body.indexOf('choose their own the first time they sign in');

    expect(shownOnceIndex).toBeGreaterThanOrEqual(0);
    expect(notEmailedIndex).toBeGreaterThan(shownOnceIndex);
    expect(stopsWorkingIndex).toBeGreaterThan(notEmailedIndex);
    expect(forcedChoiceIndex).toBeGreaterThan(stopsWorkingIndex);
  });
});

describe('resetPasswordFailedAlert (US-027/AC-09, ST-13)', () => {
  it('names the person and states nothing changed, matching deactivateFailedAlert\'s own shape', () => {
    expect(resetPasswordFailedAlert('Dana Silva')).toBe("We couldn't reset Dana Silva's password just now. Nothing has changed. Try again.");
  });
});

describe('resetPasswordResultTitle (US-027/AC-03, ST-11)', () => {
  it('names the account, not a generic heading', () => {
    expect(resetPasswordResultTitle('Dana Silva')).toBe("Dana Silva's new password");
  });
});

describe('resetPasswordResultBody (US-027/AC-03, AC-04, AC-05, ST-11)', () => {
  it('states the shown-once warning and copy instruction FIRST, the forced-change consequence LAST', () => {
    const body = resetPasswordResultBody('Dana Silva');
    const shownOnceIndex = body.indexOf('only time');
    const copyNowIndex = body.indexOf('Copy it now');
    const neverAgainIndex = body.indexOf("can't show it again");
    const notEmailedIndex = body.indexOf("isn't in any email");
    const forcedChoiceIndex = body.indexOf('choose their own password');

    expect(shownOnceIndex).toBeGreaterThanOrEqual(0);
    expect(copyNowIndex).toBeGreaterThan(shownOnceIndex);
    expect(neverAgainIndex).toBeGreaterThan(copyNowIndex);
    expect(notEmailedIndex).toBeGreaterThan(copyNowIndex);
    expect(forcedChoiceIndex).toBeGreaterThan(neverAgainIndex);
    expect(forcedChoiceIndex).toBeGreaterThan(notEmailedIndex);
  });

  it('names the account being handed the credential', () => {
    expect(resetPasswordResultBody('Dana Silva')).toContain('Dana Silva directly');
  });
});
