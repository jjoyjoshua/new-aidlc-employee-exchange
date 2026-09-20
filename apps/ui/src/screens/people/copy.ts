/**
 * Screen-private copy for SCR-008 (US-020). Render this copy, never a server-derived string — the
 * UI owns user-visible copy, matching `screens/desks/copy.ts`'s own convention.
 */
import type { AdminSummary, UserRole } from '@desk-booking/contracts';

export const PAGE_TITLE = 'People';
export const ADD_PERSON_LABEL = 'Add person';
export const SEARCH_LABEL = 'Search name or email';
export const CLEAR_SEARCH_LABEL = 'Clear search';
/** The search field's own inline `x`, distinct from `CLEAR_SEARCH_LABEL` above — the two can be
 *  on screen together (ST-03's `EmptyState` action alongside the field's own trailing control),
 *  and two controls sharing one accessible name would be ambiguous to find and to hear. */
export const CLEAR_SEARCH_FIELD_LABEL = 'Clear search field';
export const TRY_AGAIN_LABEL = 'Try again';

/** ST-04 — US-020/AC-09. */
export const LOAD_FAILED = "We couldn't load the people list.";

/** AC-03. Appended to a row's accessible name — never a separate DOM node, so a screen reader
 *  announces "Dana Silva (you)" as one name (design note §7.3). */
export const YOU_MARKER = '(you)';

/** The Role column's word — Title Case, matching SCR-008's own frames ("Employee"/"Admin"),
 *  distinct from the lower-case wire value `role` carries (US-020/AC-01). */
export const ROLE_LABEL: Record<UserRole, string> = { employee: 'Employee', admin: 'Admin' };

export const EDIT_LABEL = 'Edit';
export const RESET_PASSWORD_LABEL = 'Reset password';
export const DEACTIVATE_LABEL = 'Deactivate';
export const ACTIVATE_LABEL = 'Activate';

/**
 * The "N people · M employees, K admins · J deactivated" line above the table (SCR-008's
 * `result-summary`). Takes ONLY `AdminSummary` — the wire's second, unfiltered read — never a
 * `users` array length, so an active search cannot change what this renders (US-020/AC-02, AC-06;
 * design note §2.2, §7.2). `deactivated` is a count word, not a noun that pluralises; `people`/
 * `person` and `employees`/`employee` are the two that do.
 */
export function summaryLine(summary: AdminSummary): string {
  const { total, employees, admins, deactivated } = summary;
  const peopleWord = total === 1 ? 'person' : 'people';
  const employeesWord = employees === 1 ? 'employee' : 'employees';
  return `${total} ${peopleWord} · ${employees} ${employeesWord}, ${admins} admins · ${deactivated} deactivated`;
}

/**
 * ST-16's match line, shown only while a committed search term is active. `total` is always
 * `summary.total` — never a wire-level `total` (the envelope carries none, design note §3.2/A5) —
 * and `matching` is `users.length`, the browser's own count of the filtered array it already holds
 * (US-020/AC-05).
 */
export function matchLine(matching: number, total: number): string {
  return `Showing ${matching} of ${total}`;
}

/** ST-03 — US-020/AC-07. Names the retained term, exactly as SCR-008's own example draws it. */
export function noMatchMessage(term: string): string {
  return `Nobody matches "${term}".`;
}

/**
 * ADR-010's reason string, reused verbatim from `US-016/D-02` (design note §6.2, plan Step 9,
 * open item 5): names no story id and promises no release date. Every one of the four row-menu
 * items carries this same string until its own destination story (US-023 – US-027) replaces it.
 */
export const disabledMenuItemReason = 'Not available yet — coming in a later release.';

/**
 * The row-menu's role item, labelled by the role it would PRODUCE, not the field it changes
 * (SCR-008's own structural decision) — US-020/AC-10.
 */
export function roleActionLabel(currentRole: UserRole): string {
  return currentRole === 'admin' ? 'Make an employee' : 'Make an admin';
}

/**
 * Each row's overflow trigger needs its own accessible name — "Actions for Dana Silva" — so forty
 * rows do not read as forty identical "Actions" stops in a screen reader's control list
 * (`SCR-008:224`, design note A9/§5.4). US-020/AC-10's menu is what this name opens.
 */
export function rowMenuTriggerLabel(fullName: string): string {
  return `Actions for ${fullName}`;
}

// ── SCR-009 — User form (US-021) ────────────────────────────────────────────

export const ADD_PERSON_TITLE = 'Add person';
export const FULL_NAME_LABEL = 'Full name';
export const EMAIL_LABEL = 'Email';
export const EMAIL_HELPER = "They'll sign in with this.";
export const ROLE_LEGEND = 'Role';
export const ROLE_OPTION_DESCRIPTION: Record<UserRole, string> = {
  employee: 'Employee — books a desk for themselves',
  admin: 'Admin — manages bookings, desks and people',
};
export const INITIAL_PASSWORD_LABEL = 'Initial password';
export const SUGGEST_PASSWORD_LABEL = 'Suggest a password';
export const CREATE_SUBMIT_LABEL = 'Add person';
export const CANCEL_LABEL = 'Cancel';

/** ST-01/AC-07 — stated before saving, not only after (BR-001.12, REQ-029). */
export const DELIVERY_WARNING =
  "Give this password to them yourself — it isn't emailed. They'll be asked to change it when they first sign in.";

/** ST-08/AC-11 — everything typed, including the password, is retained on this path. */
export const SAVE_FAILED = "We couldn't save that just now. Nothing has changed. Try again.";

/**
 * ST-04/AC-06, ADR-009's second application (design note §3.1). The server sends the FACTS
 * (`fullName`, `isActive`) in `details`; this composes the exact sentence SCR-009 approved,
 * bolding no longer possible in plain text but the two clauses are exactly as specified —
 * naming the holder, and, only when deactivated, pointing at reactivation instead of a second
 * account.
 */
export function emailTakenMessage(fullName: string, isActive: boolean): string {
  const holderSentence = `already belongs to ${fullName}.`;
  if (isActive) return holderSentence;
  return `${holderSentence} That account is deactivated — reactivate it on the people list instead of creating a new one.`;
}

/** The email field's own short message (SCR-009 ST-04's note: a blank message would leave an
 *  error icon alone on an empty line — `Text field` always renders its message row in error state). */
export const EMAIL_TAKEN_FIELD_MESSAGE = 'Already in use.';

/** ST-07/AC-09 — repeats the delivery instruction at the moment of success, naming the person. */
export function accountCreatedToast(fullName: string): string {
  return `${fullName} added. Give them the password you set — it hasn't been emailed, and they'll change it when they sign in.`;
}

// ── SCR-009 ST-02 — User form, edit mode (US-023) ──────────────────────────

/** ST-02 — US-023/AC-01. `(you)` when editing the signed-in administrator's own account, so a
 *  role change to self reads as visibly a change to self (SCR-009:126) — reuses `YOU_MARKER`
 *  above, the same suffix `AccountRow`'s own name composes, never a second string for one fact. */
export function editPersonTitle(fullName: string, isYou: boolean): string {
  return isYou ? `Edit person — ${fullName} ${YOU_MARKER}` : `Edit person — ${fullName}`;
}

export const SAVE_CHANGES_LABEL = 'Save changes';

/** ST-02's one line where create's password field would be (SCR-009:88, :108) — this story's own
 *  design commitment: no password field and no password rules anywhere on the edit form. */
export const RESET_PASSWORD_NOTE = "To change their password, use Reset password on the people list.";

/** ST-07's edit-mode toast, distinct from `accountCreatedToast` above (SCR-009:157) — no delivery
 *  burden to repeat, because nothing about a name/email correction is a credential. */
export function accountUpdatedToast(fullName: string): string {
  return `${fullName} updated.`;
}

// ── SCR-008 ST-08/ST-09, SCR-009 ST-05 — role change (US-024) ──────────────

/** ST-08's confirmation title, one per direction — the role item's own label names the role it
 *  would PRODUCE (`roleActionLabel`), and this title names the same thing as a question. */
export function roleChangeConfirmTitle(fullName: string, targetRole: UserRole): string {
  return targetRole === 'admin' ? `Make ${fullName} an admin?` : `Make ${fullName} an employee?`;
}

/** ST-08's two exact sentences (US-024/AC-02) — a promotion states what is gained, a demotion
 *  states what is lost AND that the person becomes able to book a desk for themselves (the story's
 *  own edge case: promoting somebody does not let them book, so the demotion sentence says so from
 *  the other direction). */
export function roleChangeConfirmBody(targetRole: UserRole): string {
  return targetRole === 'admin'
    ? "They'll be able to see and cancel everyone's bookings, and manage desks and people."
    : "They'll lose access to bookings, desks and people — and they'll be able to book a desk for themselves.";
}

export const CHANGE_ROLE_LABEL = 'Change role';
export const KEEP_AS_IS_LABEL = 'Keep as is';
export const CLOSE_LABEL = 'Close';
export const MAKE_SOMEONE_ADMIN_LABEL = 'Make someone an admin';

/**
 * ST-09's refusal, and SCR-009 ST-05's identical in-form one — ONE sentence-builder for both
 * doors (US-024/AC-08, D-03), not two copies of the same rule. The title names the account and
 * the fact; the body names the consequence and the fix. Always about a DEMOTION: BR-001.11 can
 * only be tripped by removing an active admin, so there is no promotion-direction refusal to word.
 */
export function lastActiveAdminRefusalTitle(fullName: string): string {
  return `${fullName} is the only active admin.`;
}

export const LAST_ACTIVE_ADMIN_REFUSAL_BODY =
  'Making this account an employee would leave nobody able to manage the system. Make someone else an admin first.';

/** ST-13's shape, applied to a role change (US-024/AC-10) — "nothing has changed" is the useful
 *  half, `SCR-008 ST-13`'s own reasoning. */
export function roleChangeFailedAlert(fullName: string): string {
  return `We couldn't change ${fullName}'s role just now. Nothing has changed. Try again.`;
}

/** ST-14's transient message (US-024/AC-11) — states the effect, not the mechanism. */
export function roleChangedToast(fullName: string, newRole: UserRole): string {
  return newRole === 'admin' ? `${fullName} is now an admin.` : `${fullName} is now an employee.`;
}
