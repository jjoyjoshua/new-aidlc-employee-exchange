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
