/**
 * SCR-010 — Set your password. States ST-01 to ST-06.
 *
 * Reached only while the signed-in account's password is administrator-set (REQ-029,
 * `RequirePasswordChange`). No `app-shell` here — the navigation appears only once the account
 * is the holder's own.
 *
 * The confirm field's mismatch check is client-only (design note §2.2); the five V-12 rules are
 * evaluated by the one shared function both this screen and the server call
 * (`evaluatePasswordPolicy`), so the checklist and the server's refusal can never disagree.
 */
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PASSWORD_RULE_IDS, evaluatePasswordPolicy, type PasswordRuleId } from '@desk-booking/contracts';
import { Alert } from '../../components/alert/Alert.js';
import { Button } from '../../components/button/Button.js';
import { Card } from '../../components/card/Card.js';
import { LoginBackdrop } from '../../components/login-backdrop/LoginBackdrop.js';
import { PasswordField } from '../../components/password-field/PasswordField.js';
import { PolicyChecklist, type PolicyRule } from '../../components/policy-checklist/PolicyChecklist.js';
import { useAuth } from '../../lib/auth/auth-context.js';
import { landingPathFor } from '../../lib/auth/landing.js';
import './set-password.css';

/** SCR-010's copy for each V-12 rule, keyed on the stable id the contract exports (US-001/D-10). */
const RULE_LABELS: Record<PasswordRuleId, string> = {
  length: '8 characters or more',
  upper: 'An upper-case letter',
  lower: 'A lower-case letter',
  digit: 'A number',
  special: 'A special character',
};

/** ST-03's copy — the one refusal only the server can produce (V-15). */
const SAME_AS_CURRENT =
  "That's the password your admin gave you. Choose a different one — the point is that only you know it.";

/** ST-06's copy. True regardless of cause: the old password is untouched until the write succeeds. */
const SAVE_FAILED = "We couldn't save that just now. The password you signed in with still works. Try again.";

type FormState = 'idle' | 'submitting' | 'same-as-current' | 'failed';

export function SetPassword() {
  const { setPassword, signOut } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [state, setState] = useState<FormState>('idle');

  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const submitting = state === 'submitting';
  const policy = evaluatePasswordPolicy(newPassword);
  const allMet = PASSWORD_RULE_IDS.every((id) => policy[id]);

  const rules: PolicyRule[] = PASSWORD_RULE_IDS.map((id) => ({
    id,
    label: RULE_LABELS[id],
    // Met rules never move once they are met, whether or not a submit has been refused —
    // SCR-010 ST-02 is explicit about this. Unmet rules are pending until a submit is refused,
    // then blocking (three looks, not two — see PolicyChecklist).
    status: policy[id] ? 'met' : attempted ? 'blocking' : 'pending',
  }));

  async function attempt() {
    const matches = newPassword.length > 0 && newPassword === confirmPassword;

    if (!allMet || !matches) {
      setAttempted(true);
      setMismatch(!matches);
      setState('idle');
      // Focus moves to the first field still needing attention.
      (allMet ? confirmPasswordRef : newPasswordRef).current?.focus();
      return;
    }

    setState('submitting');
    const result = await setPassword(newPassword);

    if (result.kind === 'ok') {
      navigate(landingPathFor(result.user), { replace: true, state: { toast: 'password-saved' } });
      return;
    }

    if (result.kind === 'same-as-current') {
      // Whatever was typed is now known to be the wrong value.
      setNewPassword('');
      setConfirmPassword('');
      setAttempted(false);
      setMismatch(false);
      setState('same-as-current');
      newPasswordRef.current?.focus();
      return;
    }

    // ST-06: both fields keep their contents — a compliant password retyped from memory tends
    // to be a weaker one.
    setState('failed');
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    void attempt();
  }

  return (
    <main className="set-password">
      <LoginBackdrop />

      <div className="set-password__column">
        <header className="set-password__lockup">
          <h1 className="set-password__product">Desk Booking</h1>
        </header>

        <Card as="form" onSubmit={onSubmit} noValidate>
          <div className="set-password__intro-group">
            <h2 className="set-password__heading">Choose your own password</h2>
            <p className="set-password__intro">
              Your admin set the one you just used. Pick a new one only you know.
            </p>
          </div>

          {state === 'same-as-current' ? <Alert>{SAME_AS_CURRENT}</Alert> : null}
          {state === 'failed' ? <Alert>{SAVE_FAILED}</Alert> : null}

          <div className="set-password__fields">
            <div className="set-password__new-password-group">
              <PasswordField
                label="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                inputRef={newPasswordRef}
                // Invalid styling only — the checklist beneath is this field's message (design
                // note §7.6; TextField's `invalid` prop exists for exactly this).
                invalid={attempted && !allMet}
                readOnly={submitting}
                autoComplete="new-password"
                autoFocus
              />

              <PolicyChecklist
                rules={rules}
                label="Your password must contain"
                id="set-password-policy"
              />
            </div>

            <PasswordField
              label="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              inputRef={confirmPasswordRef}
              error={attempted && mismatch ? "These don't match." : undefined}
              readOnly={submitting}
              autoComplete="new-password"
            />
          </div>

          <Button type="submit" size="lg" block busy={submitting}>
            Save and continue
          </Button>

          <p className="set-password__warning">
            There&apos;s no self-service reset — if you forget this, your office admin has to
            reset it.
          </p>
        </Card>

        {/* Outside the card, deliberately: a way out, not a step (SCR-010 decisions table). */}
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
