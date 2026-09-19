import { describe, expect, it } from 'vitest';
import {
  activateFailedAlert,
  blockedDialogBody,
  blockedDialogTitle,
  bookedAheadLabel,
  bookedAheadAccessibleText,
  deactivateDialogBody,
  deactivateDialogTitle,
  deactivateFailedAlert,
  deskActivatedToast,
  deskAddedToast,
  deskDeactivatedToast,
  deskNumberFormatError,
  deskRenamedToast,
  duplicateDeskTitle,
  editDeskDialogTitle,
  seeBookingsLabel,
  summaryLine,
  upcomingHoldersWarning,
} from './copy.js';

describe('bookedAheadLabel (US-016/AC-05 — zero is a dash, not blank)', () => {
  it('renders zero as an em dash', () => {
    expect(bookedAheadLabel(0)).toBe('—');
  });

  it('renders one as the singular', () => {
    expect(bookedAheadLabel(1)).toBe('1 upcoming');
  });

  it('renders a count above one as the plural', () => {
    expect(bookedAheadLabel(3)).toBe('3 upcoming');
  });
});

describe('bookedAheadAccessibleText (US-016/AC-05 — the em dash is not silent to a screen reader)', () => {
  it('reads "No upcoming bookings" for zero — the dash alone would say nothing', () => {
    expect(bookedAheadAccessibleText(0)).toBe('No upcoming bookings');
  });

  it('matches the visible label for a non-zero count', () => {
    expect(bookedAheadAccessibleText(1)).toBe('1 upcoming');
    expect(bookedAheadAccessibleText(3)).toBe('3 upcoming');
  });
});

describe('summaryLine (US-016 — the "N desks · M active, K inactive" line, derived client-side)', () => {
  it('derives all three numbers from the array, never an echoed total', () => {
    const desks = [
      { id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 0 },
      { id: 'b', deskNumber: 'A-02', isActive: true, bookedAhead: 2 },
      { id: 'c', deskNumber: 'A-03', isActive: false, bookedAhead: 0 },
    ];

    expect(summaryLine(desks)).toBe('3 desks · 2 active, 1 inactive');
  });

  it('pluralizes correctly for a single desk', () => {
    const desks = [{ id: 'a', deskNumber: 'A-01', isActive: true, bookedAhead: 0 }];
    expect(summaryLine(desks)).toBe('1 desk · 1 active, 0 inactive');
  });
});

describe('deskAddedToast (US-017/AC-01, SCR-007 ST-06)', () => {
  it('names the effect on bookability, not just the outcome', () => {
    expect(deskAddedToast('A-12')).toBe('Desk A-12 added. People can book it from today.');
  });
});

describe('duplicateDeskTitle (US-017/AC-04, PRIN-3 — leads with the colliding number)', () => {
  it('names the colliding desk number', () => {
    expect(duplicateDeskTitle('A-01')).toBe('A-01 is already taken by another desk.');
  });
});

describe('deskNumberFormatError (US-017/AC-02 — two messages, empty vs bad shape)', () => {
  it('asks for a number when the entry is empty or whitespace only', () => {
    expect(deskNumberFormatError('')).toBe('Give the desk a number.');
    expect(deskNumberFormatError('   ')).toBe('Give the desk a number.');
  });

  it('restates the rule when the shape is wrong', () => {
    expect(deskNumberFormatError('A-1')).toBe('Use one letter, a dash and two digits — like A-01.');
    expect(deskNumberFormatError('Window seat 3')).toBe('Use one letter, a dash and two digits — like A-01.');
  });
});

describe('editDeskDialogTitle (US-018/AC-01, SCR-007 ST-02 — frame-verified: "Edit desk A-01")', () => {
  it('names the desk being edited', () => {
    expect(editDeskDialogTitle('A-01')).toBe('Edit desk A-01');
  });
});

describe('upcomingHoldersWarning (US-018/AC-04, RISK-012 — frame-verified for 3; singular derived)', () => {
  it('states the exact count and the consequence, matching the verified frame verbatim for 3', () => {
    expect(upcomingHoldersWarning(3)).toBe(
      "3 people have this desk booked. Renaming it changes what they see — they won't be told.",
    );
  });

  it('uses the singular for exactly one holder', () => {
    expect(upcomingHoldersWarning(1)).toBe(
      "1 person has this desk booked. Renaming it changes what they see — they won't be told.",
    );
  });
});

describe('deskRenamedToast (US-018/AC-01, SCR-007 ST-06 — spec-sourced, no edit-mode frame drawn)', () => {
  it('names the new number', () => {
    expect(deskRenamedToast('A-12')).toBe('Desk number updated to A-12.');
  });
});

describe('deactivateDialogTitle (US-019/AC-03 — ST-05, frame-verified node 213:1092)', () => {
  it('names the desk being deactivated', () => {
    expect(deactivateDialogTitle('A-02')).toBe('Deactivate A-02?');
  });
});

describe('deactivateDialogBody (US-019/AC-03 — states the consequence AND that history survives)', () => {
  it('says the desk disappears from booking straight away, and that past bookings are kept', () => {
    const body = deactivateDialogBody();
    expect(body).toContain('disappears from');
    expect(body).toBe('It disappears from everyone’s booking options straight away. Past bookings on it are kept.');
  });
});

describe('blockedDialogTitle (US-019/AC-04 — ST-06, frame-verified node 214:1685 for B-03)', () => {
  it('names the desk in the title, not just the body', () => {
    expect(blockedDialogTitle('B-03')).toBe('B-03 can’t be deactivated yet.');
  });
});

describe('blockedDialogBody (US-019/AC-04 — the count, pluralised, frame-verified for 3)', () => {
  it('states the exact count verbatim for 3', () => {
    expect(blockedDialogBody(3)).toBe(
      '3 people have it booked from today onwards. Cancel those bookings first — the desk stays bookable until you do.',
    );
  });

  it('uses the singular for exactly one holder', () => {
    expect(blockedDialogBody(1)).toBe(
      '1 person has it booked from today onwards. Cancel those bookings first — the desk stays bookable until you do.',
    );
  });
});

describe('seeBookingsLabel (US-019/AC-04, AC-06 — the primary button label, interpolated independently of the body)', () => {
  it('pluralises for a count above one, frame-verified for 3', () => {
    expect(seeBookingsLabel(3)).toBe('See those 3 bookings');
  });

  it('uses the singular for exactly one', () => {
    expect(seeBookingsLabel(1)).toBe('See that 1 booking');
  });
});

describe('deactivateFailedAlert (US-019/AC-11 — ST-08, frame-verified node 214:2724)', () => {
  it('names the desk and offers a retry', () => {
    expect(deactivateFailedAlert('A-02')).toBe("We couldn’t deactivate A-02 just now. Try again.");
  });
});

describe('deskDeactivatedToast (US-019/AC-10 — ST-09, frame-verified node 215:2908)', () => {
  it('states the outcome on bookability', () => {
    expect(deskDeactivatedToast('A-02')).toBe('A-02 is inactive. It’s no longer bookable.');
  });
});

describe('deskActivatedToast (US-019/AC-10 — ST-10, frame-verified node 215:3413)', () => {
  it('states the outcome on bookability', () => {
    expect(deskActivatedToast('C-05')).toBe('C-05 is active. People can book it from today.');
  });
});

describe('activateFailedAlert (US-019 — the activation-failure banner, mirroring ST-08\'s wording; decisions.md D-07)', () => {
  it('names the desk and offers a retry', () => {
    expect(activateFailedAlert('C-05')).toBe("We couldn’t activate C-05 just now. Try again.");
  });
});
