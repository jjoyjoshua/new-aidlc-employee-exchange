/**
 * UserFormDialog — SCR-009, every state a form needs (US-021 built ST-01, ST-03, ST-04, ST-06,
 * ST-08, ST-09; US-023 adds ST-02, the edit mode — ST-05's last-admin refusal is US-024's).
 *
 * One component with a `dialog.mode: 'create' | 'edit'` switch rather than two components —
 * `DeskFormDialog`'s own precedent (US-018 design note §6.1): ST-03, ST-04, ST-06 and ST-08 are
 * byte-identical between modes, and the delta is small and declarative (title, prefilled values,
 * confirm label, whether the password block renders). `mode`/`account` are read off `dialog`
 * itself, not passed as separate props — `UserFormDialogState` already carries both, and a
 * second source for the same fact is exactly what `AccountRow.tsx`'s own "(you)" reasoning
 * argues against (design note §7.3, applied here to mode/subject instead of identity).
 *
 * Composes the shared `Dialog` shell exactly as `DeskFormDialog` does. Owns the fields' local
 * state and CLIENT-side validation — parsed with the SAME `createAccountRequestSchema`/
 * `userUpdateSchema` the route parses with (ADR-002's payoff, `SignIn.tsx`'s own pattern for
 * mapping zod issues to field errors). The password's validity is read straight from
 * `evaluatePasswordPolicy`, mirroring `SetPassword.tsx` — the checklist and the refusal can never
 * disagree because both call the one function. Password/role exist only in create mode.
 *
 * `useUserFormDialog` (the caller) owns the server round trip, busy state and outcome.
 */
import { useId, useRef, useState, type FormEvent } from 'react';
import {
  createAccountRequestSchema,
  evaluatePasswordPolicy,
  userUpdateSchema,
  PASSWORD_RULE_IDS,
  type PasswordRuleId,
  type UserRole,
} from '@desk-booking/contracts';
import { Alert } from '../../components/alert/Alert.js';
import { Button } from '../../components/button/Button.js';
import { Dialog } from '../../components/dialog/Dialog.js';
import { PasswordField } from '../../components/password-field/PasswordField.js';
import { PolicyChecklist, type PolicyRule } from '../../components/policy-checklist/PolicyChecklist.js';
import { TextField } from '../../components/text-field/TextField.js';
import { generatePassword } from '../../lib/generate-password.js';
import {
  ADD_PERSON_TITLE,
  CANCEL_LABEL,
  CREATE_SUBMIT_LABEL,
  DELIVERY_WARNING,
  editPersonTitle,
  EMAIL_HELPER,
  EMAIL_LABEL,
  EMAIL_TAKEN_FIELD_MESSAGE,
  emailTakenMessage,
  FULL_NAME_LABEL,
  INITIAL_PASSWORD_LABEL,
  RESET_PASSWORD_NOTE,
  ROLE_FIELD_DISABLED_REASON,
  ROLE_LEGEND,
  ROLE_OPTION_DESCRIPTION,
  SAVE_CHANGES_LABEL,
  SAVE_FAILED,
  SUGGEST_PASSWORD_LABEL,
} from './copy.js';
import { RadioGroup } from './RadioGroup.js';
import type { CreateAccountFields, UpdateAccountFields, UserFormDialogState } from './use-user-form-dialog.js';
import './user-form.css';

/** SCR-010's copy for each V-12 rule (`RULE_LABELS`), reused verbatim — one vocabulary for the
 *  policy this codebase enforces once, not a second copy of it per screen. */
const RULE_LABELS: Record<PasswordRuleId, string> = {
  length: '8 characters or more',
  upper: 'An upper-case letter',
  lower: 'A lower-case letter',
  digit: 'A number',
  special: 'A special character',
};

export interface UserFormDialogProps {
  dialog: UserFormDialogState;
  onSubmit: (fields: CreateAccountFields | UpdateAccountFields) => void;
  onDismiss: () => void;
  /** US-023/AC-01 (SCR-009:126). Compared against `dialog.account.id` for the "(you)" title
   *  marker — the same `useAuth()`-derived value `AccountRow.tsx`'s own `displayName` compares
   *  against, never a wire field (design note §7.3). Unused in create mode. */
  currentUserId?: string;
}

interface FieldErrors {
  fullName?: string;
  email?: string;
}

export function UserFormDialog({ dialog, onSubmit, onDismiss, currentUserId }: UserFormDialogProps) {
  const isEdit = dialog.mode === 'edit';
  // `dialog.account` is present iff `isEdit` (`UserFormDialogState`'s own invariant) — the `!` is
  // the same shape `DeskFormDialog.tsx` accepts for its own edit-only fields.
  const subject = dialog.account;

  const [fullName, setFullName] = useState(isEdit ? subject!.fullName : '');
  const [email, setEmail] = useState(isEdit ? subject!.email : '');
  const [role, setRole] = useState<UserRole>(isEdit ? subject!.role : 'employee');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [attempted, setAttempted] = useState(false);

  const fullNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const noteId = useId();

  const policy = evaluatePasswordPolicy(password);
  const allMet = PASSWORD_RULE_IDS.every((id) => policy[id]);
  const rules: PolicyRule[] = PASSWORD_RULE_IDS.map((id) => ({
    id,
    label: RULE_LABELS[id],
    status: policy[id] ? 'met' : attempted ? 'blocking' : 'pending',
  }));

  function handleSuggest() {
    setPassword(generatePassword());
    setPasswordVisible(true);
  }

  function focusFirstInvalid(next: FieldErrors) {
    setErrors(next);
    (next.fullName ? fullNameRef : next.email ? emailRef : fullNameRef).current?.focus();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (dialog.busy) return;

    if (isEdit) {
      // US-023/AC-04 — the SAME schema the route parses with (ADR-002). No role, no password:
      // this contract carries neither (design note §3.1).
      const parsed = userUpdateSchema.safeParse({ fullName, email });
      if (!parsed.success) {
        const next: FieldErrors = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0];
          if (field === 'fullName' && !next.fullName) next.fullName = 'Enter a name.';
          if (field === 'email' && !next.email) next.email = 'Enter a valid email address.';
        }
        focusFirstInvalid(next);
        return;
      }
      setErrors({});
      onSubmit({ fullName: parsed.data.fullName, email: parsed.data.email });
      return;
    }

    // Parsed with the SAME schema the route parses with (ADR-002) — never a second, hand-typed
    // rule that could drift from it. Role is a controlled radio and cannot itself be invalid.
    const parsed = createAccountRequestSchema.safeParse({ fullName, email, role, password });

    if (!parsed.success || !allMet) {
      const next: FieldErrors = {};
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'fullName' && !next.fullName) next.fullName = 'Enter a name.';
        if (field === 'email' && !next.email) next.email = 'Enter a valid email address.';
      }
      setAttempted(true);
      focusFirstInvalid(next);
      return;
    }

    setErrors({});
    onSubmit({ fullName: parsed.data.fullName, email: parsed.data.email, role, password });
  }

  const duplicate = dialog.outcome === 'duplicate';
  // Bound to the account AS LOADED, never the live `fullName` input — a title that tracked the
  // field would rename itself mid-keystroke (`DeskFormDialog.tsx`'s own reasoning).
  const title = isEdit ? editPersonTitle(subject!.fullName, subject!.id === currentUserId) : ADD_PERSON_TITLE;

  return (
    <Dialog
      title={title}
      role="dialog"
      busy={dialog.busy}
      onDismiss={onDismiss}
      initialFocusRef={fullNameRef}
      footer={
        <>
          <Button variant="secondary" onClick={onDismiss} disabled={dialog.busy}>
            {CANCEL_LABEL}
          </Button>
          <Button variant="primary" type="submit" form="user-form" busy={dialog.busy}>
            {isEdit ? SAVE_CHANGES_LABEL : CREATE_SUBMIT_LABEL}
          </Button>
        </>
      }
    >
      {duplicate ? (
        <Alert tone="danger" live="assertive">
          {emailTakenMessage(dialog.duplicateFullName ?? '', dialog.duplicateIsActive ?? true)}
        </Alert>
      ) : null}
      {dialog.outcome === 'failed' ? (
        <Alert tone="danger" live="assertive">
          {SAVE_FAILED}
        </Alert>
      ) : null}

      {/* noValidate — keeps type="email" for the mobile keyboard while stopping the browser's
          native validation from preempting our own message and focus move (SignIn.tsx's same
          reasoning). */}
      <form id="user-form" className="user-form" onSubmit={handleSubmit} noValidate>
        <TextField
          label={FULL_NAME_LABEL}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          error={errors.fullName}
          readOnly={dialog.busy}
          inputRef={fullNameRef}
          autoFocus
        />

        <TextField
          label={EMAIL_LABEL}
          type="email"
          helper={EMAIL_HELPER}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email ?? (duplicate ? EMAIL_TAKEN_FIELD_MESSAGE : undefined)}
          invalid={duplicate}
          readOnly={dialog.busy}
          inputRef={emailRef}
          autoComplete="off"
        />

        {/* SCR-009 ST-02: the radios show the current role, but this form cannot save a role
            change (US-024's). ariaDisabled, never native `disabled`, so they stay focusable and
            announce why — ADR-010 (design note §4.3). */}
        <RadioGroup
          legend={ROLE_LEGEND}
          name="role"
          value={role}
          onChange={(value) => setRole(value as UserRole)}
          disabled={dialog.busy}
          ariaDisabled={isEdit}
          {...(isEdit ? { ariaDisabledReason: ROLE_FIELD_DISABLED_REASON } : {})}
          options={[
            { value: 'employee', label: ROLE_OPTION_DESCRIPTION.employee },
            { value: 'admin', label: ROLE_OPTION_DESCRIPTION.admin },
          ]}
        />

        {isEdit ? (
          // SCR-009's own design commitment: no password field and no password rules on the edit
          // form. Changing a password is SCR-008's Reset password action (US-027), which carries
          // BR-001.12's shown-once handling this dialog does not need to duplicate.
          <p className="user-form__reset-password-note">{RESET_PASSWORD_NOTE}</p>
        ) : (
          <>
            <PasswordField
              label={INITIAL_PASSWORD_LABEL}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              visible={passwordVisible}
              onVisibleChange={setPasswordVisible}
              invalid={attempted && !allMet}
              readOnly={dialog.busy}
              autoComplete="new-password"
              describedBy={noteId}
            />

            <div id={noteId}>
              <PolicyChecklist rules={rules} label="Initial password must contain" />
            </div>

            <Button type="button" variant="secondary" onClick={handleSuggest} disabled={dialog.busy}>
              {SUGGEST_PASSWORD_LABEL}
            </Button>

            {/* AC-07 — stated before saving, never only after (BR-001.17, REQ-029). */}
            <Alert tone="warning" live="off">
              {DELIVERY_WARNING}
            </Alert>
          </>
        )}
      </form>
    </Dialog>
  );
}
