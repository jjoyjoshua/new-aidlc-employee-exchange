/**
 * PolicyChecklist — SCR-010's five V-12 rules, built here first and inherited by SCR-009.
 *
 * **Three looks, not two** (SCR-010, 2026-09-07): `met` — satisfied; `pending` — not satisfied,
 * and nothing is wrong yet (hollow marker, `--c-text-muted`); `blocking` — not satisfied, after
 * a submit was refused (error icon, `--c-danger-ink`). `pending` and `blocking` cannot share a
 * look, or a refused submit is pixel-identical to the state before it and the button reads as
 * dead. `pending` and error styling cannot share one either, or an untouched form appears to
 * have five faults in it. Icon **and** text carry the distinction, so it survives without colour
 * vision (NFR-008).
 *
 * It receives resolved statuses; it never receives the password — the one evaluation of V-12
 * lives in `@desk-booking/contracts` (design note §3.2), and this component only renders what
 * that evaluation decided.
 *
 * The live region announces each rule as it changes ("A number: met"), so a screen-reader user
 * knows when they are done without re-reading five lines.
 */
import './policy-checklist.css';

export type PolicyRuleStatus = 'met' | 'pending' | 'blocking';

export interface PolicyRule {
  /** Stable, not the label — tests and the announcement key on this. */
  id: string;
  /** The rule as readable text. Never signalled by colour alone (NFR-008). */
  label: string;
  status: PolicyRuleStatus;
}

export interface PolicyChecklistProps {
  rules: PolicyRule[];
  /** For the field's `aria-describedby`, so the list is announced as the field's description. */
  id?: string;
  /** The group's accessible name, e.g. "Your password must contain". */
  label?: string;
}

const STATUS_WORD: Record<PolicyRuleStatus, string> = {
  met: 'met',
  pending: 'not yet met',
  blocking: 'not met',
};

function RuleIcon({ status }: { status: PolicyRuleStatus }) {
  if (status === 'met') {
    return (
      <svg
        className="policy-checklist__icon policy-checklist__icon--met"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="8" />
        <path d="M6.5 10.2l2.3 2.3 4.7-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (status === 'blocking') {
    return (
      <svg
        className="policy-checklist__icon policy-checklist__icon--blocking"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="8" />
        <path d="M10 5.5v5" strokeLinecap="round" />
        <path d="M10 13.9v.2" strokeLinecap="round" />
      </svg>
    );
  }

  // pending — a hollow marker. Not the blocking icon's shape: a refused submit must change what
  // is on screen, and reusing the shape at a lighter colour would fail that under NFR-008 too.
  return (
    <svg
      className="policy-checklist__icon policy-checklist__icon--pending"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" />
    </svg>
  );
}

export function PolicyChecklist({ rules, id, label }: PolicyChecklistProps) {
  return (
    <ul
      id={id}
      className="policy-checklist"
      role="group"
      aria-label={label}
      aria-live="polite"
    >
      {rules.map((rule) => (
        <li key={rule.id} data-rule={rule.id} className={`policy-checklist__row policy-checklist__row--${rule.status}`}>
          <RuleIcon status={rule.status} />
          <span>{rule.label}</span>
          <span className="policy-checklist__visually-hidden">: {STATUS_WORD[rule.status]}</span>
        </li>
      ))}
    </ul>
  );
}
