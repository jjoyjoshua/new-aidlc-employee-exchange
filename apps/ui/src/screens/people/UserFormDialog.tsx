/**
 * UserFormDialog — SCR-009, create mode only (US-021 builds ST-01, ST-03, ST-04, ST-06, ST-08,
 * ST-09; US-023/US-024 add ST-02/ST-05 when this component grows an edit mode).
 *
 * Composes the shared `Dialog` shell exactly as `DeskFormDialog` does. Owns the four fields'
 * local state and CLIENT-side validation for fullName/email — parsed with the SAME
 * `createAccountRequestSchema` the route parses with (ADR-002's payoff, `SignIn.tsx`'s own
 * pattern for mapping zod issues to field errors). The password's validity is read straight
 * from `evaluatePasswordPolicy`, mirroring `SetPassword.tsx` — the checklist and the refusal
 * can never disagree because both call the one function.
 *
 * `useUserFormDialog` (the caller) owns the server round trip, busy state and outcome.
 */
import { useId, useRef, useState, type FormEvent } from 'react';
import {
  createAccountRequestSchema,
  evaluatePasswordPolicy,
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
  EMAIL_HELPER,
  EMAIL_LABEL,
  EMAIL_TAKEN_FIELD_MESSAGE,
  emailTakenMessage,
  FULL_NAME_LABEL,
  INITIAL_PASSWORD_LABEL,
  ROLE_LEGEND,
  ROLE_OPTION_DESCRIPTION,
  SAVE_FAILED,
  SUGGEST_PASSWORD_LABEL,
} from './copy.js';
import { RadioGroup } from './RadioGroup.js';
import type { CreateAccountFields, UserFormDialogState } from './use-user-form-dialog.js';
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
  onSubmit: (fields: CreateAccountFields) => void;
  onDismiss: () => void;
}

interface FieldErrors {
  fullName?: string;
  email?: string;
}

export function UserFormDialog({ dialog, onSubmit, onDismiss }: UserFormDialogProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('employee');
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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (dialog.busy) return;

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
      setErrors(next);
      setAttempted(true);
      (next.fullName ? fullNameRef : next.email ? emailRef : fullNameRef).current?.focus();
      return;
    }

    setErrors({});
    onSubmit({ fullName: parsed.data.fullName, email: parsed.data.email, role, password });
  }

  const duplicate = dialog.outcome === 'duplicate';

  return (
    <Dialog
      title={ADD_PERSON_TITLE}
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
            {CREATE_SUBMIT_LABEL}
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

        <RadioGroup
          legend={ROLE_LEGEND}
          name="role"
          value={role}
          onChange={(value) => setRole(value as UserRole)}
          disabled={dialog.busy}
          options={[
            { value: 'employee', label: ROLE_OPTION_DESCRIPTION.employee },
            { value: 'admin', label: ROLE_OPTION_DESCRIPTION.admin },
          ]}
        />

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
      </form>
    </Dialog>
  );
}
